// Persistence contract: a versioned state blob in a Storage-like object (browser localStorage). Invalid or newer
// data is never overwritten or wiped silently: load() reports it, save() refuses until the user quarantines it
// (copies the raw text to a backup key first). Writes detect another tab having saved in between (rev check).
import { LIMITS, STORAGE_KEY, STORE_VERSION, normalizeSession } from "./model.mjs";

export const emptyState = () => ({ version: STORE_VERSION, rev: 0, activeId: null, sessions: [] });
// Load and save share these limits, so save() never writes data that load() would then reject.
export const MAX_STORED_CHARS = LIMITS.importBytes * 2;
const normRev = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);

export function parseStoredState(raw, nowMs = Date.now()) {
	const fail = (m) => ({ ok: false, errors: [m], warnings: [] });
	if (typeof raw !== "string") return fail("Stored value is not text");
	if (raw.length > MAX_STORED_CHARS) return fail("Stored data is unexpectedly large");
	let data;
	try {
		data = JSON.parse(raw);
	} catch (err) {
		return fail(`Stored data is not valid JSON: ${err.message}`);
	}
	if (!data || typeof data !== "object" || Array.isArray(data)) return fail("Stored data is not an object");
	if (data.version !== STORE_VERSION) return fail(`Stored data has version ${data.version}; this app reads version ${STORE_VERSION}`);
	if (!Array.isArray(data.sessions) || data.sessions.length > LIMITS.sessions) return fail("Stored sessions are missing or too many");
	const errors = [], warnings = [], sessions = [], ids = new Set();
	for (const [i, raws] of data.sessions.entries()) {
		const r = normalizeSession(raws, nowMs);
		errors.push(...r.errors.map((m) => `Session ${i + 1}: ${m}`));
		warnings.push(...r.warnings.map((m) => `Session ${i + 1}: ${m}`));
		if (!r.session) continue;
		if (ids.has(r.session.id)) errors.push(`Session ${i + 1}: duplicate id ${r.session.id}`);
		ids.add(r.session.id);
		sessions.push(r.session);
	}
	if (errors.length) return { ok: false, errors, warnings };
	const rev = normRev(data.rev);
	const activeId = typeof data.activeId === "string" && ids.has(data.activeId) ? data.activeId : null;
	return { ok: true, state: { version: STORE_VERSION, rev, activeId, sessions }, errors, warnings };
}

export function createStore(storage, key = STORAGE_KEY) {
	let lastRev = 0;
	let blocked = null;
	const describe = (code, err) => ({ code, message: err instanceof Error ? err.message : String(err) });

	function load() {
		let raw;
		try {
			raw = storage.getItem(key);
		} catch (err) {
			blocked = describe("unavailable", err);
			return { state: emptyState(), error: blocked, raw: null, warnings: [] };
		}
		if (raw == null) {
			lastRev = 0;
			blocked = null;
			return { state: emptyState(), error: null, raw: null, warnings: [] };
		}
		const r = parseStoredState(raw);
		if (!r.ok) {
			blocked = { code: "corrupt", message: r.errors.join("; ") };
			return { state: emptyState(), error: blocked, raw, warnings: r.warnings };
		}
		lastRev = r.state.rev;
		blocked = null;
		return { state: r.state, error: null, raw: null, warnings: r.warnings };
	}

	function save(state) {
		if (blocked) return { ok: false, error: blocked };
		if (state.sessions.length > LIMITS.sessions) {
			return { ok: false, error: { code: "too-large", message: `More than ${LIMITS.sessions} sessions cannot be saved in this browser. Export a backup and delete some sessions.` } };
		}
		try {
			const next = { ...state, version: STORE_VERSION, rev: lastRev + 1 };
			const text = JSON.stringify(next);
			if (text.length > MAX_STORED_CHARS) {
				return { ok: false, error: { code: "too-large", message: "Saved data would exceed this studio's size limit, so it was not written. Export a backup and delete or shorten sessions." } };
			}
			const current = storage.getItem(key);
			if (current != null) {
				let rev = null;
				try {
					rev = normRev(JSON.parse(current)?.rev);
				} catch {
					return { ok: false, error: (blocked = { code: "corrupt", message: "Stored data changed and is no longer valid JSON" }) };
				}
				if (rev !== lastRev) return { ok: false, error: { code: "conflict", message: "Another tab saved newer data. Reload to continue." } };
			} else if (lastRev !== 0) {
				return { ok: false, error: { code: "conflict", message: "Stored data was removed elsewhere. Export a backup, then reload." } };
			}
			storage.setItem(key, text);
			lastRev = next.rev;
			state.rev = next.rev;
			return { ok: true };
		} catch (err) {
			return { ok: false, error: describe(err?.name === "QuotaExceededError" ? "quota" : "write-failed", err) };
		}
	}

	// Copies the unreadable raw value to a backup key and only then clears the main key. Fails closed.
	function quarantine(nowMs = Date.now()) {
		if (!blocked || blocked.code !== "corrupt") return { ok: false, error: { code: "not-corrupt", message: "Nothing to quarantine" } };
		try {
			const raw = storage.getItem(key);
			const backupKey = `${key}.corrupt.${nowMs}`;
			if (raw != null) {
				storage.setItem(backupKey, raw);
				if (storage.getItem(backupKey) !== raw) throw new Error("Backup copy could not be verified");
			}
			storage.removeItem(key);
			blocked = null;
			lastRev = 0;
			return { ok: true, backupKey };
		} catch (err) {
			return { ok: false, error: describe("write-failed", err) };
		}
	}

	return { load, save, quarantine, get blocked() { return blocked; } };
}

export function memoryStorage() {
	const m = new Map();
	return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) };
}
