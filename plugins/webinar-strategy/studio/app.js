// Webinar Strategy studio (browser). Plain DOM, no framework, no innerHTML: every user string goes through textContent.
// Data lives in this browser's localStorage (see store.mjs). Nothing is published, collected or sent from here.
import {
	DEFAULT_REMINDERS, DEFAULT_TASKS, FIELD_MODES, FORMATS, LIMITS, MAX_OFFSET_MIN, PLANNING_STATES, RECURRENCE_CADENCES, REMINDER_AUDIENCES, RSVP_FIELDS, STAGES, TASK_ROLES, TASK_STATUS, VISIBILITY,
	SUPERSEDED_TASKS, TASK_TEMPLATE_VERSION, applyTaskUpgrade, dependencyIssues, dependencyRefusal, dependentsOf, planTaskUpgrade, unmetDependencies,
	allHosts, allTopics, cadenceLabel, duplicateSession, filterSessions, formatInZone, mergeImported, newId, newSession, overdueTasks, parseImport, progress,
	readiness, relativeTo, reminderTimes, resolveSchedule, safeUrl, sessionStatus, slugify, todayUtc, validId, validateSession,
} from "./model.mjs";
import { createStore, memoryStorage } from "./store.mjs";
import { CANVAS, CAPABILITIES, DESTINATION_NOTE, EDGES, NODES, SIGNAL_COPY, TIER_INFO, VENDORS, capabilitiesForTier } from "./content.mjs";
import { PRIVATE_BANNER, PUBLIC_BANNER, SHARE_CAUTION, backupExport, markdownHandoff, publicPage, safeFilename, sessionExport, shareArtifact, webhookSpec } from "./exports.mjs";

// ---------- tiny DOM helper ----------
function h(tag, props, ...kids) {
	const el = document.createElement(tag);
	for (const [k, v] of Object.entries(props ?? {})) {
		if (v == null || v === false) continue;
		if (k === "class") el.className = v;
		else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
		else if (k === "value") el.value = v;
		else if (k === "checked") el.checked = true;
		else if (k === "disabled") el.disabled = true;
		else el.setAttribute(k, v === true ? "" : String(v));
	}
	for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid);
	return el;
}
const $ = (sel) => document.querySelector(sel);
const chip = (text, cls = "") => h("span", { class: `chip ${cls}` }, text);
const nowMs = () => Date.now();

// ---------- state and persistence ----------
function pickStorage() {
	try {
		const s = window.localStorage;
		s.setItem("__ws_probe", "1");
		s.removeItem("__ws_probe");
		return { storage: s, ok: true };
	} catch {
		return { storage: memoryStorage(), ok: false };
	}
}
const { storage, ok: storageOk } = pickStorage();
const store = createStore(storage);
let state, loadResult;
let updaters = [];
let fieldReg = new Map();

function boot() {
	loadResult = store.load();
	state = loadResult.state;
	if (!storageOk) showBanner("Browser storage is unavailable here, so nothing will be kept after you close this tab. Use Export backup to keep your work.");
	else if (loadResult.error?.code === "corrupt") showCorruptBanner();
	else if (loadResult.error) showBanner(`Stored data could not be read: ${loadResult.error.message}`, true);
	else if (loadResult.warnings?.length) showBanner(`Some stored values were adjusted while loading: ${loadResult.warnings.slice(0, 3).join("; ")}${loadResult.warnings.length > 3 ? "…" : ""}`);
	else showBanner(null);
}
function showBanner(text, isErr = false, ...actions) {
	const b = $("#banner");
	if (!text) return void (b.hidden = true);
	b.className = `banner${isErr ? " err" : ""}`;
	b.replaceChildren(h("span", null, text), ...actions);
	b.hidden = false;
}
function showCorruptBanner() {
	showBanner(
		`Saved data in this browser could not be read (${loadResult.error.message}). It has NOT been changed and nothing new will be saved until you decide.`, true,
		h("button", { type: "button", class: "sm", onclick: () => download("webinar-strategy-unreadable-data.txt", loadResult.raw ?? "", "text/plain") }, "Download raw data"),
		h("button", { type: "button", class: "sm", onclick: quarantineDialog }, "Back up and start fresh…"),
	);
}
function quarantineDialog() {
	dialog("Back up and start fresh?", [h("p", null, "The unreadable data is copied to a separate backup key in this browser first, then the main data is cleared so you can start again. Download the raw data first if you want a file copy.")], [
		{ label: "Cancel" },
		{ label: "Back up and start fresh", cls: "primary", run: () => {
			const r = store.quarantine(nowMs());
			if (!r.ok) return showBanner(`Could not back up the data, so it was left untouched: ${r.error.message}`, true);
			boot();
			go("#why");
			render();
		} },
	]);
}
function setSave(r) {
	const el = $("#saveState");
	if (r.ok) {
		el.textContent = storageOk ? "Saved to this browser" : "Not persisted (storage unavailable)";
		if (r.ok && $("#banner").classList.contains("err") && store.blocked == null && !loadResult.error) showBanner(null);
		return;
	}
	el.textContent = "Not saved";
	if (r.error.code === "corrupt") return showCorruptBanner();
	const text = { conflict: r.error.message, "too-large": r.error.message, quota: "Browser storage is full, so the latest change is not saved. Export a backup and free space.", unavailable: "Browser storage is unavailable." }[r.error.code] ?? `The latest change could not be saved: ${r.error.message}`;
	showBanner(text, true, backupButton(), r.error.code === "conflict" ? reloadButton() : null);
}
// Reloading discards this tab's unsaved edits, so the backup of this tab's state is offered beside it.
const backupButton = () => h("button", { type: "button", class: "sm", onclick: () => download("webinar-strategy-backup.json", JSON.stringify(backupExport(state.sessions, nowMs()), null, 2)) }, "Export this tab's backup");
const reloadButton = () => h("button", { type: "button", class: "sm", onclick: () => location.reload() }, "Reload (discards unsaved edits here)");
// Adds sessions only if the result can actually be saved; otherwise state is left as it was and the reason is shown.
function addSessions(next) {
	if (next.length > LIMITS.sessions) {
		showBanner(`This browser can hold at most ${LIMITS.sessions} sessions, so nothing was added. Export a backup and delete sessions first.`, true);
		return false;
	}
	const prev = state.sessions;
	state.sessions = next;
	const r = store.save(state);
	if (!r.ok && r.error.code === "too-large") {
		state.sessions = prev;
		showBanner(`Nothing was added: ${r.error.message}`, true);
		return false;
	}
	setSave(r);
	return true;
}
function commit() {
	const s = currentSession();
	if (s) s.updatedAt = new Date().toISOString();
	setSave(store.save(state));
	runUpdaters();
	renderSide();
}

// ---------- routing ----------
function route() {
	const p = location.hash.slice(1).split("/");
	if (p[0] === "s" && validId(p[1])) return { name: "session", id: p[1], tab: TABS.some((t) => t[0] === p[2]) ? p[2] : "overview" };
	if (p[0] === "library") return { name: "library" };
	if (p[0] === "why") return { name: "why" };
	return state.sessions.length ? { name: "library" } : { name: "why" };
}
const go = (hash) => void (location.hash = hash);
const currentSession = () => {
	const r = route();
	return r.name === "session" ? state.sessions.find((s) => s.id === r.id) ?? null : null;
};
const TABS = [["overview", "Overview"], ["brief", "Event brief"], ["rsvp", "RSVP form"], ["tier", "Tier & tools"], ["workflow", "Workflow"], ["reminders", "Reminders & reuse"], ["preview", "Page preview"], ["export", "Export"]];

