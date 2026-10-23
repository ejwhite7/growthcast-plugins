// node:test regressions for the 2026-10-23 review findings (size limits, normalization warnings, time-zone case,
// revision handling, private-link variants, HOST fallback). NOT YET RUN.
import test from "node:test";
import assert from "node:assert/strict";
import { LIMITS, STORAGE_KEY, canonicalTimeZone, newSession, normalizeSession, parseImport } from "../studio/model.mjs";
import { MAX_STORED_CHARS, createStore, emptyState, memoryStorage, parseStoredState } from "../studio/store.mjs";
import { findLeaks, privateUrlVariants, publicPage, webhookSpec } from "../studio/exports.mjs";
import { listenHost } from "../tools/studio.mjs";

const NOW = Date.UTC(2026, 9, 23, 12, 0, 0);

test("save refuses more sessions than load accepts, leaving stored data untouched", () => {
	const mem = memoryStorage();
	const store = createStore(mem);
	const { state } = store.load();
	state.sessions.push(newSession("Kept", NOW));
	assert.equal(store.save(state).ok, true);
	const before = mem.getItem(STORAGE_KEY);
	for (let i = 0; i < LIMITS.sessions; i++) state.sessions.push(newSession(`S${i}`, NOW));
	const r = store.save(state);
	assert.equal(r.ok, false);
	assert.equal(r.error.code, "too-large");
	assert.equal(mem.getItem(STORAGE_KEY), before);
	state.sessions.length = 1;
	assert.equal(store.save(state).ok, true, "saving works again once back within the limit");
	assert.equal(createStore(mem).load().error, null);
});

test("save refuses data longer than load accepts", () => {
	const mem = memoryStorage();
	const store = createStore(mem);
	const { state } = store.load();
	const r = store.save({ ...state, padding: "x".repeat(MAX_STORED_CHARS) });
	assert.equal(r.ok, false);
	assert.equal(r.error.code, "too-large");
	assert.equal(mem.getItem(STORAGE_KEY), null);
});

test("anything save() writes is accepted by parseStoredState at the limit", () => {
	const mem = memoryStorage();
	const store = createStore(mem);
	const { state } = store.load();
	for (let i = 0; i < LIMITS.sessions; i++) state.sessions.push(newSession(`S${i}`, NOW));
	assert.equal(store.save(state).ok, true);
	assert.equal(parseStoredState(mem.getItem(STORAGE_KEY)).ok, true);
});

test("a stored blob without an integer rev does not cause a permanent conflict", () => {
	for (const rev of [undefined, "3", -1, 1.5, null]) {
		const mem = memoryStorage();
		mem.setItem(STORAGE_KEY, JSON.stringify({ version: 1, rev, activeId: null, sessions: [] }));
		const store = createStore(mem);
		const { state, error } = store.load();
		assert.equal(error, null);
		assert.equal(store.save(state).ok, true, `rev ${rev}`);
		assert.equal(store.save(state).ok, true, `second save, rev ${rev}`);
	}
	assert.deepEqual(emptyState().rev, 0);
});

