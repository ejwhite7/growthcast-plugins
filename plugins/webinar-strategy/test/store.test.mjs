// node:test coverage for the persistence contract (versioning, corruption handling, conflicts, storage errors). NOT YET RUN.
import test from "node:test";
import assert from "node:assert/strict";
import { createStore, emptyState, memoryStorage, parseStoredState } from "../studio/store.mjs";
import { STORAGE_KEY, newSession } from "../studio/model.mjs";

const NOW = Date.UTC(2026, 9, 23, 12, 0, 0);

test("empty storage loads an empty state without writing", () => {
	const mem = memoryStorage();
	const { state, error } = createStore(mem).load();
	assert.equal(error, null);
	assert.deepEqual(state, emptyState());
	assert.equal(mem.getItem(STORAGE_KEY), null);
});

test("save then load round-trips sessions and bumps the revision", () => {
	const mem = memoryStorage();
	const a = createStore(mem);
	const { state } = a.load();
	state.sessions.push(newSession("One", NOW));
	assert.deepEqual(a.save(state), { ok: true });
	assert.equal(state.rev, 1);
	state.sessions[0].event.publicTitle = "Edited";
	assert.equal(a.save(state).ok, true);
	const reloaded = createStore(mem).load();
	assert.equal(reloaded.error, null);
	assert.equal(reloaded.state.rev, 2);
	assert.equal(reloaded.state.sessions[0].event.publicTitle, "Edited");
});

test("corrupt JSON is reported, never overwritten, and save refuses", () => {
	const mem = memoryStorage();
	mem.setItem(STORAGE_KEY, "{not json");
	const s = createStore(mem);
	const r = s.load();
	assert.equal(r.error.code, "corrupt");
	assert.equal(r.raw, "{not json");
	const res = s.save(emptyState());
	assert.equal(res.ok, false);
	assert.equal(mem.getItem(STORAGE_KEY), "{not json", "original data untouched");
});

test("quarantine backs the raw value up before clearing, then saving works", () => {
	const mem = memoryStorage();
	mem.setItem(STORAGE_KEY, "garbage");
	const s = createStore(mem);
	s.load();
	const q = s.quarantine(12345);
	assert.equal(q.ok, true);
	assert.equal(mem.getItem(q.backupKey), "garbage");
	assert.equal(mem.getItem(STORAGE_KEY), null);
	assert.equal(s.save(emptyState()).ok, true);
});

test("quarantine fails closed when the backup cannot be written", () => {
	const mem = memoryStorage();
	mem.setItem(STORAGE_KEY, "garbage");
	const s = createStore({ getItem: (k) => mem.getItem(k), removeItem: (k) => mem.removeItem(k), setItem: () => { throw new Error("full"); } });
	s.load();
	assert.equal(s.quarantine().ok, false);
	assert.equal(mem.getItem(STORAGE_KEY), "garbage");
});

test("quarantine does nothing when data is not corrupt", () => {
	const s = createStore(memoryStorage());
	s.load();
	assert.equal(s.quarantine().ok, false);
});

test("a newer stored version or an invalid session blocks loading rather than being dropped", () => {
	for (const raw of [JSON.stringify({ version: 2, sessions: [] }), JSON.stringify({ version: 1, sessions: [{ id: "../x" }] }), JSON.stringify({ version: 1, sessions: "no" }), "[]"]) {
		const mem = memoryStorage();
		mem.setItem(STORAGE_KEY, raw);
		const s = createStore(mem);
		assert.equal(s.load().error.code, "corrupt", raw);
		assert.equal(s.save(emptyState()).ok, false);
		assert.equal(mem.getItem(STORAGE_KEY), raw);
	}
});

test("duplicate session ids in stored data are rejected", () => {
	const a = newSession("A", NOW);
	const r = parseStoredState(JSON.stringify({ version: 1, rev: 0, sessions: [a, a] }));
	assert.equal(r.ok, false);
	assert.match(r.errors.join(" "), /duplicate/);
});

test("a second tab saving first produces a conflict instead of clobbering", () => {
	const mem = memoryStorage();
	const a = createStore(mem), b = createStore(mem);
	const sa = a.load().state, sb = b.load().state;
	sa.sessions.push(newSession("From A", NOW));
	assert.equal(a.save(sa).ok, true);
	sb.sessions.push(newSession("From B", NOW));
	const res = b.save(sb);
	assert.equal(res.ok, false);
	assert.equal(res.error.code, "conflict");
	assert.equal(createStore(mem).load().state.sessions[0].event.internalName, "From A");
});

test("quota and unavailable storage surface as errors, not exceptions", () => {
	const quota = createStore({ getItem: () => null, removeItem() {}, setItem() { throw Object.assign(new Error("full"), { name: "QuotaExceededError" }); } });
	quota.load();
	const r = quota.save(emptyState());
	assert.equal(r.ok, false);
	assert.equal(r.error.code, "quota");
	const dead = createStore({ getItem() { throw new Error("denied"); }, setItem() {}, removeItem() {} });
	const loaded = dead.load();
	assert.equal(loaded.error.code, "unavailable");
	assert.equal(dead.save(emptyState()).ok, false);
});

test("stored sessions with coerced values load with warnings", () => {
	const a = newSession("A", NOW);
	a.event.visibility = "everyone";
	const r = parseStoredState(JSON.stringify({ version: 1, rev: 3, activeId: a.id, sessions: [a] }));
	assert.equal(r.ok, true);
	assert.equal(r.state.sessions[0].event.visibility, "draft");
	assert.ok(r.warnings.length);
	assert.equal(r.state.rev, 3);
	assert.equal(r.state.activeId, a.id);
});