// ---------- dialogs, downloads ----------
function dialog(title, body, actions) {
	const d = $("#dlg");
	d.replaceChildren(
		h("h2", { id: "dlgTitle" }, title), ...[].concat(body),
		h("div", { class: "acts" }, actions.map((a) => h("button", { type: "button", class: a.cls ?? "", onclick: (ev) => {
			if (a.keep) return a.run?.(ev);
			d.close();
			a.run?.(ev);
		} }, a.label))),
	);
	d.showModal();
}
function download(name, text, type = "application/json") {
	const url = URL.createObjectURL(new Blob([text], { type }));
	const a = h("a", { href: url, download: name });
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ---------- form fields ----------
const get = (o, path) => path.split(".").reduce((x, k) => x?.[k], o);
function set(o, path, v) {
	const ks = path.split(".");
	const last = ks.pop();
	ks.reduce((x, k) => x[k], o)[last] = v;
}
function field(s, path, label, o = {}) {
	const id = `f-${path.replace(/\./g, "-")}`;
	const type = o.type ?? "text";
	const val = get(s, path);
	let input;
	if (type === "textarea" || type === "lines") input = h("textarea", { id, rows: o.rows ?? 3, maxlength: o.max ?? LIMITS.text });
	else if (type === "select") input = h("select", { id }, o.options.map(([v, l]) => h("option", { value: v }, l)));
	else if (type === "checkbox") input = h("input", { id, type: "checkbox" });
	else input = h("input", { id, type: ["date", "time", "number"].includes(type) ? type : "text", maxlength: o.max ?? (type === "url" ? LIMITS.url : LIMITS.short), list: o.list, placeholder: o.placeholder, autocomplete: "off", inputmode: type === "url" ? "url" : null });
	if (type === "checkbox") input.checked = !!val;
	else if (type === "list") input.value = (val ?? []).join(", ");
	else if (type === "lines") input.value = (val ?? []).join("\n");
	else input.value = val ?? "";
	const hint = o.hint ? h("span", { class: "hint", id: `${id}-hint` }, o.hint) : null;
	const err = h("span", { class: "err", id: `${id}-err` });
	const limitNote = h("span", { class: "hint", id: `${id}-limit`, "aria-live": "polite" });
	input.setAttribute("aria-describedby", [hint ? `${id}-hint` : "", `${id}-err`, `${id}-limit`].filter(Boolean).join(" "));
	const apply = () => {
		let v;
		if (type === "checkbox") v = input.checked;
		else if (type === "list" || type === "lines") {
			// Same per-item and count limits as normalizeSession, so nothing changes on reload; say so when they bite.
			const items = input.value.split(type === "list" ? "," : "\n").map((x) => x.trim()).filter(Boolean);
			v = items.slice(0, LIMITS.list).map((x) => x.slice(0, o.itemMax ?? 80));
			const cut = items.length > LIMITS.list || items.slice(0, LIMITS.list).some((x) => x.length > (o.itemMax ?? 80));
			limitNote.textContent = cut ? `Only the first ${LIMITS.list} entries, up to ${o.itemMax ?? 80} characters each, are kept.` : "";
		}
		else if (type === "number") v = input.value === "" ? 0 : Number(input.value);
		else v = input.value;
		set(s, path, v);
		o.after?.(v, input);
		commit();
	};
	input.addEventListener(type === "select" || type === "checkbox" ? "change" : "input", apply);
	fieldReg.set(path, { input, err });
	const tag = o.private ? h("span", { class: "tag-private" }, "PRIVATE") : null;
	const wrap = type === "checkbox"
		? h("div", { class: `field${o.span2 ? " span2" : ""}` }, h("label", { for: id, class: "row" }, input, label, tag), hint, err)
		: h("div", { class: `field${o.span2 ? " span2" : ""}` }, h("label", { for: id, class: "lab" }, label, tag), input, hint, err, limitNote);
	wrap.syncInput = input;
	return wrap;
}
function showFieldErrors(s) {
	const errs = new Map(validateSession(s).map((e) => [e.path, e.message]));
	for (const [path, { input, err }] of fieldReg) {
		const m = errs.get(path);
		err.textContent = m ?? "";
		if (m) input.setAttribute("aria-invalid", "true");
		else input.removeAttribute("aria-invalid");
	}
}
function runUpdaters() {
	const s = currentSession();
	if (s) showFieldErrors(s);
	for (const u of updaters) u();
	const r = route();
	$("#crumb").textContent = r.name === "session" && s ? (s.event.publicTitle || s.event.internalName || s.id) : r.name === "library" ? "Library" : "Why virtual events";
}
function barEl(pct) {
	const i = h("i");
	const b = h("div", { class: "bar", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": pct, "aria-label": "Progress" }, i);
	i.style.width = `${pct}%`;
	b.setPct = (p) => {
		i.style.width = `${p}%`;
		b.setAttribute("aria-valuenow", p);
	};
	return b;
}

// ---------- sidebar ----------
function renderSide() {
	const r = route();
	const side = $("#side");
	const sessions = [...state.sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	const fileInput = h("input", { type: "file", id: "importFile", accept: "application/json,.json", hidden: true, "aria-label": "Import backup file", onchange: onImportFile });
	side.replaceChildren(
		h("nav", { "aria-label": "Studio" },
			h("a", { class: "nav-link", href: "#why", "aria-current": r.name === "why" ? "page" : null }, "Why virtual events"),
			h("a", { class: "nav-link", href: "#library", "aria-current": r.name === "library" ? "page" : null }, `Library (${state.sessions.length})`)),
		h("h4", null, "Sessions"),
		h("button", { type: "button", class: "primary", id: "newSession", onclick: newSessionDialog }, "+ New session"),
		sessions.length ? null : h("p", { class: "muted small" }, "No sessions yet. Create one to start planning."),
		h("div", { id: "sessionList" }, sessions.map((s) => {
			const pr = progress(s);
			return h("a", { class: "s-item", href: `#s/${s.id}/overview`, "aria-current": r.name === "session" && r.id === s.id ? "page" : null },
				h("b", null, s.event.publicTitle || s.event.internalName || "Untitled session"),
				h("small", null, `${sessionStatus(s, nowMs()).label} · ${pr.pct}% done`), barEl(pr.pct));
		})),
		h("h4", null, "Backup"),
		h("div", { class: "row" },
			h("button", { type: "button", class: "sm", onclick: () => $("#importFile").click() }, "Import…"),
			h("button", { type: "button", class: "sm", disabled: !state.sessions.length, onclick: () => download("webinar-strategy-backup.json", JSON.stringify(backupExport(state.sessions), null, 2)) }, "Export backup")),
		fileInput,
		h("p", { class: "foot" }, "Data is saved only in this browser. Backups contain private links: keep them private."),
	);
}
function newSessionDialog() {
	const input = h("input", { id: "newName", type: "text", maxlength: LIMITS.short, autocomplete: "off", "aria-label": "Internal session name" });
	const err = h("p", { class: "err small", role: "alert" });
	const create = () => {
		const name = input.value.trim();
		if (!name) return void (err.textContent = "Give the session an internal name.");
		const s = newSession(name, nowMs());
		$("#dlg").close();
		if (!addSessions([...state.sessions, s])) return;
		state.activeId = s.id;
		go(`#s/${s.id}/brief`);
		render();
	};
	input.addEventListener("keydown", (e) => e.key === "Enter" && create());
	dialog("New session", [h("p", { class: "muted" }, "An internal name only you see. You can set the public title later."), input, err], [{ label: "Cancel" }, { label: "Create session", cls: "primary", keep: true, run: create }]);
	input.focus();
}
function onImportFile(ev) {
	const f = ev.target.files?.[0];
	ev.target.value = "";
	if (!f) return;
	if (f.size > LIMITS.importBytes) return showBanner("That file is too large to import.", true);
	f.text().then((text) => {
		const r = parseImport(text, nowMs());
		if (r.ok && state.sessions.length + r.sessions.length > LIMITS.sessions) {
			r.ok = false;
			r.errors = [`This browser can hold at most ${LIMITS.sessions} sessions; you have ${state.sessions.length} and the file has ${r.sessions.length}. Export a backup and delete sessions first.`];
		}
		if (!r.ok) return dialog("Import failed", [h("p", null, "Nothing was imported or changed."), h("ul", null, r.errors.slice(0, 8).map((e) => h("li", null, e)))], [{ label: "Close", cls: "primary" }]);
		dialog(`Import ${r.sessions.length} session${r.sessions.length === 1 ? "" : "s"}?`, [
			h("p", null, "Sessions are added alongside your existing ones; nothing is overwritten. Sessions with a matching id are imported as copies."),
			r.warnings.length ? h("ul", null, r.warnings.slice(0, 6).map((w) => h("li", { class: "small" }, w))) : null,
		], [{ label: "Cancel" }, { label: "Import", cls: "primary", run: () => {
			const m = mergeImported(state.sessions, r.sessions, nowMs());
			if (!addSessions(m.sessions)) return;
			go("#library");
			render();
		} }]);
	}).catch(() => showBanner("That file could not be read.", true));
}

// ---------- main render ----------
let viewCleanup = null; // set by views that add window listeners (the canvas resize handler)
function render() {
	viewCleanup?.();
	viewCleanup = null;
	updaters = [];
	fieldReg = new Map();
	renderSide();
	const r = route();
	const stage = $("#stage");
	let node;
	if (r.name === "why") node = viewWhy();
	else if (r.name === "library") node = viewLibrary();
	else {
		const s = currentSession();
		node = s ? viewSession(s, r.tab) : h("div", { class: "view" }, h("div", { class: "empty" }, h("b", null, "Session not found"), "It may have been deleted or lives in another browser.", h("div", null, h("a", { href: "#library" }, "Back to the library"))));
	}
	stage.replaceChildren(node);
	runUpdaters();
}

function viewSession(s, tab) {
	const strip = h("div", { class: "row small", role: "status" });
	updaters.push(() => {
		const pr = progress(s), rd = readiness(s, nowMs());
		strip.replaceChildren(chip(`Progress ${pr.pct}%`, "good"), chip(`Readiness ${rd.passed}/${rd.total}`, rd.passed === rd.total ? "good" : "warn"), chip(`${rd.blockers} blocker${rd.blockers === 1 ? "" : "s"}`, rd.blockers ? "bad" : "good"),
			chip(sessionStatus(s, nowMs()).label), chip(`Intended visibility: ${s.event.visibility}`), chip(`Planning state: ${PLANNING_STATES.find((p) => p[0] === s.planningState)?.[1]}`));
	});
	const body = { overview: tabOverview, brief: tabBrief, rsvp: tabRsvp, tier: tabTier, workflow: tabWorkflow, reminders: tabReminders, preview: tabPreview, export: tabExport }[tab](s);
	return h("div", { class: "view" },
		h("header", null, h("div", { class: "eyebrow" }, "Session"), h("h1", { id: "sessionTitle" }, s.event.publicTitle || s.event.internalName || "Untitled session"), strip,
			h("nav", { class: "tabs", "aria-label": "Session sections" }, TABS.map(([id, label]) => h("a", { href: `#s/${s.id}/${id}`, "aria-current": id === tab ? "page" : null }, label)))),
		body);
}

// ---------- overview ----------
function tabOverview(s) {
	const body = h("div");
	updaters.push(() => {
		const pr = progress(s), rd = readiness(s, nowMs()), sc = resolveSchedule(s.event);
		const late = overdueTasks(s, nowMs()).length;
		const next = s.tasks.filter((t) => t.status !== "done" && t.status !== "na").slice(0, 5);
		body.replaceChildren(
			h("div", { class: "stats" },
				h("div", null, h("span", null, "Workflow"), h("b", null, `${pr.pct}%`), h("small", null, `${pr.done} of ${pr.total} tasks done`)),
				h("div", null, h("span", null, "Readiness"), h("b", null, `${rd.passed}/${rd.total}`), h("small", null, `${rd.blockers} blockers`)),
				h("div", null, h("span", null, "Overdue"), h("b", null, String(late)), h("small", null, "dates compared in UTC")),
				h("div", null, h("span", null, "Schedule"), h("b", null, sc.state === "ok" ? relativeTo(sc.ms, nowMs()) : sc.state === "unscheduled" ? "Unscheduled" : "Invalid"), h("small", null, sc.startUtc ?? sc.error ?? "Set date, time and zone")),
				h("div", null, h("span", null, "Tier"), h("b", null, s.tier ? s.tier[0].toUpperCase() + s.tier.slice(1) : "None"), h("small", null, "Crawl / Walk / Run"))),
			h("section", { class: "card" }, h("h2", null, "Stages"), ...pr.byStage.flatMap((st) => [h("div", { class: "row" }, h("a", { href: `#s/${s.id}/workflow` }, st.label), h("span", { class: "grow" }), h("span", { class: "mono" }, `${st.done}/${st.total}`)), barEl(st.pct)])),
			h("section", { class: "card" }, h("h2", null, "Readiness checks"), h("ul", { class: "checks" }, rd.checks.map((c) => h("li", { class: c.ok ? "" : c.severity === "blocker" ? "blocker" : "fail" }, h("span", null, c.ok ? "✓" : c.severity === "blocker" ? "✕" : "!"), h("span", null, c.text), c.ok ? null : h("a", { href: `#s/${s.id}/${c.tab}` }, "Fix →"))))),
			h("section", { class: "card" }, h("h2", null, "Next up"), next.length ? h("ul", null, next.map((t) => h("li", null, `${STAGES.find((x) => x.id === t.stage).label}: ${t.title}`))) : h("p", { class: "muted" }, "Every task is done or not applicable.")),
		);
	});
	return h("div", null,
		h("div", { class: "notice" }, "Planning only. This studio records your plan. It does not publish the page, collect registrations, send reminders or fire webhooks."),
		body,
		h("section", { class: "card" }, h("h2", null, "Session settings"),
			h("div", { class: "grid2" },
				field(s, "planningState", "Planning state (your own label, not a live status)", { type: "select", options: PLANNING_STATES, after: () => runUpdaters() }),
				field(s, "notes", "Private notes", { type: "textarea", max: LIMITS.long, rows: 3 })),
			h("div", { class: "row", style: null }, h("button", { type: "button", onclick: () => {
				const copy = duplicateSession(s, nowMs());
				if (!addSessions([...state.sessions, copy])) return;
				go(`#s/${copy.id}/brief`);
				render();
			} }, "Duplicate as a new draft"), h("button", { type: "button", class: "danger", onclick: () => deleteDialog(s) }, "Delete session…"))));
}
function deleteDialog(s) {
	dialog("Delete this session?", [h("p", null, `"${s.event.internalName || s.id}" will be removed from this browser. This cannot be undone. Download a copy first if you might want it back.`)], [
		{ label: "Cancel" },
		{ label: "Download copy", keep: true, run: () => download(safeFilename(s, ".json"), JSON.stringify(sessionExport(s), null, 2)) },
		{ label: "Delete session", cls: "danger", run: () => {
			state.sessions = state.sessions.filter((x) => x.id !== s.id);
			if (state.activeId === s.id) state.activeId = null;
			setSave(store.save(state));
			go("#library");
			render();
		} },
	]);
}

// ---------- brief ----------
function timeZoneList() {
	let zones = [];
	try {
		zones = Intl.supportedValuesOf("timeZone");
	} catch {}
	if (!zones.includes("UTC")) zones = ["UTC", ...zones];
	return h("datalist", { id: "tzlist" }, zones.map((z) => h("option", { value: z })));
}
function tabBrief(s) {
	const e = s.event;
	const readout = h("div", { class: "sched", "aria-live": "polite" });
	updaters.push(() => {
		const sc = resolveSchedule(e);
		readout.textContent = sc.state === "ok"
			? `Starts ${sc.startUtc} (UTC) · ${formatInZone(sc.ms, e.timeZone)} · ${relativeTo(sc.ms, nowMs())}`
			: sc.state === "unscheduled" ? "Unscheduled: no date or time set." : `Schedule problem: ${sc.error}`;
	});
	const tzField = field(s, "event.timeZone", "IANA time zone", { list: "tzlist", max: 64, placeholder: "e.g. America/New_York", hint: "Required. Never assumed from this computer." });
	const slugField = field(s, "event.slug", "Page slug", { max: 80, hint: "Lowercase letters, digits and hyphens. Used in the page URL." });
	return h("div", null,
		timeZoneList(),
		h("section", { class: "card" }, h("h2", null, "Identity"),
			h("div", { class: "grid2" },
				field(s, "event.internalName", "Internal page name", { private: true }),
				field(s, "event.publicTitle", "Public page title", { after: () => {
					$("#sessionTitle").textContent = e.publicTitle || e.internalName || "Untitled session";
				} }),
				h("div", null, slugField, h("button", { type: "button", class: "sm", style: null, onclick: () => {
					const input = slugField.syncInput;
					input.value = slugify(e.publicTitle || e.internalName);
					input.dispatchEvent(new Event("input", { bubbles: true }));
				} }, "Generate from title")),
				field(s, "event.format", "Format", { type: "select", options: FORMATS }),
				field(s, "event.topics", "Tagged topics (comma-separated)", { type: "list", itemMax: 60, hint: "Used by the library filter." }),
				field(s, "event.visibility", "Intended visibility (applied in your CMS)", { type: "select", options: VISIBILITY, hint: "Unlisted hides it from indexes; it is not access control.", after: () => runUpdaters() }))),
		h("section", { class: "card" }, h("h2", null, "Hero image"),
			h("div", { class: "grid2" }, field(s, "event.heroUrl", "Hero image URL", { type: "url", placeholder: "https://…" }), field(s, "event.heroAlt", "Hero alt text", { max: 300 }))),
		h("section", { class: "card" }, h("h2", null, "Copy: AIDA"), h("p", { class: "muted small" }, "Attention, Interest, Decision, Action. The description should say what attendees will learn, get out of the session and be able to do after it."),
			h("div", { class: "grid2" },
				field(s, "event.aida.attention", "Attention: the hook", { type: "textarea" }), field(s, "event.aida.interest", "Interest: why it matters to them", { type: "textarea" }),
				field(s, "event.aida.decision", "Decision: why attend this session", { type: "textarea" }), field(s, "event.aida.action", "Action: what to do now", { type: "textarea" }),
				field(s, "event.shortDescription", "Short description", { type: "textarea", span2: true }),
				field(s, "event.outcomes", "Outcomes: what they will learn, get and be able to do (one per line)", { type: "lines", itemMax: 300, rows: 4, span2: true }))),
		h("section", { class: "card" }, h("h2", null, "Logistics"),
			h("div", { class: "grid3" },
				field(s, "event.date", "Date", { type: "date" }), field(s, "event.time", "Start time (24h, event zone)", { type: "time" }), tzField,
				field(s, "event.durationMin", "Duration (minutes)", { type: "number" }), field(s, "event.hosts", "Hosts (comma-separated)", { type: "list", itemMax: 80 }), field(s, "event.platform", "Platform / digital description", { max: 300, hint: "Public. Don't paste links here." }),
				field(s, "event.venue", "In-person venue (if any)", { max: 300, hint: "Public." })),
			h("div", { class: "row" }, h("button", { type: "button", class: "sm", onclick: () => {
				const input = tzField.syncInput;
				input.value = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
				input.dispatchEvent(new Event("input", { bubbles: true }));
			} }, "Use this browser's time zone")), readout),
		h("section", { class: "card private" }, h("h2", null, "Attendance links ", h("span", { class: "tag-private" }, "PRIVATE")), h("p", { class: "muted small" }, "Never shown on the public page or in the public export. They travel only in the private handoff."),
			h("div", { class: "grid2" }, field(s, "event.joinUrl", "Link to join", { type: "url", private: true }), field(s, "event.waitingUrl", "Link to waiting room", { type: "url", private: true }))),
		h("section", { class: "card" }, h("h2", null, "Repeating"),
			field(s, "event.recurring", "Repeating session", { type: "checkbox", hint: "Planning metadata only. This studio has no scheduler and creates no calendar events." }),
			field(s, "event.recurrence", "Repeating cadence", { type: "select", options: RECURRENCE_CADENCES, hint: "Repeats at the same local time in the event zone.", after: () => runUpdaters() }),
			legacyRecurrence(s)),
		h("section", { class: "card" }, h("h2", null, "After RSVP"),
			h("div", { class: "grid2" }, field(s, "event.redirectUrl", "Redirect link (leave empty to show the thank-you message)", { type: "url", private: true }), field(s, "event.thankYou", "Thank-you message", { type: "textarea", private: true }))),
		h("section", { class: "card" }, h("h2", null, "Recording"), field(s, "event.recordingUrl", "Link to hosted recording", { type: "url", hint: "Adding this marks the session as Recorded in the library." })),
	);
}

// Older sessions stored free text. It is shown verbatim (never reinterpreted) until the user clears it.
function legacyRecurrence(s) {
	const e = s.event;
	if (!e.recurrenceLegacy) return null;
	const box = h("div", { class: "notice", role: "note", id: "legacyRecurrence" },
		h("b", null, "Earlier free-text schedule (kept as written): "), h("q", null, e.recurrenceLegacy),
		h("p", { class: "small" }, "Choose a supported cadence above. Anything the cadence cannot express (day of week, week of month) belongs in the run of show or your calendar tool."),
		h("button", { type: "button", class: "sm", onclick: () => {
			e.recurrenceLegacy = "";
			box.remove();
			commit();
		} }, "Clear the old text"));
	return box;
}

// ---------- RSVP ----------
function tabRsvp(s) {
	const smsWrap = h("div");
	const rows = RSVP_FIELDS.map((f) => {
		const sel = h("select", { "aria-label": `${f.label}: mode`, disabled: f.locked }, FIELD_MODES.filter(([m]) => f.modes.includes(m)).map(([m, l]) => h("option", { value: m }, f.locked ? "Required (always)" : l)));
		sel.value = s.rsvp.fields[f.id];
		sel.addEventListener("change", () => {
			s.rsvp.fields[f.id] = sel.value;
			if (f.id === "smsConsent") drawSms();
			commit();
		});
		const err = h("span", { class: "err" });
		fieldReg.set(`rsvp.fields.${f.id}`, { input: sel, err });
		return h("tr", null, h("td", null, f.label), h("td", null, sel, err));
	});
	function drawSms() {
		smsWrap.replaceChildren(s.rsvp.fields.smsConsent === "off" ? null : field(s, "rsvp.smsConsentText", "SMS opt-in wording (shown beside its own unchecked box)", { type: "textarea", rows: 3 }));
	}
	drawSms();
	return h("div", null,
		h("section", { class: "card" }, h("h2", null, "Business RSVP form"),
			h("p", { class: "muted" }, "Name and email are mandatory. Add business fields only if you will use them. Phone is optional; marketing SMS consent is a separate optional checkbox that is never pre-checked and never required to register."),
			h("table", { class: "tbl" }, h("thead", null, h("tr", null, h("th", null, "Field"), h("th", null, "Mode"))), h("tbody", null, rows)),
			h("div", { class: "grid2" }, field(s, "rsvp.formVersion", "Form version", { max: 40, hint: "Recorded with each registration so changes stay traceable. Separate from the hero image URL." })),
			smsWrap),
		h("div", { class: "notice" }, "This describes the form. It is not a live form: no registrations are collected or stored by this studio, and a sample preview is on the Page preview tab. Minimum reminder channel: email."));
}

// ---------- tier ----------
function tabTier(s) {
	const capsBox = h("div");
	const cardsBox = h("div", { class: "tier-cards", role: "group", "aria-label": "Tier" });
	const draw = () => {
		cardsBox.replaceChildren(...Object.entries(TIER_INFO).map(([id, t]) => h("div", { class: `tier-card${s.tier === id ? " on" : ""}` },
			h("h3", null, t.label), h("p", { class: "small" }, t.blurb), h("p", { class: "small muted" }, t.author),
			h("button", { type: "button", "aria-pressed": s.tier === id ? "true" : "false", class: s.tier === id ? "primary" : "", onclick: () => {
				s.tier = id;
				commit();
				draw();
			} }, s.tier === id ? `${t.label} chosen` : `Choose ${t.label}`))));
		capsBox.replaceChildren(...CAPABILITIES.map((c) => {
			const cb = h("input", { type: "checkbox", id: `cap-${c.id}`, checked: !!s.capabilities[c.id], onchange: () => {
				s.capabilities[c.id] = cb.checked;
				commit();
			} });
			return h("div", { class: "cap" }, cb, h("label", { for: `cap-${c.id}` }, c.label, " ", chip(c.tier), h("small", null, c.note)));
		}));
	};
	draw();
	return h("div", null,
		h("section", { class: "card" }, h("h2", null, "Crawl, walk, run"), h("p", { class: "muted" }, "Pick the least tooling that covers what this session needs. You can move up later."), cardsBox,
			h("div", { class: "row" }, h("button", { type: "button", class: "sm", disabled: false, onclick: () => {
				if (!s.tier) return;
				s.capabilities = capabilitiesForTier(s.tier);
				commit();
				draw();
			} }, "Apply this tier's suggested capabilities"), h("span", { class: "hint small" }, "Replaces the checkboxes below; edit them afterwards."))),
		h("section", { class: "card" }, h("h2", null, "Capabilities this session needs"), h("p", { class: "muted small" }, "The grouping into tiers is this studio's editorial suggestion, not a vendor feature comparison."), capsBox),
		h("section", { class: "card" }, h("h2", null, "Vendors named by the author"),
			h("p", { class: "muted small" }, "These are the author's preferences and supplied names. They are not verified capability claims, rankings or pricing statements. Check each vendor's current features and cost yourself."),
			h("table", { class: "tbl" }, h("thead", null, h("tr", null, h("th", null, "Name"), h("th", null, "Where"), h("th", null, "Status"), h("th", null, "Note"))),
				h("tbody", null, VENDORS.map((v) => h("tr", null, h("td", null, v.name), h("td", null, v.tier ?? "unassigned"), h("td", null, v.status), h("td", { class: "small" }, v.note))))),
			h("p", { class: "small muted" }, DESTINATION_NOTE)));
}

// ---------- workflow ----------
function tabWorkflow(s) {
	const filter = { v: "all" };
	const host = h("div");
	const issuesBox = h("div", { id: "depIssues", "aria-live": "polite" });
	let depRefreshers = [];
	const title = (id) => s.tasks.find((x) => x.id === id)?.title ?? id;
	const refreshDeps = () => {
		for (const f of depRefreshers) f();
		const issues = dependencyIssues(s.tasks);
		issuesBox.replaceChildren(issues.length ? h("p", { class: "err", role: "alert" }, `Dependency problems: ${issues.map((x) => `${title(x.taskId)} → ${title(x.dep)} (${x.kind})`).join("; ")}. Remove one link in each to fix.`) : "");
	};
	const draw = () => {
		depRefreshers = [];
		const today = todayUtc(nowMs());
		host.replaceChildren(...STAGES.map((st) => {
			const tasks = s.tasks.filter((t) => t.stage === st.id && (filter.v === "all" || (filter.v === "open" ? t.status !== "done" && t.status !== "na" : t.status === "done")));
			const stat = progress(s).byStage.find((x) => x.id === st.id);
			return h("section", { class: "stage", "aria-label": st.label },
				h("div", { class: "stage-head" }, h("h3", null, st.label), barEl(stat.pct), h("span", { class: "mono" }, `${stat.done}/${stat.total}`)),
				h("p", { class: "deliv" }, `Deliverables: ${st.deliverables.join(" · ")}`),
				tasks.length ? tasks.map((t) => taskRow(s, t, today)) : h("p", { class: "muted small" }, "No tasks match this filter."));
		}));
		refreshDeps();
	};
	// "Depends on" chips with status, unmet blockers, and an add-dependency picker that refuses self, unknown and cycles.
	const depLine = (t) => {
		const box = h("div", { class: "deps" });
		const err = h("span", { class: "err" });
		const refresh = () => {
			const unmet = unmetDependencies(s, t);
			const pick = h("select", { "aria-label": `Add a dependency to: ${t.title}`, class: "dep-add", onchange: () => {
				const id = pick.value;
				if (!id) return;
				const why = dependencyRefusal(s.tasks, t.id, id);
				if (why) {
					err.textContent = why;
					pick.value = "";
					return;
				}
				t.deps.push(id);
				commit();
				refreshDeps();
			} }, h("option", { value: "" }, "+ Depends on…"), s.tasks.filter((x) => x.id !== t.id && !t.deps.includes(x.id)).map((x) => h("option", { value: x.id }, `${STAGES.find((st) => st.id === x.stage)?.label}: ${x.title}`)));
			box.replaceChildren(
				h("span", { class: "small muted" }, t.deps.length ? "Depends on:" : "No dependencies."),
				...t.deps.map((d) => {
					const dt = s.tasks.find((x) => x.id === d);
					const done = dt && (dt.status === "done" || dt.status === "na");
					return h("span", { class: `chip ${done ? "good" : "warn"}` }, `${title(d)} (${dt ? TASK_STATUS.find((x) => x[0] === dt.status)?.[1] : "missing"})`,
						h("button", { type: "button", class: "chip-x", "aria-label": `Remove dependency on ${title(d)} from ${t.title}`, onclick: () => {
							t.deps = t.deps.filter((x) => x !== d);
							commit();
							refreshDeps();
						} }, "×"));
				}),
				unmet.length && !["done", "na"].includes(t.status) ? h("span", { class: "small blocked-by" }, `Blocked by ${unmet.length} unfinished: ${unmet.map((x) => x.title).join("; ")}`) : null,
				pick, err);
		};
		depRefreshers.push(refresh);
		return box;
	};
	const taskRow = (s2, t, today) => {
		const row = h("div", { class: `task${t.status === "done" ? " done" : ""}${t.due && t.due < today && t.status !== "done" && t.status !== "na" ? " late" : ""}` });
		const status = h("select", { "aria-label": `Status: ${t.title}` }, TASK_STATUS.map(([v, l]) => h("option", { value: v }, l)));
		status.value = t.status;
		const role = h("input", { type: "text", "aria-label": `Responsible role: ${t.title}`, placeholder: t.hint || "Responsible role", maxlength: 80, list: "rolelist", value: t.role });
		const owner = h("input", { type: "text", "aria-label": `Named owner (optional): ${t.title}`, placeholder: "Named owner (optional)", maxlength: 120, value: t.owner });
		const due = h("input", { type: "date", "aria-label": `Due date: ${t.title}`, value: t.due });
		const ev = h("input", { type: "text", "aria-label": `Evidence: ${t.title}`, placeholder: "Link or note proving it's done", maxlength: LIMITS.text, value: t.evidence });
		const upd = () => {
			const statusChanged = t.status !== status.value;
			t.status = status.value;
			t.role = role.value;
			t.owner = owner.value;
			t.due = due.value;
			t.evidence = ev.value;
			row.classList.toggle("done", t.status === "done");
			row.classList.toggle("late", !!t.due && t.due < todayUtc(nowMs()) && t.status !== "done" && t.status !== "na");
			commit();
			for (const [i, st] of progress(s2).byStage.entries()) {
				const sec = host.children[i];
				sec.querySelector(".bar").setPct(st.pct);
				sec.querySelector(".mono").textContent = `${st.done}/${st.total}`;
			}
			if (statusChanged) refreshDeps();
		};
		for (const el of [role, owner, due, ev]) el.addEventListener("input", upd);
		status.addEventListener("change", upd);
		const head = h("div", { class: "t" }, h("b", null, t.title), t.custom ? h("small", null, "custom task ") : null, SUPERSEDED_TASKS[t.id] ? h("small", null, "earlier bundled task") : null);
		const editTitle = h("input", { type: "text", maxlength: 300, required: true, "aria-label": `Task title: ${t.title}`, value: t.title });
		const editStage = h("select", { "aria-label": `Task stage: ${t.title}` }, STAGES.map((st) => h("option", { value: st.id }, st.label)));
		editStage.value = t.stage;
		head.append(h("details", null, h("summary", null, "Edit task"), editTitle, editStage,
			h("button", { type: "button", class: "sm", onclick: () => {
				if (!editTitle.value.trim()) {
					editTitle.setCustomValidity("Give the task a title.");
					editTitle.reportValidity();
					return;
				}
				t.title = editTitle.value.trim().slice(0, 300);
				t.stage = editStage.value;
				commit();
				draw();
			} }, "Save task")));
		editTitle.addEventListener("input", () => editTitle.setCustomValidity(""));
		head.append(h("button", { type: "button", class: "sm ghost", "aria-label": `Delete task: ${t.title}`, onclick: () => {
			const dependents = dependentsOf(s2, t.id);
			const remove = () => {
				s2.tasks = s2.tasks.filter((x) => x.id !== t.id);
				for (const d of dependents) d.deps = d.deps.filter((x) => x !== t.id);
				commit();
				draw();
			};
			dialog("Delete this task?", [h("p", null, `Delete "${t.title}"? This removes its status, owner, due date and evidence. ${dependents.length} task(s) depend on it${dependents.length ? `: ${dependents.map((d) => d.title).join("; ")}` : ""}. Those dependency links will be removed too.`)],
				[{ label: "Cancel" }, { label: "Remove task and links", cls: "danger", run: remove }]);
		} }, "Delete"));
		row.append(status, head, role, owner, due, ev, depLine(t));
		return row;
	};
	draw();
	const filterSel = h("select", { id: "taskFilter", "aria-label": "Filter tasks", onchange: () => {
		filter.v = filterSel.value;
		draw();
	} }, [["all", "All tasks"], ["open", "Open"], ["done", "Done"]].map(([v, l]) => h("option", { value: v }, l)));
	const newTitle = h("input", { type: "text", id: "customTitle", maxlength: 300, "aria-label": "New task title", placeholder: "New task" });
	const newStage = h("select", { id: "customStage", "aria-label": "New task stage" }, STAGES.map((st) => h("option", { value: st.id }, st.label)));
	const newRole = h("input", { type: "text", id: "customRole", maxlength: 80, list: "rolelist", "aria-label": "New task responsible role", placeholder: "Responsible role" });
	const addErr = h("span", { class: "err", role: "status" });
	return h("div", null,
		h("datalist", { id: "rolelist" }, TASK_ROLES.map((r) => h("option", { value: r }))),
		s.taskTemplate === TASK_TEMPLATE_VERSION ? null : h("div", { class: "notice", id: "upgradeNotice" },
			"This task list uses the earlier checklist, which bundled several channels and roles into single tasks. ",
			h("button", { type: "button", class: "sm", id: "upgradeTasks", onclick: () => upgradeDialog(s) }, "Preview checklist upgrade…")),
		h("section", { class: "card" }, h("h2", null, "Workflow"), h("p", { class: "muted" }, "Create page → review/publish → promote/RSVP → execute/record → upload → attach recording → repurpose/readout. Publishing happens in your CMS; the review stage here only records approval and evidence. Each task has one responsible role; a named owner is optional."),
			h("div", { class: "row" }, filterSel), issuesBox, host,
			h("div", { class: "row" }, newTitle, newStage, newRole, h("button", { type: "button", id: "addTask", onclick: () => {
				const title = newTitle.value.trim();
				if (!title) return void (addErr.textContent = "Give the task a title.");
				if (s.tasks.length >= LIMITS.tasks) return void (addErr.textContent = `A session can have at most ${LIMITS.tasks} tasks.`);
				s.tasks.push({ id: newId("t"), stage: newStage.value, title, hint: "", role: newRole.value.trim().slice(0, 80), deps: [], status: "todo", owner: "", due: "", evidence: "", custom: true });
				newTitle.value = newRole.value = addErr.textContent = "";
				commit();
				draw();
			} }, "Add task"), addErr)));
}
// Explicit, previewed, backed-up upgrade of an earlier task list. Nothing changes until the user confirms.
function upgradeDialog(s) {
	const plan = planTaskUpgrade(s);
	const t = (id) => s.tasks.find((x) => x.id === id)?.title ?? id;
	const list = (label, items) => items.length ? [h("h3", null, `${label} (${items.length})`), h("ul", { class: "small" }, items.map((x) => h("li", null, x)))] : [];
	dialog("Upgrade the checklist?", [
		h("p", null, "A backup of this session (private JSON, re-importable) downloads first. Completed states, named owners, due dates, evidence and custom tasks are kept."),
		plan.error ? h("p", { class: "err", role: "alert" }, plan.error) : null,
		...list("New split tasks to add", plan.add.map((id) => DEFAULT_TASKS.find((d) => d.id === id)?.title ?? id)),
		...list("Untouched bundled tasks to remove", plan.remove.map(t)),
		...list("Bundled tasks kept because they have progress (mark N/A once the split tasks cover them)", plan.keepSuperseded.map(t)),
		...list("Existing tasks that get a default role or dependencies where theirs are empty", plan.fill.map(t)),
	], [{ label: "Cancel" }, plan.error ? null : { label: "Download backup and upgrade", cls: "primary", run: () => {
		download(safeFilename(s, ".pre-upgrade.session.json"), JSON.stringify(sessionExport(s, nowMs()), null, 2));
		const r = applyTaskUpgrade(s, plan);
		if (!r.ok) return showBanner(r.error, true);
		state.sessions = state.sessions.map((x) => (x.id === s.id ? r.session : x));
		commit();
		render();
	} }].filter(Boolean));
}

// ---------- reminders and reuse ----------
function tabReminders(s) {
	const tbody = h("tbody");
	const times = [];
	const draw = () => {
		times.length = 0;
		tbody.replaceChildren(...s.reminders.map((r) => {
			const en = h("input", { type: "checkbox", "aria-label": `Enabled: ${r.label}`, checked: r.enabled, onchange: () => {
				r.enabled = en.checked;
				commit();
			} });
			const off = h("input", { type: "number", step: 1, min: -MAX_OFFSET_MIN, max: MAX_OFFSET_MIN, "aria-label": `Minutes from start: ${r.label}`, value: r.offsetMinutes ?? "", disabled: r.offsetMinutes === null, onchange: () => {
				const n = Number(off.value);
				// Refuse values normalizeSession would reset on reload; keep the previous offset instead.
				if (off.value === "" || !Number.isInteger(n) || Math.abs(n) > MAX_OFFSET_MIN) {
					off.value = r.offsetMinutes;
					return showBanner(`Reminder offsets must be whole minutes within ±${MAX_OFFSET_MIN}; the previous value was kept.`, true);
				}
				r.offsetMinutes = n;
				commit();
			} });
			const at = h("td", { class: "mono" });
			times.push([r.id, at]);
			return h("tr", null, h("td", null, en), h("td", null, r.label, " ", chip(r.kind)), h("td", null, REMINDER_AUDIENCES.find((a) => a[0] === r.audience)?.[1]), h("td", null, r.offsetMinutes === null ? "On RSVP" : off), at);
		}));
		showTimes();
	};
	const showTimes = () => {
		const rt = new Map(reminderTimes(s, nowMs()).map((r) => [r.id, r]));
		for (const [id, td] of times) {
			const r = rt.get(id);
			td.textContent = r ? (r.atUtc ? `${r.atUtc}${r.past ? " (already passed)" : ""}` : r.timing) : "";
		}
	};
	updaters.push(showTimes);
	draw();
	const lbl = h("input", { type: "text", id: "remLabel", maxlength: 200, "aria-label": "New message label", placeholder: "New message" });
	const mins = h("input", { type: "number", id: "remMins", "aria-label": "Minutes from start", value: -30 });
	const reuseBox = h("div");
	for (const phase of ["before", "during", "after"]) {
		reuseBox.append(h("h3", null, phase[0].toUpperCase() + phase.slice(1)), ...s.reuse.filter((r) => r.phase === phase).map((r) => {
			const cb = h("input", { type: "checkbox", id: `reuse-${r.id}`, checked: r.done, onchange: () => {
				r.done = cb.checked;
				commit();
			} });
			const note = h("input", { type: "text", "aria-label": `Note: ${r.label}`, maxlength: 500, value: r.note, placeholder: "Where it went (link or note)", oninput: () => {
				r.note = note.value;
				commit();
			} });
			return h("div", { class: "cap" }, cb, h("label", { for: `reuse-${r.id}` }, r.label), h("span", { class: "grow" }), note);
		}));
	}
	return h("div", null,
		h("section", { class: "card" }, h("h2", null, "Reminders, confirmation and follow-ups"),
			h("p", { class: "muted" }, "Timing is relative to the event's UTC start. Build these in your email tool: the studio schedules nothing. Confirmation goes out immediately on RSVP with ICS / calendar links; the CRM handoff and attendee / no-show follow-ups are tracked as tasks on the Workflow tab."),
			h("table", { class: "tbl" }, h("thead", null, h("tr", null, h("th", null, "On"), h("th", null, "Message"), h("th", null, "Audience"), h("th", null, "Minutes from start (− before)"), h("th", null, "Planned at (UTC)"))), tbody),
			h("div", { class: "row" }, lbl, mins, h("button", { type: "button", id: "addReminder", onclick: () => {
				const label = lbl.value.trim();
				if (!label || s.reminders.length >= LIMITS.reminders) return;
				const n = Number(mins.value);
				if (!Number.isInteger(n) || Math.abs(n) > MAX_OFFSET_MIN) return showBanner(`Reminder offsets must be whole minutes within ±${MAX_OFFSET_MIN}.`, true);
				s.reminders.push({ id: newId("r"), kind: n < 0 ? "reminder" : "follow-up", label, audience: "registrants", offsetMinutes: Number.isInteger(n) ? n : 0, enabled: true });
				lbl.value = "";
				commit();
				draw();
			} }, "Add message"), h("button", { type: "button", class: "ghost sm", onclick: () => {
				s.reminders = DEFAULT_REMINDERS.map((r) => ({ ...r }));
				commit();
				draw();
			} }, "Reset to defaults"))),
		h("section", { class: "card" }, h("h2", null, "Reuse plan"), reuseBox));
}

// ---------- preview ----------
function tabPreview(s) {
	const e = s.event, f = s.rsvp.fields;
	const sc = resolveSchedule(e);
	const hero = h("div", { class: "hero" });
	const heroUrl = safeUrl(e.heroUrl);
	const showHeroPlaceholder = () => hero.replaceChildren(heroUrl ? `Hero image not loaded (${new URL(heroUrl).host})` : "No valid hero image URL yet");
	showHeroPlaceholder();
	const loadBtn = h("button", { type: "button", class: "sm", id: "loadHero", disabled: !heroUrl, onclick: () => {
		const img = h("img", { alt: e.heroAlt, referrerpolicy: "no-referrer", src: heroUrl });
		img.addEventListener("error", () => hero.replaceChildren("The hero image could not be loaded."));
		hero.replaceChildren(img);
	} }, "Load hero image from its URL");
	const mkInput = (label, type = "text", mode) => h("label", null, `${label}${mode === "required" ? " *" : " (optional)"}`, h("input", { type, disabled: true, tabindex: -1 }));
	const formFields = [];
	for (const rf of RSVP_FIELDS) {
		const m = f[rf.id];
		if (m === "off" || rf.id === "smsConsent") continue;
		formFields.push(mkInput(rf.label, rf.id === "email" ? "email" : rf.id === "phone" ? "tel" : "text", m));
	}
	if (f.smsConsent !== "off") formFields.push(h("label", null, h("input", { type: "checkbox", disabled: true }), ` ${s.rsvp.smsConsentText || "(SMS opt-in wording not written yet)"} (optional)`));
	const logi = [["When", sc.state === "ok" ? formatInZone(sc.ms, e.timeZone) : "To be announced"], ["UTC start", sc.startUtc ?? "Not set"], ["Duration", `${e.durationMin} min`], ["Hosts", e.hosts.join(", ") || "To be announced"], ["Where", [e.platform, e.venue].filter(Boolean).join(" · ") || "To be announced"]];
	if (e.recurring) logi.push(["Repeats", cadenceLabel(e.recurrence) || "Repeating"]);
	const aida = [["Attention", e.aida.attention], ["Interest", e.aida.interest], ["Decision", e.aida.decision], ["Action", e.aida.action]];
	// The preview shows the same public copy as the public export, so it is blocked by the same leak check.
	const leaks = publicPage(s).leaks;
	return h("div", null,
		h("div", { class: "notice" }, "Draft RSVP-page preview. The join and waiting-room fields are never placed in it, public copy is checked for pasted private links, and the form below is inert: nothing can be submitted, stored or sent."),
		leaks.length ? h("p", { class: "err", role: "alert", id: "previewBlocked" }, `Preview blocked: ${leaks.join("; ")}. Remove the link from public text in the Event brief.`) : h("div", { class: "page-prev", id: "pagePreview" },
			h("div", { class: "bar-draft" }, `DRAFT PREVIEW · intended visibility: ${e.visibility} · not published`),
			hero,
			h("div", { class: "body" },
				h("h2", null, e.publicTitle || "Untitled virtual event"),
				e.topics.length ? h("div", { class: "row" }, e.topics.map((t) => chip(t))) : null,
				h("div", { class: "logi" }, logi.map(([k, v]) => h("div", null, h("b", null, k), v))),
				e.shortDescription ? h("p", null, e.shortDescription) : null,
				e.outcomes.length ? h("div", null, h("b", null, "What you'll get"), h("ul", null, e.outcomes.map((o) => h("li", null, o)))) : null,
				h("div", { class: "aida" }, aida.map(([k, v]) => v ? [h("h4", null, k), h("p", null, v)] : null)),
				h("div", { class: "form" }, h("b", null, "Save your spot"), h("div", { style: null }), formFields, h("button", { type: "button", disabled: true }, "Register (disabled in preview)")))),
		leaks.length ? null : h("div", { class: "row" }, loadBtn, h("span", { class: "hint small" }, "Loading contacts the image's host from this browser. Off by default.")),
		h("section", { class: "card private" }, h("h2", null, "After RSVP ", h("span", { class: "tag-private" }, "PRIVATE · planning view")),
			h("p", null, safeUrl(e.redirectUrl) ? `Redirect to ${new URL(safeUrl(e.redirectUrl)).host}.` : e.thankYou ? "Show the thank-you message:" : "No redirect or thank-you message set yet."),
			e.thankYou && !safeUrl(e.redirectUrl) ? h("blockquote", null, e.thankYou) : null,
			h("p", { class: "muted small" }, "Thank-you state would offer calendar links (ICS download and web calendar) and the autoresponder repeats the details with an ICS file. Both are specified by you and built elsewhere.")));
}

// ---------- export ----------
function tabExport(s) {
	const pub = publicPage(s);
	const outputs = [
		{ id: "pub", family: "public", label: "Public page JSON", desc: "Title, hero, AIDA copy, logistics, RSVP field list. No join or waiting-room links, no internal name, no tasks, notes or redirect.", name: safeFilename(s, ".public.json"), type: "application/json", disabled: pub.leaks.length > 0, build: () => JSON.stringify(pub.data, null, 2) },
		{ id: "json", family: "private", label: "Session JSON (private)", desc: "Full session plus handoff summary. Re-importable here.", name: safeFilename(s, ".session.json"), type: "application/json", build: () => JSON.stringify(sessionExport(s, nowMs()), null, 2) },
		{ id: "md", family: "private", label: "Markdown handoff (private)", desc: "Readable brief, workflow, reminders, reuse and readiness.", name: safeFilename(s, ".handoff.md"), type: "text/markdown", build: () => markdownHandoff(s, nowMs()) },
		{ id: "hook", family: "private", label: "Registration webhook spec (private, example)", desc: "Versioned proposed contract with a synthetic example payload. Nothing is sent.", name: safeFilename(s, ".webhook-spec.json"), type: "application/json", build: () => JSON.stringify(webhookSpec(s), null, 2) },
		{ id: "all", family: "private", label: "Backup of all sessions (private)", desc: "Every session in this browser.", name: "webinar-strategy-backup.json", type: "application/json", build: () => JSON.stringify(backupExport(state.sessions, nowMs()), null, 2) },
	];
	const share = shareArtifact(s, nowMs());
	const shareBtn = (id, label, run) => h("button", { type: "button", class: "sm primary", id, disabled: !share.ok, onclick: run }, label);
	const shareSection = h("section", { class: "card", id: "shareCard" }, h("h2", null, "Share as a file ", chip("planning snapshot", "warn")),
		h("p", { class: "muted small" }, "One self-contained HTML file: plan, logistics, copy, every stage's tasks with role, named owner, dependencies and status, plus a slide view, Print / Save PDF and Download Markdown. It works offline from the file itself, loads nothing from the network and is not hosted: no link or URL is created. Send or attach the file; Claude can attach it for you and use native sharing where your host app supports it."),
		h("p", { class: "small" }, "Left out by design: join, waiting-room and redirect links, the thank-you message, internal name, private notes and task evidence. ", SHARE_CAUTION),
		share.ok ? null : h("p", { class: "err", role: "alert", id: "shareBlocked" }, `Share file blocked: ${share.leaks.join("; ")}. Remove the private link from public copy, task titles, roles or owners.`),
		h("div", { class: "row" },
			shareBtn("dl-share-html", "Download HTML plan", () => {
				const a = shareArtifact(s, nowMs());
				if (a.ok) download(a.filename, a.html, "text/html");
			}),
			shareBtn("dl-share-slides", "Download HTML slides", () => {
				const a = shareArtifact(s, nowMs(), { view: "slides" });
				if (a.ok) download(a.filename, a.html, "text/html");
			}),
			shareBtn("print-share", "Print / Save PDF", () => {
				const a = shareArtifact(s, nowMs());
				if (!a.ok) return;
				// The studio's CSP forbids the artifact's inline style/script, so its <main> is parsed inertly (DOMParser runs no
				// scripts) and printed with the studio's own print stylesheet. The print dialog offers "Save as PDF".
				const mainMarkup = a.html.slice(a.html.indexOf('<main id="main">'), a.html.indexOf("</main>") + 7);
				const main = new DOMParser().parseFromString(mainMarkup, "text/html").querySelector("main");
				$("#printArea")?.remove();
				const area = h("div", { id: "printArea", class: "print-area" }, document.importNode(main, true));
				document.body.append(area);
				document.body.classList.add("printing-share");
				const done = () => {
					document.body.classList.remove("printing-share");
					area.remove();
				};
				window.addEventListener("afterprint", done, { once: true });
				window.print();
			}),
			shareBtn("dl-share-md", "Download Markdown", () => {
				const a = shareArtifact(s, nowMs());
				if (a.ok) download(safeFilename(s, ".plan.md"), a.markdown, "text/markdown");
			})));
	const out = h("pre", { class: "out", id: "exportPreview", tabindex: 0, "aria-label": "Export preview" }, "Choose Preview to see an export here.");
	const rows = (family) => outputs.filter((o) => o.family === family).map((o) => h("div", { class: "cap" }, h("div", { class: "grow" }, h("b", null, o.label), h("small", null, o.desc)),
		h("button", { type: "button", class: "sm", id: `prev-${o.id}`, disabled: o.disabled, onclick: () => void (out.textContent = o.build()) }, "Preview"),
		h("button", { type: "button", class: "sm primary", id: `dl-${o.id}`, disabled: o.disabled, onclick: () => download(o.name, o.build(), o.type) }, "Download")));
	return h("div", null,
		h("section", { class: "card public" }, h("h2", null, "Public export ", chip("safe to hand to a public page", "good")), h("p", { class: "muted small" }, PUBLIC_BANNER),
			pub.leaks.length ? h("p", { class: "err", role: "alert" }, `Blocked: ${pub.leaks.join("; ")}. Remove the link from public text.`) : null, rows("public")),
		shareSection,
		h("section", { class: "card private" }, h("h2", null, "Private operator handoff ", chip("sensitive", "warn")), h("p", { class: "muted small" }, PRIVATE_BANNER), rows("private"),
			h("p", { class: "small muted" }, "The webhook spec is a proposal for the separate CMS work. This plugin does not collect registrants, store attendee data or send webhooks; payload values are synthetic placeholders.")),
		h("section", { class: "card" }, h("h2", null, "Preview"), out));
}

// ---------- library ----------
const lib = { q: "", topic: "", host: "", view: "all" };
function viewLibrary() {
	const grid = h("div", { class: "lib-grid", id: "libGrid" });
	const count = h("p", { class: "muted small", role: "status", id: "libCount" });
	const draw = () => {
		const list = filterSessions(state.sessions, lib, nowMs());
		count.textContent = `${list.length} of ${state.sessions.length} session${state.sessions.length === 1 ? "" : "s"}`;
		grid.replaceChildren(...(list.length ? list.map((s) => {
			const st = sessionStatus(s, nowMs()), sc = resolveSchedule(s.event);
			return h("a", { class: "lib-card", href: `#s/${s.id}/overview` },
				h("div", { class: "row" }, chip(st.label, st.key === "recorded" ? "good" : st.key === "unscheduled" || st.key === "invalid" ? "warn" : ""), chip(s.event.visibility)),
				h("h3", null, s.event.publicTitle || s.event.internalName || "Untitled session"),
				h("div", { class: "mono muted" }, sc.state === "ok" ? `${formatInZone(sc.ms, s.event.timeZone)} · ${relativeTo(sc.ms, nowMs())}` : sc.state === "unscheduled" ? "No date or time yet" : "Schedule needs fixing"),
				s.event.hosts.length ? h("div", { class: "small" }, `Hosts: ${s.event.hosts.join(", ")}`) : null,
				s.event.topics.length ? h("div", { class: "row", style: null }, s.event.topics.map((t) => chip(t))) : null);
		}) : [h("div", { class: "empty" }, h("b", null, state.sessions.length ? "No sessions match these filters" : "No sessions yet"), state.sessions.length ? "Clear the search, topic or host filter." : "Use “New session” in the sidebar to plan your first virtual event.")]));
	};
	const q = h("input", { type: "search", id: "libQ", "aria-label": "Search sessions", placeholder: "Search title, host, topic…", value: lib.q, oninput: () => {
		lib.q = q.value;
		draw();
	} });
	const mkSel = (id, label, key, values) => {
		const sel = h("select", { id, "aria-label": label, onchange: () => {
			lib[key] = sel.value;
			draw();
		} }, h("option", { value: "" }, label), values.map((v) => h("option", { value: v }, v)));
		sel.value = values.includes(lib[key]) ? lib[key] : "";
		return sel;
	};
	const seg = h("div", { class: "seg", role: "group", "aria-label": "Show" }, [["all", "All"], ["upcoming", "Upcoming"], ["recorded", "Recorded"]].map(([v, l]) => {
		const b = h("button", { type: "button", "aria-pressed": lib.view === v ? "true" : "false", id: `view-${v}`, onclick: () => {
			lib.view = v;
			for (const x of seg.children) x.setAttribute("aria-pressed", x.id === `view-${v}` ? "true" : "false");
			draw();
		} }, l);
		return b;
	}));
	draw();
	return h("div", { class: "view" },
		h("header", null, h("div", { class: "eyebrow" }, "Library"), h("h1", null, "Session library"), h("p", { class: "lede" }, "Every session you are planning, like the index page that lists sessions on your site. Upcoming includes unscheduled sessions, labelled as such. Future/past is judged against the current UTC instant.")),
		h("div", { class: "lib-tools" }, q, mkSel("libTopic", "All topics", "topic", allTopics(state.sessions)), mkSel("libHost", "All hosts", "host", allHosts(state.sessions)), seg),
		count, grid);
}

// ---------- why webinars + canvas ----------
function viewWhy() {
	return h("div", { class: "view" },
		h("header", null, h("div", { class: "eyebrow" }, "Strategy"), h("h1", null, "Why virtual events"),
			h("p", { class: "lede" }, SIGNAL_COPY.live), h("p", { class: "lede" }, SIGNAL_COPY.onDemand),
			h("p", { class: "lede" }, "One session can serve many formats and channels before, during and after. Select any box to see how it connects. Drag to pan; use the buttons, or the keyboard (arrow keys pan, + and − zoom, 0 resets).")),
		canvasView(),
		state.sessions.length ? null : h("div", { class: "notice" }, "Ready to plan one? Use “New session” in the sidebar."));
}

function canvasView() {
	const NS = "http://www.w3.org/2000/svg";
	const el = (t, a = {}, ...kids) => {
		const e = document.createElementNS(NS, t);
		for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v));
		for (const k of kids) if (k) e.append(k);
		return e;
	};
	const byId = new Map(NODES.map((n) => [n.id, n]));
	const linked = (id) => EDGES.filter((e) => e.a === id || e.b === id);
	const view = h("div", { class: "canvas-view", id: "canvasView", tabindex: 0, role: "group", "aria-label": "Virtual event relationship map. Arrow keys pan, plus and minus zoom, zero resets. Tab to move between boxes; Enter selects.", "aria-describedby": "canvasHelp" });
	const svg = el("svg", { role: "presentation", focusable: "false" });
	const world = el("g", { id: "canvasWorld" });
	svg.append(world);
	view.append(svg);
	const edgeEls = EDGES.map((e) => {
		const a = byId.get(e.a), b = byId.get(e.b);
		let x1, y1, x2, y2, d;
		if (a.x + a.w <= b.x) [x1, y1, x2, y2] = [a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2];
		else if (b.x + b.w <= a.x) [x1, y1, x2, y2] = [a.x, a.y + a.h / 2, b.x + b.w, b.y + b.h / 2];
		else if (a.y < b.y) [x1, y1, x2, y2] = [a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y];
		else [x1, y1, x2, y2] = [a.x + a.w / 2, a.y, b.x + b.w / 2, b.y + b.h];
		const horizontal = a.x + a.w <= b.x || b.x + b.w <= a.x;
		d = horizontal ? `M${x1} ${y1} C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}` : `M${x1} ${y1} C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`;
		return el("path", { class: "edge", d, "data-a": e.a, "data-b": e.b });
	});
	world.append(...edgeEls);
	const nodeEls = new Map();
	for (const n of NODES) {
		const max = Math.floor(n.w / 6.1);
		const g = el("g", { class: `node k-${n.kind}`, tabindex: 0, role: "button", "aria-pressed": "false", "aria-label": `${n.label}: ${n.summary}`, "data-id": n.id, transform: `translate(${n.x} ${n.y})` },
			el("rect", { width: n.w, height: n.h }));
		const t1 = el("text", { x: 12, y: 23 });
		t1.textContent = n.label;
		const t2 = el("text", { x: 12, y: 42, class: "sub" });
		t2.textContent = n.summary.length > max ? `${n.summary.slice(0, max - 1)}…` : n.summary;
		g.append(t1, t2);
		g.addEventListener("keydown", (ev) => {
			if (ev.key === "Enter" || ev.key === " ") {
				ev.preventDefault();
				select(n.id);
			}
		});
		g.addEventListener("focus", () => ensureVisible(n));
		world.append(g);
		nodeEls.set(n.id, g);
	}
	const vp = { k: 1, x: 0, y: 0 };
	const zoomLabel = h("span", { class: "mono", role: "status", id: "zoomLabel", "aria-live": "polite" });
	const apply = () => {
		world.setAttribute("transform", `translate(${vp.x} ${vp.y}) scale(${vp.k})`);
		zoomLabel.textContent = `Zoom ${Math.round(vp.k * 100)}%`;
	};
	const clampK = (k) => Math.min(3, Math.max(0.25, k));
	const fit = () => {
		const w = view.clientWidth || 900, hh = view.clientHeight || 560;
		vp.k = clampK(Math.min(w / (CANVAS.width + 30), hh / (CANVAS.height + 30)));
		vp.x = (w - CANVAS.width * vp.k) / 2;
		vp.y = (hh - CANVAS.height * vp.k) / 2;
		apply();
	};
	const zoomBy = (f, cx = view.clientWidth / 2, cy = view.clientHeight / 2) => {
		const k = clampK(vp.k * f);
		vp.x = cx - (cx - vp.x) * (k / vp.k);
		vp.y = cy - (cy - vp.y) * (k / vp.k);
		vp.k = k;
		apply();
	};
	const panBy = (dx, dy) => {
		vp.x += dx;
		vp.y += dy;
		apply();
	};
	function ensureVisible(n) {
		const w = view.clientWidth, hh = view.clientHeight;
		const sx = vp.x + n.x * vp.k, sy = vp.y + n.y * vp.k;
		if (sx < 0 || sy < 0 || sx + n.w * vp.k > w || sy + n.h * vp.k > hh) {
			vp.x = w / 2 - (n.x + n.w / 2) * vp.k;
			vp.y = hh / 2 - (n.y + n.h / 2) * vp.k;
			apply();
		}
	}
	const detail = h("aside", { class: "detail", id: "nodeDetail", "aria-live": "polite", "aria-label": "Selected item details" });
	let selected = null;
	function select(id) {
		selected = id;
		for (const [nid, g] of nodeEls) {
			g.classList.toggle("sel", nid === id);
			g.setAttribute("aria-pressed", nid === id ? "true" : "false");
			g.classList.toggle("linked", !!id && nid !== id && linked(id).some((e) => e.a === nid || e.b === nid));
		}
		for (const p of edgeEls) p.classList.toggle("on", !!id && (p.getAttribute("data-a") === id || p.getAttribute("data-b") === id));
		drawDetail();
	}
	function drawDetail() {
		if (!selected) {
			detail.replaceChildren(h("div", { class: "eyebrow" }, "Details"), h("p", null, "Select a box on the map, or use the outline below, to see why it matters and what it connects to."));
			return;
		}
		const n = byId.get(selected);
		const rel = linked(selected);
		detail.replaceChildren(
			h("div", { class: "eyebrow" }, n.kind === "core" ? "Session" : n.kind === "signal" ? "Engagement signal" : n.kind === "format" ? "Format" : n.kind === "phase" ? "Phase" : "Channel"),
			h("h3", { id: "detailTitle" }, n.label), h("p", null, n.summary), h("ul", null, n.details.map((d) => h("li", null, d))),
			h("h4", { class: "eyebrow" }, `Connected (${rel.length})`),
			h("div", { class: "links" }, rel.map((e) => {
				const other = byId.get(e.a === selected ? e.b : e.a);
				return h("button", { type: "button", class: "sm", title: `${e.a === selected ? n.label : other.label} ${e.label} ${e.a === selected ? other.label : n.label}`, onclick: () => {
					select(other.id);
					ensureVisible(other);
					nodeEls.get(other.id).focus();
				} }, other.label);
			})),
			h("button", { type: "button", class: "sm ghost", onclick: () => select(null) }, "Clear selection"));
	}
	// pointer interaction: drag to pan, click (no movement) to select
	let drag = null;
	view.addEventListener("pointerdown", (ev) => {
		if (ev.button !== 0) return;
		drag = { x: ev.clientX, y: ev.clientY, moved: false, node: ev.target.closest?.(".node")?.getAttribute("data-id") ?? null, id: ev.pointerId };
	});
	view.addEventListener("pointermove", (ev) => {
		if (!drag || ev.pointerId !== drag.id) return;
		const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
		if (!drag.moved && Math.hypot(dx, dy) > 4) {
			drag.moved = true;
			view.setPointerCapture(ev.pointerId);
		}
		if (drag.moved) {
			panBy(dx, dy);
			drag.x = ev.clientX;
			drag.y = ev.clientY;
		}
	});
	const endDrag = (ev) => {
		if (!drag || ev.pointerId !== drag.id) return;
		if (!drag.moved && ev.type === "pointerup") {
			if (drag.node) select(drag.node);
		}
		drag = null;
	};
	view.addEventListener("pointerup", endDrag);
	view.addEventListener("pointercancel", endDrag);
	view.addEventListener("wheel", (ev) => {
		if (!(ev.ctrlKey || ev.metaKey)) return;
		ev.preventDefault();
		const r = view.getBoundingClientRect();
		zoomBy(ev.deltaY < 0 ? 1.12 : 1 / 1.12, ev.clientX - r.left, ev.clientY - r.top);
	}, { passive: false });
	view.addEventListener("keydown", (ev) => {
		if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
		const step = ev.shiftKey ? 160 : 60;
		const keys = { ArrowLeft: () => panBy(step, 0), ArrowRight: () => panBy(-step, 0), ArrowUp: () => panBy(0, step), ArrowDown: () => panBy(0, -step), "+": () => zoomBy(1.2), "=": () => zoomBy(1.2), "-": () => zoomBy(1 / 1.2), _: () => zoomBy(1 / 1.2), 0: fit, Escape: () => select(null) };
		if (keys[ev.key]) {
			ev.preventDefault();
			keys[ev.key]();
		}
	});
	const tool = (label, fn, id) => h("button", { type: "button", class: "sm", id, "aria-label": label, onclick: fn }, label);
	const tools = h("div", { class: "canvas-tools", role: "toolbar", "aria-label": "Map controls" },
		tool("Zoom in", () => zoomBy(1.2), "zoomIn"), tool("Zoom out", () => zoomBy(1 / 1.2), "zoomOut"), tool("Reset view", fit, "zoomReset"),
		tool("◀ Pan left", () => panBy(80, 0), "panL"), tool("▲ Pan up", () => panBy(0, 80), "panU"), tool("▼ Pan down", () => panBy(0, -80), "panD"), tool("▶ Pan right", () => panBy(-80, 0), "panR"), zoomLabel);
	const outline = h("details", { class: "card" }, h("summary", null, "Text outline of the map (same content, no canvas needed)"),
		...[["core", "Session"], ["signal", "Engagement signal"], ["format", "Formats"], ["phase", "Before, during, after"], ["channel", "Channels"]].map(([kind, title]) => h("div", null, h("h3", null, title),
			h("div", { class: "links" }, NODES.filter((n) => n.kind === kind).map((n) => h("button", { type: "button", class: "sm", onclick: () => select(n.id) }, n.label))))));
	drawDetail();
	requestAnimationFrame(fit);
	const onResize = () => view.isConnected && fit();
	window.addEventListener("resize", onResize);
	viewCleanup = () => window.removeEventListener("resize", onResize);
	return h("div", null,
		h("div", { class: "canvas-wrap" },
			h("div", { class: "canvas-box" }, tools, view,
				h("div", { class: "legend", id: "canvasHelp" }, h("span", null, "Dark: the session"), h("span", null, "Green: engagement signal"), h("span", null, "Peach: before / during / after"), h("span", null, "Left: formats · Right: channels"))),
			detail),
		outline);
}

// ---------- start ----------
// The skip link must not change the hash: "#stage" is not a route and would navigate away from the open session.
document.querySelector(".skip")?.addEventListener("click", (ev) => {
	ev.preventDefault();
	$("#stage").focus();
});
$("#menuBtn").addEventListener("click", () => {
	const closed = document.body.classList.toggle("side-closed");
	$("#menuBtn").setAttribute("aria-expanded", closed ? "false" : "true");
});
window.addEventListener("hashchange", () => {
	render();
	$("#stage").scrollTop = 0;
});
window.addEventListener("storage", (ev) => {
	if (ev.key === null || ev.key.startsWith("growthcast.webinar-strategy")) showBanner("Another tab changed the saved data. Reload this tab before editing to avoid losing changes.", true, backupButton(), reloadButton());
});
boot();
render();