test("normalizeSession warns whenever it shortens, drops or resets a value", () => {
	const s = newSession("A", NOW);
	const cases = [
		["event.recurrence", (x) => (x.event.recurrence = "r".repeat(301)), (n) => n.event.recurrence === "" && n.event.recurrenceLegacy.length === 300],
		["rsvp.formVersion", (x) => (x.rsvp.formVersion = "v".repeat(41)), (n) => n.rsvp.formVersion.length === 40],
		["event.slug", (x) => (x.event.slug = "s".repeat(81)), (n) => n.event.slug.length === 80],
		["event.topics", (x) => (x.event.topics = ["t".repeat(61)]), (n) => n.event.topics[0].length === 60],
		["event.hosts", (x) => (x.event.hosts = Array.from({ length: LIMITS.list + 1 }, (_, i) => `h${i}`)), (n) => n.event.hosts.length === LIMITS.list],
		["durationMin", (x) => (x.event.durationMin = 1.5), (n) => n.event.durationMin === 45],
		["offset", (x) => (x.reminders[1].offsetMinutes = 600_000), (n) => n.reminders[1].offsetMinutes === 0],
		["tasks", (x) => x.tasks.push(...Array.from({ length: LIMITS.tasks }, (_, i) => ({ ...x.tasks[0], id: `extra-${i}` }))), (n) => n.tasks.length === LIMITS.tasks],
	];
	for (const [label, mutate, check] of cases) {
		const raw = structuredClone(s);
		mutate(raw);
		const r = normalizeSession(raw, NOW);
		assert.ok(check(r.session), `${label} coerced`);
		assert.ok(r.warnings.length > 0, `${label} produced a warning`);
	}
	assert.deepEqual(normalizeSession(structuredClone(s), NOW).warnings, [], "a clean session has no warnings");
});

test("import surfaces truncation warnings instead of shortening silently", () => {
	const s = newSession("A", NOW);
	s.event.recurrence = "r".repeat(400);
	const r = parseImport(JSON.stringify({ app: "webinar-strategy", kind: "session", version: 1, session: s }), NOW);
	assert.equal(r.ok, true);
	assert.match(r.warnings.join(" "), /recurrence/);
});

test("time zones are stored and exported in canonical case", () => {
	assert.equal(canonicalTimeZone("america/new_york"), "America/New_York");
	assert.equal(canonicalTimeZone("UTC"), "UTC");
	assert.equal(canonicalTimeZone("Not/AZone"), "Not/AZone", "invalid zones are left for validation to report");
	const s = newSession("A", NOW);
	Object.assign(s.event, { date: "2026-12-01", time: "14:00", timeZone: "america/new_york" });
	assert.equal(normalizeSession(s, NOW).session.event.timeZone, "America/New_York");
	assert.equal(publicPage(s).data.page.logistics.timeZone, "America/New_York");
	assert.equal(webhookSpec(s).example.occurrence.timeZone, "America/New_York");
});

function withJoin(join, publicText) {
	const s = newSession("A", NOW);
	Object.assign(s.event, { publicTitle: "T", joinUrl: join, shortDescription: publicText });
	return findLeaks(publicPage(s).data, s);
}

test("leak check catches partial and scheme-less forms of private links", () => {
	const join = "https://zoom.us/j/123456789?pwd=SECRET";
	for (const pasted of ["https://zoom.us/j/123456789", "zoom.us/j/123456789", "Join: ZOOM.US/j/123456789 now", "www.zoom.us/j/123456789", "http://zoom.us/j/123456789/", "zoom.us/j/123456789?pwd=SECRET"]) {
		assert.equal(withJoin(join, pasted).length, 1, pasted);
	}
	assert.equal(withJoin("https://meet.example.com/?room=SECRET", "meet.example.com/?room=SECRET").length, 1, "root path with a query");
});

test("leak check does not block ordinary links to a public site", () => {
	assert.deepEqual(withJoin("https://zoom.us/j/123456789", "Learn more at https://zoom.us/ or zoom.us/pricing"), []);
	assert.deepEqual(withJoin("https://example.com/", "See https://example.com/blog"), [], "a bare-origin private URL never matches");
	assert.deepEqual(privateUrlVariants("https://example.com"), []);
	assert.deepEqual(privateUrlVariants("tbd"), [], "non-URL text is not treated as a link");
});

test("only STUDIO_HOST can change the bind address; a generic HOST is ignored", () => {
	assert.equal(listenHost({}), "127.0.0.1");
	assert.equal(listenHost({ HOST: "0.0.0.0" }), "127.0.0.1");
	assert.equal(listenHost({ HOST: "0.0.0.0", STUDIO_HOST: "::1" }), "::1");
});
