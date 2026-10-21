// The studio app: one launch at a time across tabs (Overview, Brief & tier, Checklist, Messaging, Assets, Measure,
// Readiness, Retro), plus the portfolio of every launch. Edits bind straight into the launch object and save after a
// short pause. The server file is the source of truth: when its version changes underneath (Claude edited it), the
// studio reloads it. Ask Claude queues a request that goes to Claude Code with the user's next message there.
// The same app runs in the GrowthCast client portal ("web mode", see below), so every API path is relative.
import { ITEMS as ITEM_DEFS, VIDEO_APPROVERS, VIDEO_DELIVERABLES, VIDEO_FORMATS, VIDEO_HANDOFFS, DELIVERABLE_STATUS, ASSETS, ASSET_STATUS, ITEM_STATUS, LAUNCH_STATUS, PHASES, ROLES, ROLE_INFO, RUBRIC, workload, STAGES, TIERS, VERDICT, addDays, assetsFor, checks, daysBetween, effectiveTier, fmtDate, itemsFor, progress, readiness, tLabel, tierOf, tierScore, tierFromScore, today, validDate } from "./model.mjs";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const store = {
	get: (k, d) => {
		try {
			return JSON.parse(localStorage.getItem(k)) ?? d;
		} catch {
			return d;
		}
	},
	set: (k, v) => {
		try {
			localStorage.setItem(k, JSON.stringify(v));
		} catch {}
	},
};
const TABS = [
	["overview", "Overview"],
	["brief", "Brief & tier"],
	["staffing", "Staffing"],
	["checklist", "Checklist"],
	["video", "Video"],
	["messaging", "Messaging"],
	["assets", "Assets"],
	["measure", "Measure"],
	["readiness", "Readiness"],
	["retro", "Retro"],
];
const ASK = { "video-script": "Write video script", "video-produce": "Plan or make the video", "video-review": "Turn notes into revisions", sync: "Sync to Linear", plan: "Publish team plan", intake: "Fill brief from note", tier: "Score tier", messaging: "Write message house", assets: "Draft assets", review: "Red-team review", measure: "Plan measurement", readout: "Write readout", retro: "Run retro" };
const TAB_ASKS = { overview: ["review", "intake"], brief: ["intake", "tier"], staffing: ["sync", "plan"], checklist: ["review", "sync"], video: ["video-script", "video-produce", "video-review"], messaging: ["messaging"], assets: ["assets"], measure: ["measure", "readout"], readiness: ["review"], retro: ["retro"] };
// Web mode is the hosted studio inside the GrowthCast client portal (github.com/B2B-Saas-Inc/growthcast-release-checklist).
// api/settings says so and lists the person's portal projects, whether they can edit (clients only view) and which
// requests Claude can run there. Ask Claude runs on the server instead of waiting for Claude Code; Linear sync, folder
// exports and Artifact links are Claude Code features, so they aren't offered.
const WEB = () => S.settings.mode === "web";
const RO = () => WEB() && !S.settings.canEdit;
// Locally anyone can delete a launch; in the portal only owners and admins can.
const canDelete = () => !WEB() || S.settings.canDelete === true;
const askKinds = () => Object.keys(ASK).filter((k) => !WEB() || (S.settings.asks ?? []).includes(k));
const VIEW_ACTS = new Set(["show", "note", "teamPlan", "openScript"]);
// Launches that can collide with this one: in the portal, only those in the same client project.
const sameProject = (l) => (WEB() ? S.launches.filter((x) => x.project?.id === l.project?.id) : S.launches);
const projectName = (id) => S.settings.projects?.find((p) => p.id === id)?.name ?? "";
const S = { launches: [], launch: null, version: null, tab: store.get("prc-tab", "overview"), portfolio: false, dirty: false, saving: false, request: null, settings: {}, assetSel: null, picked: new Set(), notes: new Set(), f: { phase: "", who: "", show: "all", q: "" }, project: "", linear: null };

// --- Data ---
async function api(path, opts = {}) {
	const r = await fetch(path, { ...opts, headers: { "content-type": "application/json", ...(opts.headers ?? {}) } });
	const body = (r.headers.get("content-type") ?? "").includes("json") ? await r.json() : await r.text();
	if (!r.ok && r.status !== 409) throw new Error(body?.error ?? body);
	return { status: r.status, body };
}
const post = (path, data, method = "POST") => api(path, { method, body: JSON.stringify(data) });
async function loadList() {
	S.launches = (await api("api/launches")).body;
}
async function open(id) {
	const { body } = await api(`api/launches/${id}`);
	S.launch = body.launch;
	S.version = body.version;
	S.dirty = false;
	S.portfolio = false;
	if (!S.assetSel) S.assetSel = assetsFor(S.launch)[0]?.id;
}
let saveTimer;
function markDirty() {
	S.dirty = true;
	$("#saveState").textContent = "Editing…";
	clearTimeout(saveTimer);
	saveTimer = setTimeout(save, 600);
}
async function save() {
	clearTimeout(saveTimer);
	if (!S.launch || !S.dirty || S.saving) return;
	S.saving = true;
	S.dirty = false;
	try {
		const r = await fetch(`api/launches/${S.launch.id}`, { method: "PUT", headers: { "content-type": "application/json", "x-base-version": S.version ?? "" }, body: JSON.stringify(S.launch) });
		const b = await r.json();
		if (r.status === 409) {
			S.launch = b.launch;
			S.version = b.version;
			toast("This launch was changed outside the studio, so the latest version is loaded. Your last edit may need redoing.");
			render();
		} else if (!r.ok) throw new Error(b.error);
		else {
			S.version = b.version;
			$("#saveState").textContent = "Saved";
			const i = S.launches.findIndex((x) => x.id === S.launch.id);
			if (i >= 0) Object.assign(S.launches[i], { name: S.launch.name, t0: S.launch.t0, status: S.launch.status, tier: tierOf(S.launch) });
		}
	} catch (e) {
		S.dirty = true;
		$("#saveState").textContent = "Not saved";
		toast(`Couldn't save: ${e.message}`);
	} finally {
		S.saving = false;
		if (S.dirty) markDirty();
	}
}
async function poll() {
	try {
		if (S.launch && !S.dirty && !S.saving) {
			const { body } = await api(`api/launches/${S.launch.id}/version`);
			if (body.version && body.version !== S.version) {
				await open(S.launch.id);
				await loadList();
				toast(S.request?.kind === "sync" && S.request.status !== "failed" ? "Synced with Linear." : S.request?.deliveredAt || S.request?.status === "running" ? "Claude updated the launch." : "The launch was updated.");
				render();
			}
		}
		const { body } = await api(`api/request?launchId=${encodeURIComponent(S.launch?.id ?? "")}`);
		const prev = JSON.stringify(S.request);
		S.request = body && body.launchId === S.launch?.id && Date.now() - body.at < 12 * 3600e3 ? body : null;
		if (JSON.stringify(S.request) !== prev) renderAsk();
	} catch {}
}

// --- Paths ---
const getPath = (o, p) => p.split(".").reduce((a, k) => a?.[k], o);
function setPath(o, p, v) {
	const ks = p.split(".");
	const last = ks.pop();
	const t = ks.reduce((a, k) => (a[k] ??= /^\d+$/.test(k) ? [] : {}), o);
	t[last] = v;
}
const itemState = (id) => (S.launch.items[id] ??= { status: "todo", owner: "", due: "", evidence: "", note: "" });
const assetState = (id) => (S.launch.assets[id] ??= { status: "todo", owner: "", link: "", body: "", updatedBy: "" });

// --- Field helpers ---
const opt = (list, v) => list.map(([k, l]) => `<option value="${esc(k)}"${k === v ? " selected" : ""}>${esc(l)}</option>`).join("");
const field = (label, inner, cls = "") => `<label class="field ${cls}"><span>${label}</span>${inner}</label>`;
const inp = (path, ph = "", extra = "") => `<input data-bind="${path}" value="${esc(getPath(S.launch, path))}" placeholder="${esc(ph)}" ${extra}>`;
const ta = (path, ph = "", rows = 3) => `<textarea data-bind="${path}" rows="${rows}" placeholder="${esc(ph)}">${esc(getPath(S.launch, path))}</textarea>`;
const tierPill = (t) => (t ? `<span class="pill-tier t${t}">T${t}</span>` : `<span class="pill-tier t3">unscored</span>`);
const countdown = (l) => {
	const d = daysBetween(today(), l.t0);
	return d === 0 ? "Launch day" : d > 0 ? `T-${d}` : `T+${-d}`;
};

// --- Render ---
function render() {
	const l = S.launch;
	document.body.classList.toggle("portfolio", !l || S.portfolio);
	document.body.classList.toggle("web", WEB());
	document.body.classList.toggle("readonly", RO());
	$("#newLaunch").hidden = RO();
	$("#settingsBtn").hidden = RO();
	$("#launchSel").innerHTML = `<option value="">All launches…</option>${S.launches.map((x) => `<option value="${x.id}"${x.id === l?.id && !S.portfolio ? " selected" : ""}>${esc(x.name)}</option>`).join("")}`;
	for (const el of ["#launchName", "#launchStatus", "#shareBtn", "#tabs"]) $(el).hidden = !l || S.portfolio;
	if (l) {
		$("#launchName").value = l.name;
		$("#launchStatus").innerHTML = opt(LAUNCH_STATUS, l.status);
	}
	const scroll = $("#stage").scrollTop;
	$("#stage").innerHTML = !l || S.portfolio ? viewPortfolio() : `<div class="view">${VIEWS[S.tab]()}</div>`;
	$("#stage").scrollTop = scroll;
	refreshSide();
	lock();
}
// Clients see everything but can't change it. The server refuses their writes either way.
function lock() {
	if (!RO()) return;
	for (const el of document.querySelectorAll("#stage input, #stage select, #stage textarea, #launchName, #launchStatus")) if (!el.dataset.filter && !el.matches("[data-portfolio-project]")) el.disabled = true;
	for (const el of document.querySelectorAll("#stage [data-act]")) if (!VIEW_ACTS.has(el.dataset.act)) el.hidden = true;
	for (const el of document.querySelectorAll("#stage [data-ask]")) el.hidden = true;
}
function refreshSide() {
	const l = S.launch;
	if (!l || S.portfolio) return;
	const c = checks(l, sameProject(l));
	const p = progress(l);
	const r = readiness(l);
	const w = workload(l);
	const unstaffed = w.roles.filter((x) => !x.person).length;
	const counts = { staffing: l.people.length ? [unstaffed ? `${unstaffed} open` : `${l.people.length}`, unstaffed > 0] : null, checklist: p.overdue ? [p.overdue, true] : null, readiness: [VERDICT[r.verdict] === "GO" ? "GO" : r.gates.filter((g) => !g.ok).length || "!", r.verdict === "no-go"], assets: [assetsFor(l).filter((a) => ["approved", "live"].includes(a.status)).length + "/" + assetsFor(l).length, false] };
	$("#tabs").innerHTML = TABS.map(([k, label]) => `<button data-tab="${k}" class="${S.tab === k ? "on" : ""}">${label}${counts[k] ? `<span class="count ${counts[k][1] ? "bad" : ""}">${counts[k][0]}</span>` : ""}</button>`).join("");
	$("#checks").innerHTML = c.length ? `<ul class="chk">${c.map((x) => `<li class="sev-${x.severity}" data-goto="${esc(x.item ?? "")}" data-area="${esc(x.area)}"><b>${esc(x.area)}</b>${esc(x.text)}</li>`).join("")}</ul>` : `<p class="allclear">✓ No open checks.</p>`;
	renderAsk();
}
function renderAsk() {
	const kinds = askKinds();
	const mine = (TAB_ASKS[S.tab] ?? ["review"]).filter((k) => kinds.includes(k));
	const rest = kinds.filter((k) => !mine.includes(k));
	$("#askBtns").innerHTML = mine.map((k, i) => `<button data-ask="${k}" class="${i === 0 ? "primary" : ""}">${ASK[k]}${k === "assets" && S.picked.size ? ` (${S.picked.size})` : ""}</button>`).join("") + `<select data-ask-select class="ask-more"><option value="">Other requests…</option>${rest.map((k) => `<option value="${k}">${ASK[k]}</option>`).join("")}</select>`;
	const r = S.request;
	const el = $("#askState");
	if (!r) return (el.hidden = true);
	el.hidden = false;
	const label = ASK[r.kind] ?? (r.kind === "share" ? "Publish share link" : r.kind);
	if (WEB()) {
		el.className = `ask-state ${r.status === "running" ? "queued" : r.status === "done" ? "got" : "failed"}`;
		const sync = r.kind === "sync";
		el.innerHTML = r.status === "running" ? (sync ? "<b>Syncing to Linear.</b> The project link and issue states appear here when it's done." : `<b>Claude is working on “${esc(label)}”.</b> Changes appear here when it's done, usually within a couple of minutes.`) : r.status === "done" ? `<b>${sync ? "Synced to Linear." : `Claude finished “${esc(label)}”.`}</b> ${esc(r.summary ?? "")} <button class="sm" data-ask-clear>Dismiss</button>` : `<b>“${esc(label)}” didn't finish.</b> ${esc(r.error || "Try again.")} <button class="sm" data-ask-clear>Dismiss</button>`;
		return;
	}
	el.className = `ask-state ${r.deliveredAt ? "got" : "queued"}`;
	el.innerHTML = r.deliveredAt ? `<b>Claude picked up “${esc(label)}”.</b> Changes appear here as they're saved. <button class="sm" data-ask-clear>Dismiss</button>` : `<b>Queued: “${esc(label)}”.</b> Switch to Claude Code and send any message (“go” is enough). The request goes with it. <button class="sm" data-ask-clear>Cancel</button>`;
}

// --- Views ---
const VIEWS = { overview: viewOverview, video: viewVideo, staffing: viewStaffing, brief: viewBrief, checklist: viewChecklist, messaging: viewMessaging, assets: viewAssets, measure: viewMeasure, readiness: viewReadiness, retro: viewRetro };

function timeline(l, items) {
	const from = -30, to = 30, span = to - from;
	const x = (d) => `${(100 * (Math.max(from, Math.min(to, d)) - from)) / span}%`;
	const bands = [[-30, -21, "Decide"], [-21, -14, "Narrative"], [-14, -5, "Build"], [-5, -1, "Go/No-go"], [-1, 1, ""], [1, 30, "Amplify · Measure"]];
	const now = daysBetween(l.t0, today());
	const stack = {};
	const depth = Math.max(1, ...Object.values(items.reduce((a, i) => ((a[Math.min(to, daysBetween(l.t0, i.due))] = (a[Math.min(to, daysBetween(l.t0, i.due))] ?? 0) + 1), a), {})));
	return `<div class="tl" style="height:${80 + depth * 11}px">
		${bands.map(([a, b, lab]) => `<div class="band" style="left:${x(a)};width:calc(${x(b)} - ${x(a)})">${lab}</div>`).join("")}
		<div class="t0" style="left:${x(0)}"><span>T-0 ${fmtDate(l.t0)}</span></div>
		${now >= from && now <= to ? `<div class="now" style="left:${x(now)}"><span style="${now > 18 ? "left:auto;right:4px" : ""}">Today</span></div>` : ""}
		${items.map((i) => { const d = Math.min(to, daysBetween(l.t0, i.due)); const n = (stack[d] = (stack[d] ?? -1) + 1); return `<i class="dot ${i.status === "done" ? "done" : i.status === "waived" || i.status === "na" ? "waived" : i.overdue ? "late" : ""}" style="left:${x(d)};top:${62 + n * 11}px" title="${esc(i.text)} · ${tLabel(daysBetween(l.t0, i.due))}" data-goto="${i.id}"></i>`; }).join("")}
		<div class="ticks" style="top:auto;bottom:0">${[-30, -21, -14, -7, 0, 7, 14, 21, 30].map((d) => `<span style="left:${x(d)}">${tLabel(d)}</span>`).join("")}</div>
	</div>`;
}

function viewOverview() {
	const l = S.launch;
	const p = progress(l);
	const r = readiness(l);
	const t = tierOf(l);
	const next = p.items.filter((i) => i.open).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 6);
	const as = assetsFor(l);
	const byStatus = ASSET_STATUS.map(([k, lab]) => [lab, as.filter((a) => a.status === k).length]);
	return `<p class="eyebrow">${esc(LAUNCH_STATUS.find(([k]) => k === l.status)[1])} · ${t ? esc(TIERS[t].label) : "Tier not scored"}</p>
	<h1 class="title">${esc(l.name)}</h1>
	<p class="lede">${esc(l.brief.description.split("\n")[0].slice(0, 280)) || "Describe the launch on the Brief tab, or paste a PRD link under Ask Claude and press <b>Fill brief from note</b>.".replace(/<[^>]+>/g, "")}</p>
	<div class="stats">
		<div><span>Tier</span><b>${t ? `T${t}` : "—"}</b><small>${t ? esc(TIERS[t].desc.split(".")[0]) : "Score it on Brief & tier"}</small></div>
		<div><span>Countdown</span><b>${countdown(l)}</b><small>${fmtDate(l.t0)}</small></div>
		<div><span>Checklist</span><b>${p.pct}%</b><small>${p.done} of ${p.total} done</small></div>
		<div><span>Overdue</span><b class="${p.overdue ? "v-no-go" : ""}">${p.overdue}</b><small>${p.overdue ? "needs attention" : "on schedule"}</small></div>
		<div><span>Readiness</span><b class="v-${r.verdict}" style="font-size:20px">${VERDICT[r.verdict]}</b><small>${r.gates.filter((g) => g.ok).length}/${r.gates.length} gates</small></div>
	</div>
	<div class="card"><h2>Timeline <small>T-30 → T+30 · click a dot to open the item</small></h2>${timeline(l, p.items)}</div>
	<div class="grid2">
		<div class="card"><h2>Next up</h2>${next.length ? `<table class="tbl"><tbody>${next.map((i) => `<tr class="click" data-goto="${i.id}"><td class="mono" style="width:90px${i.overdue ? ";color:var(--error)" : ""}">${fmtDate(i.due)}</td><td>${esc(i.text)}</td><td class="mono">${esc(i.owner || i.role)}</td></tr>`).join("")}</tbody></table>` : `<p class="hint">Nothing open. 🎉</p>`}</div>
		<div class="card"><h2>Assets <small>${as.length} for ${t ? `T${t}` : "this tier"}</small></h2><table class="tbl"><tbody>${byStatus.map(([lab, n]) => `<tr><td>${lab}</td><td class="mono" style="text-align:right">${n}</td></tr>`).join("")}</tbody></table>
		<h3>Launch DRI</h3><p style="margin:0">${esc(l.dri) || '<span class="v-no-go">Unassigned</span>'}</p></div>
	</div>`;
}

function viewBrief() {
	const l = S.launch;
	const { total, complete } = tierScore(l);
	const t = tierOf(l);
	const rf = l.rollout.full;
	return `<h2>Brief <small>the facts every asset and decision builds on</small></h2>
	<div class="card grid2">
		${field("What we're shipping (plain language)", ta("brief.description", "One paragraph a customer would understand.", 4), "span2")}
		${field("Launch DRI <em>one person</em>", inp("dri", "Name (not the founder)"))}
		${field("T-0 launch date", `<input type="date" data-bind="t0" data-rerender value="${esc(l.t0)}">`)}
		${field("Primary persona", inp("brief.persona", "e.g. Established home-services operator"))}
		${field("Job to be done", inp("brief.job", "When I…, I want to…, so I can…"))}
		${field("What they use today instead", inp("brief.alternative", "Spreadsheet, a competitor, a freelancer, nothing"))}
		${field("Business outcome", inp("brief.outcome", "Acquisition, conversion, retention or expansion"))}
		${field("Customer evidence <em>requests, churn reasons, beta results</em>", ta("brief.evidence", "Leave blank rather than guess. A T1 without evidence is flagged.", 3), "span2")}
	</div>
	<h2 style="margin-top:24px">Eligibility & rollout</h2>
	<div class="card grid3">
		${field("Plans", inp("brief.plans", "e.g. Launch + Grow"))}
		${field("Platforms", inp("brief.platforms", "Web, iOS, Android"))}
		${field("Regions / languages", inp("brief.regions", "e.g. All; EN first"))}
		${field("Pricing / packaging", inp("brief.pricing", "Included, add-on, upgrade trigger…"), "span2")}
		<label class="field"><span>Decided?</span><span class="row" style="font-family:var(--sans);font-size:13px;color:var(--fg)"><input type="checkbox" data-bind="brief.pricingDecided" data-rerender ${l.brief.pricingDecided ? "checked" : ""}> Pricing is final</span></label>
		<div class="field span2"><span>Is 100% of the announced audience live at T-0?</span>
			<div class="seg">${[[true, "Yes"], [false, "No, staged"], [null, "Not confirmed"]].map(([v, lab]) => `<button data-act="rollout" data-v="${v}" class="${rf === v ? "on" : ""}">${lab}</button>`).join("")}</div></div>
		${field("Rollout note", inp("rollout.note", "Flag name, % schedule"))}
		${field("Risks and open questions", ta("brief.risks", "", 3), "span2")}
		${field("Links (PRD, designs, tickets)", ta("brief.links", "", 2))}
	</div>
	<h2 style="margin-top:24px">Tier <small>score each factor 0–3 · 11–15 T1 · 6–10 T2 · 0–5 T3</small></h2>
	<div class="card">
		${RUBRIC.map((f) => `<div class="factor"><div><b>${esc(f.label)}</b><span class="hint">${esc(f.q)}</span></div>
			<div class="levels">${f.levels.map((lev, n) => `<button data-act="score" data-f="${f.id}" data-v="${n}" class="${l.tier.scores[f.id] === n ? "on" : ""}"><i>${n}</i>${esc(lev)}</button>`).join("")}</div>
			<div class="reason">${inp(`tier.reasons.${f.id}`, "Why (one line)")}</div></div>`).join("")}
		<div class="tier-result">
			<div><span class="hint">Score</span><div class="big">${total}<span class="hint" style="font-size:16px">/15</span></div></div>
			<div><span class="hint">Tier</span><div class="big ${t ? `t${t}` : ""}">${t ? `T${t}` : "—"}</div></div>
			<div style="flex:1;min-width:240px"><b>${complete ? esc(TIERS[tierFromScore(total)].label) : "Score all five factors"}</b>${complete ? `<div class="hint">${esc(TIERS[tierFromScore(total)].desc)}</div>` : ""}</div>
			${field("Override", `<select data-act-change="override">${opt([["", "Use score"], ["1", "T1"], ["2", "T2"], ["3", "T3"]], l.tier.override ? String(l.tier.override) : "")}</select>`)}
		</div>
		${l.tier.override ? field("Override reason <em>required</em>", inp("tier.overrideReason", "Why the score is wrong for this launch")) : ""}
	</div>
	${canDelete() ? `<h2 style="margin-top:24px">Delete launch</h2>
	<div class="card row"><span class="hint" style="flex:1">Removes “${esc(l.name)}”${WEB() ? " for everyone on the project" : " and its file"}. You can't undo this from the studio.</span><button class="danger" data-act="deleteLaunch">Delete launch</button></div>` : ""}`;
}

function viewChecklist() {
	const l = S.launch;
	const p = progress(l);
	const f = S.f;
	const q = f.q.toLowerCase();
	const who = (i) => !f.who || (f.who === "unassigned" ? !i.person : f.who.startsWith("p:") ? i.person?.id === f.who.slice(2) : i.role === f.who.slice(2));
	const shown = p.items.filter((i) => (!f.phase || i.phase === f.phase) && who(i) && (f.show === "all" || (f.show === "open" && i.open) || (f.show === "overdue" && i.overdue) || (f.show === "gates" && i.gate)) && (!q || `${i.text} ${i.owner} ${i.role}`.toLowerCase().includes(q)));
	const owners = [...new Set([...l.people.map((x) => x.name), l.dri, ...Object.values(l.items).map((x) => x.owner)].filter(Boolean))];
	const roles = [...new Set(p.items.map((i) => i.role))];
	const whoOpts = [["", "Everyone"], ...l.people.map((x) => [`p:${x.id}`, x.name || x.email]), ["unassigned", "Unassigned"], ...roles.map((r) => [`r:${r}`, `Role: ${r}`])];
	return `<h2>Checklist <small>${p.done}/${p.total} done · tier ${tierOf(l) ? `T${tierOf(l)}` : "unscored (showing T1)"} · due dates count back from T-0 ${fmtDate(l.t0)}</small></h2>
	<p class="lede">Add an evidence link where it helps; it's optional. Clear a due date to return it to the plan.</p>
	<div class="filters">
		<div class="seg">${[["all", "All"], ["open", "Open"], ["overdue", "Overdue"], ["gates", "Gates"]].map(([k, lab]) => `<button data-act="show" data-v="${k}" class="${f.show === k ? "on" : ""}">${lab}</button>`).join("")}</div>
		<select data-filter="phase"><option value="">All phases</option>${opt(PHASES.map((x) => [x.id, x.label]), f.phase)}</select>
		<select data-filter="who">${opt(whoOpts, f.who)}</select>
		<input data-filter="q" placeholder="Search" value="${esc(f.q)}" style="width:180px">
		<button data-act="newItem">+ Add item</button>
	</div>
	<datalist id="owners">${[...owners, ...ROLES].map((o) => `<option value="${esc(o)}">`).join("")}</datalist>
	${PHASES.map((ph) => {
		const all = p.items.filter((i) => i.phase === ph.id);
		const its = shown.filter((i) => i.phase === ph.id);
		if (!its.length) return "";
		const done = all.filter((i) => ["done", "waived", "na"].includes(i.status)).length;
		return `<div class="phase"><div class="phase-head"><h3>${esc(ph.label)} <small>${esc(ph.window)}</small></h3><div class="bar"><i style="width:${(100 * done) / all.length}%"></i></div><span class="mono muted">${done}/${all.length}</span></div>
		${its.map(itemRow).join("")}</div>`;
	}).join("") || `<div class="empty"><b>Nothing matches</b>Change the filters above.</div>`}
	<div class="card"><h3>Add an item</h3><div class="row"><input id="newText" placeholder="Something this launch needs that the checklist doesn't cover" style="flex:1;min-width:240px"><select id="newPhase" style="width:auto">${opt(PHASES.map((x) => [x.id, x.label]), "build")}</select><select id="newRole" style="width:auto">${opt(ROLES.map((r) => [r, r]), "DRI")}</select><input id="newDue" type="number" value="-5" title="Days from T-0" style="width:80px"><button data-act="addItem">Add</button></div></div>
	${removedItems(l).length ? `<div class="card"><h3>Removed from this launch <small>${removedItems(l).length}</small></h3><table class="tbl"><tbody>${removedItems(l).map((i) => `<tr><td>${esc(l.items[i.id].text || i.text)}</td><td class="mono muted">${esc(phaseName(i.phase))}</td><td style="text-align:right"><button class="sm" data-act="restoreItem" data-id="${i.id}">Restore</button></td></tr>`).join("")}</tbody></table></div>` : ""}`;
}
// Default items removed from this launch (they can be restored), for the current tier.
const removedItems = (l) => ITEM_DEFS.filter((i) => l.items[i.id]?.removed && i.tiers.includes(effectiveTier(l)));
const phaseName = (id) => PHASES.find((p) => p.id === id)?.label ?? id;

function itemRow(i) {
	const d = daysBetween(S.launch.t0, i.due);
	return `<div class="item st-${i.status} ${i.overdue ? "late" : ""}" id="it-${i.id}">
		<select class="stsel" data-v="${i.status}" data-item="${i.id}" data-f="status" data-rerender>${opt(ITEM_STATUS, i.status)}</select>
		<div class="txt"><span class="t">${esc(i.text)}</span>${i.gate ? '<span class="badge">GATE</span>' : ""}${i.custom ? '<span class="badge">custom</span>' : i.edited ? '<span class="badge">edited</span>' : ""}<small>${esc(i.role)}${i.person && !i.owner ? ` → ${esc(i.person.name)}` : ""} · ${tLabel(d)}${i.due !== i.planned ? " · moved" : ""}${i.issue ? ` · <a href="${esc(i.issue.url)}" target="_blank" rel="noopener">${esc(i.issue.identifier || "Linear")}</a>` : ""}</small></div>
		<input list="owners" data-item="${i.id}" data-f="owner" value="${esc(i.owner)}" placeholder="${esc(i.person?.name || i.role)}" title="Leave blank to use whoever is staffed on ${esc(i.role)}">
		<input type="date" class="due ${i.overdue ? "late" : ""}" data-item="${i.id}" data-f="due" data-rerender value="${esc(i.due)}">
		<input class="ev" data-item="${i.id}" data-f="evidence" value="${esc(i.evidence)}" placeholder="Evidence link (optional)">
		<span class="item-acts"><button class="ghost sm" data-act="editItem" data-id="${i.id}" title="Edit or delete this item">Edit</button><button class="ghost sm more" data-act="note" data-id="${i.id}" title="Note${i.status === "waived" ? " (waiver reason)" : ""}">${i.note ? "✎" : "…"}</button></span>
		${S.notes.has(i.id) || (i.status === "waived" && !i.note) ? `<textarea class="note" rows="2" data-item="${i.id}" data-f="note" placeholder="${i.status === "waived" ? "Why the DRI waived this" : "Note"}">${esc(i.note)}</textarea>` : ""}
	</div>`;
}

// In the portal, Linear is connected per project through Composio: its Connect page, in a new tab, is where the person
// signs in to Linear and picks the workspace. The sync then runs on the server.
async function loadLinear(force) {
	const pid = S.launch?.project?.id;
	if (!WEB() || !pid || !S.settings.linear) return;
	if (!force && S.linear?.projectId === pid) return;
	const teams = S.linear?.projectId === pid ? S.linear.teams : null;
	S.linear = { ...(await api(`api/linear?projectId=${encodeURIComponent(pid)}`)).body, teams };
	if (S.linear.connected && !RO() && !teams) S.linear.teams = (await api(`api/linear/teams?projectId=${encodeURIComponent(pid)}`)).body;
	if (S.tab === "staffing" && !S.portfolio) render();
}
let linearWait;
function waitForLinear() {
	clearInterval(linearWait);
	const until = Date.now() + 10 * 60e3;
	linearWait = setInterval(async () => {
		if (Date.now() > until || !S.linear?.pending) return clearInterval(linearWait);
		await loadLinear(true).catch(() => {});
		if (S.linear?.connected) toast(`Linear connected: ${S.linear.workspace}.`);
	}, 3000);
}
function linearCard(l) {
	if (!S.settings.linear) return "";
	const ln = l.sync.linear;
	const c = S.linear;
	const open = ln.projectUrl ? `<a class="btnlink" href="${esc(ln.projectUrl)}" target="_blank" rel="noopener">Open in Linear${ln.teamName ? ` (${esc(ln.teamName)})` : ""} ↗</a>` : "";
	let body;
	if (!c || c.projectId !== l.project?.id) {
		setTimeout(() => loadLinear().catch((e) => toast(e.message)));
		body = '<p class="hint">Checking Linear…</p>';
	} else if (RO()) body = open ? `<div class="row">${open}</div>` : `<p class="hint">This launch isn't in Linear yet.</p>`;
	else if (c.pending)
		body = c.link
			? `<p class="hint">Your browser blocked the new tab. Open Composio, sign in to Linear and choose the workspace, then come back here.</p><div class="row"><a class="btnlink" id="linearLink" href="${esc(c.link)}" target="_blank" rel="noopener">Open Composio ↗</a><button data-act="linearCheck">Check again</button><button data-act="linearDisconnect">Cancel</button></div>`
			: '<p class="hint">Waiting for Linear. Finish in the Composio tab that opened (sign in to Linear and choose the workspace), then come back here.</p><div class="row"><button data-act="linearCheck">Check again</button><button data-act="linearConnect">Open the link again</button><button data-act="linearDisconnect">Cancel</button></div>';
	else if (!c.connected)
		body = `<p class="hint">Connect this project's Linear workspace. Composio opens in a new tab: sign in to Linear and choose the workspace. Then anyone at GrowthCast on ${esc(l.project?.name || projectName(l.project?.id) || "this project")} can sync its launches.</p><div class="row"><button class="primary" data-act="linearConnect">Connect Linear</button></div>`;
	else {
		const teams = [...(c.teams ?? [])];
		if (ln.teamId && !teams.some((t) => t.id === ln.teamId)) teams.unshift({ id: ln.teamId, name: ln.teamName || "Current team" });
		body = `<p class="hint">Sync creates a Linear project for this launch, with a milestone per phase and one issue per open task, assigned to its owner by email, with the due date. Re-syncing updates those issues instead of duplicating them, and issues closed in Linear tick off here.</p>
		<div class="row"><select data-act-change="linearTeam"${ln.projectId ? " disabled" : ""}>${opt([["", "Choose a Linear team…"], ...teams.map((t) => [t.id, t.name])], ln.teamId)}</select><button class="primary" data-act="linearSync"${ln.teamId ? "" : " disabled"}>${ln.projectId ? "Re-sync to Linear" : "Sync to Linear"}</button>${open}<button data-act="linearDisconnect">Disconnect</button></div>`;
	}
	return `<div class="card"><h3 style="margin-top:0">Linear <small>${c?.connected ? `${esc(c.workspace)}${c.by ? ` · connected by ${esc(c.by)}` : ""}` : c?.pending ? "connecting" : "not connected"}</small></h3>${body}</div>`;
}

function viewStaffing() {
	const l = S.launch;
	const w = workload(l);
	const ln = l.sync.linear;
	const max = Math.max(1, ...w.people.map((p) => p.open));
	const peopleOpts = (sel) => `<option value="">Unstaffed</option>${l.people.map((p) => `<option value="${p.id}"${p.id === sel ? " selected" : ""}>${esc(p.name || p.email)}</option>`).join("")}`;
	return `<h2>Staffing <small>who owns each role, and what that puts on their plate</small></h2>
	<p class="lede">Staff a role and every checklist item for it gets that person as owner, unless an item names someone else. ${WEB() && !S.settings.linear ? "The team plan and the tasks CSV assign tasks from this." : "The team plan and the Linear sync assign tasks from this. Emails must match their Linear account."}</p>
	<div class="card"><h3 style="margin-top:0">Team <small>${l.people.length} people</small></h3>
		<table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>Title</th><th>Capacity</th><th>Roles</th><th>Open</th>${WEB() ? "" : "<th>Linear</th>"}<th></th></tr></thead><tbody>
		${l.people.map((p, i) => { const x = w.people.find((y) => y.id === p.id); return `<tr><td>${inp(`people.${i}.name`, "Name")}</td><td>${inp(`people.${i}.email`, "name@company.com", 'type="email"')}</td><td>${inp(`people.${i}.title`, "Title")}</td><td style="width:90px">${inp(`people.${i}.capacity`, "e.g. 50%")}</td><td class="mono">${esc(x.roles.join(", ")) || "—"}</td><td class="mono">${x.open}${x.overdue ? ` <span class="v-no-go">(${x.overdue} late)</span>` : ""}</td>${WEB() ? "" : `<td class="mono">${p.linearUserId ? "✓ matched" : "—"}</td>`}<td><button class="ghost sm" data-act="rmPerson" data-id="${p.id}" title="Remove">✕</button></td></tr>`; }).join("")}
		<tr><td colspan="8"><button class="sm" data-act="addPerson">+ Add person</button></td></tr></tbody></table>
	</div>
	<div class="grid2">
		<div class="card"><h3 style="margin-top:0">Roles this ${tierOf(l) ? `T${tierOf(l)}` : "launch"} needs <small>${w.roles.filter((r) => r.person).length}/${w.roles.length} staffed</small></h3>
			<table class="tbl"><tbody>${w.roles.map((r) => `<tr><td style="width:110px"><b class="mono">${esc(r.role)}</b><div class="hint" style="white-space:normal">${esc(ROLE_INFO[r.role] ?? "")}</div></td><td><select data-staff="${r.role}" class="${r.person ? "" : "unstaffed"}">${peopleOpts(l.staffing[r.role])}</select></td><td class="mono" style="text-align:right">${r.open} open<br><span class="muted">${r.items} total</span></td></tr>`).join("")}</tbody></table>
		</div>
		<div class="card"><h3 style="margin-top:0">Workload <small>open items · click a person to see their checklist</small></h3>
			${w.people.length ? `<div class="load">${w.people.map((p) => `<div class="lrow" data-who="p:${p.id}"><span><b>${esc(p.name || p.email)}</b><small>${esc(p.roles.join(" · ") || "no role")}${p.capacity ? ` · ${esc(p.capacity)}` : ""}</small></span><div class="lbar"><i style="width:${(100 * p.open) / max}%"></i>${p.overdue ? `<u style="width:${(100 * p.overdue) / max}%"></u>` : ""}</div><span class="mono">${p.open}${p.peakWeek ? `<small>peak ${p.peakWeek.count} wk of ${fmtDate(p.peakWeek.week).replace(/^\w+, /, "")}</small>` : ""}</span></div>`).join("")}</div>` : `<p class="hint">Add people on the left to see their load.</p>`}
			${w.unassigned.length ? `<p class="small" style="margin-top:12px"><a href="#" data-who="unassigned" class="v-no-go">${w.unassigned.length} items have no owner →</a></p>` : ""}
		</div>
	</div>
	${WEB() ? `${linearCard(l)}<div class="card"><h3 style="margin-top:0">Team launch plan</h3><p class="hint">Goals, milestones, roles and each person's tasks with due dates, to present to the team. Everyone on this portal project can open it.</p><div class="row"><button class="primary" data-act="teamPlan">Open team launch plan</button><a class="btnlink" href="api/launches/${l.id}/tasks.csv">Download tasks CSV</a></div></div>` : `<div class="card"><h3 style="margin-top:0">Linear <small>${ln.projectId ? `project linked · ${Object.keys(ln.issues).length} issues${ln.syncedAt ? ` · synced ${esc(ln.syncedAt.slice(0, 16).replace("T", " "))}` : ""}${ln.pulledAt ? ` · states pulled ${esc(ln.pulledAt.slice(0, 16).replace("T", " "))}` : ""}` : "not synced yet"}</small></h3>
		<p class="hint">Sync creates a Linear project for this launch (via Composio), with a milestone per phase and one issue per open task, assigned to its owner, with the due date. Re-syncing updates existing issues instead of duplicating them, and issues closed in Linear tick off here, with the issue as evidence.</p>
		<div class="row">${ln.projectUrl ? `<a class="btnlink" href="${esc(ln.projectUrl)}" target="_blank" rel="noopener">Open in Linear${ln.teamName ? ` (${esc(ln.teamName)})` : ""} ↗</a>` : ""}<button class="primary" data-ask="sync">${ln.projectId ? "Re-sync to Linear" : "Sync to Linear"}</button><button data-act="teamPlan">Open team launch plan</button><a class="btnlink" href="api/launches/${l.id}/tasks.csv">Download tasks CSV</a></div>
	</div>`}`;
}

const VIDEO_STEPS = [["video-brief", "Brief"], ["video-script", "Script"], ["ui-freeze", "UI freeze"], ["video-production", "Production"], ["video-review", "Review"], ["video-final", "Master"], ["video-cutdowns", "Cutdowns"], ["video-handoff", "Hand-off"], ["social-sequence", "Launch"], ["video-performance", "Performance"]];
function viewVideo() {
	const l = S.launch;
	const v = l.video;
	const tier = effectiveTier(l);
	const items = Object.fromEntries(itemsFor(l).map((i) => [i.id, i]));
	if (!items["video-final"]) return `<h2>Launch video</h2><div class="empty"><b>No launch video at T3.</b>Minor launches use the in-app loop or a GIF in the changelog. Override the tier to T2 if this one deserves a video.</div>`;
	const steps = VIDEO_STEPS.filter(([id]) => items[id]);
	const script = l.assets["announcement-video"] ?? { status: "todo", body: "" };
	const staffed = (role) => l.people.find((p) => p.id === l.staffing[role])?.name;
	const dels = VIDEO_DELIVERABLES.filter((d) => d.tiers.includes(tier));
	const hos = VIDEO_HANDOFFS.filter((h) => h.tiers.includes(tier));
	const approved = VIDEO_APPROVERS.every(([r]) => v.approvers[r].status === "approved");
	return `<h2>Launch video <small>brief → script → production → review → master → cutdowns → hand-off → launch → performance</small></h2>
	<p class="lede">The video every channel shares on launch day. Dates count back from T-0. For ${tier === 1 ? "T1" : "T2"}, the approved hero cut is a go/no-go gate.</p>
	<div class="stepper">${steps.map(([id, label]) => { const i = items[id]; return `<button class="step st-${i.status}${i.overdue ? " late" : ""}" data-goto-step="${id}"><b>${label}</b><span>${fmtDate(i.due).replace(/^\w+, /, "")}</span><small>${esc(i.ownerName || i.role)}</small></button>`; }).join("")}</div>
	<div class="card" id="video-steps"><h3 style="margin-top:0">Steps <small>status, owner, evidence. Same items as the checklist.</small></h3><datalist id="owners">${l.people.map((p) => `<option value="${esc(p.name)}">`).join("")}</datalist>${steps.map(([id]) => itemRow(items[id])).join("")}</div>

	<div class="grid2">
		<div class="card"><h3 style="margin-top:0">Concept <small>the brief for whoever makes it</small></h3>
			<div class="grid2">
				${field("Format", `<select data-bind="video.format" data-rerender>${opt(VIDEO_FORMATS, v.format)}</select>`)}
				${field("Length (hero)", inp("video.length", "60–90s"))}
				${field("Hook (first 2 seconds)", inp("video.hook", "What makes someone stop scrolling"), "span2")}
				${field("Talent", inp("video.talent", "Founder, customer, VO artist…"))}
				${field("Music", inp("video.music", "Track + license"))}
				${field("Tools", inp("video.tools", "Screen Studio, Descript, Veo, ElevenLabs…"), "span2")}
				${field("Concept & production plan", ta("video.concept", "Story beats, shot list, capture checklist, schedule", 5), "span2")}
			</div>
		</div>
		<div class="card"><h3 style="margin-top:0">Script <span class="st as-${script.status}">${esc(ASSET_STATUS.find(([k]) => k === script.status)?.[1])}</span></h3>
			${script.body ? `<pre class="scriptprev">${esc(script.body.slice(0, 1200))}${script.body.length > 1200 ? "\n…" : ""}</pre>` : `<p class="hint">No script yet. Claude writes it as a two-column script (what's on screen, what's said) with a shot list, from the brief and message house.</p>`}
			<div class="row"><button class="primary" data-ask="video-script">${script.body ? "Rewrite" : "Write"} script with Claude</button><button data-act="openScript">Open in Assets</button></div>
			<h3>Rights <small>needed before paid use</small></h3>
			<label class="row small"><input type="checkbox" data-bind="video.rights.music" ${v.rights.music ? "checked" : ""}> Music licensed (incl. paid ads)</label>
			<label class="row small"><input type="checkbox" data-bind="video.rights.talent" ${v.rights.talent ? "checked" : ""}> Talent / customer releases signed</label>
			${tier === 1 ? `<label class="row small"><input type="checkbox" data-bind="video.rights.paid" data-rerender ${v.rights.paid ? "checked" : ""}> Cleared for paid media and creator whitelisting</label>` : ""}
		</div>
	</div>

	<div class="card"><h3 style="margin-top:0">Review & sign-off <small>2 rounds max; timestamped notes</small></h3>
		<table class="tbl"><thead><tr><th>Approver</th><th>Who</th><th>Checks</th><th>Status</th><th>Note</th></tr></thead><tbody>
		${VIDEO_APPROVERS.map(([role, what]) => `<tr><td class="mono">${role}</td><td>${esc(staffed(role) ?? "—")}</td><td class="small">${esc(what)}</td><td style="width:150px"><select data-bind="video.approvers.${role}.status" data-rerender class="appr-${v.approvers[role].status}">${opt([["pending", "Pending"], ["changes", "Changes requested"], ["approved", "Approved"]], v.approvers[role].status)}</select></td><td>${inp(`video.approvers.${role}.note`, "")}</td></tr>`).join("")}
		</tbody></table>
		<h3>Rounds</h3>
		${v.rounds.map((r, i) => `<div class="round"><div class="row"><b class="mono">Round ${i + 1}</b><input type="date" data-bind="video.rounds.${i}.at" value="${esc(r.at)}" style="width:150px"><input data-bind="video.rounds.${i}.link" value="${esc(r.link)}" placeholder="Cut link (Frame.io, Loom, Drive, file path)" style="flex:1;min-width:200px"><input data-bind="video.rounds.${i}.reviewer" value="${esc(r.reviewer)}" placeholder="Reviewer" style="width:150px"><select data-bind="video.rounds.${i}.decision" data-rerender style="width:170px">${opt([["", "Open"], ["changes", "Changes requested"], ["approved", "Approved"]], r.decision)}</select><button class="ghost sm" data-act="rm" data-list="video.rounds" data-i="${i}">✕</button></div>${ta(`video.rounds.${i}.notes`, "0:03 hook too slow, start on the result\n0:21 UI shows staging data", 4)}</div>`).join("") || `<p class="hint">No cuts reviewed yet.</p>`}
		<div class="row" style="margin-top:8px"><button class="sm" data-act="addRound">+ Add round</button><button class="sm" data-ask="video-review">Turn notes into revisions</button>${v.rounds.length >= 3 ? '<span class="v-go-waivers small">3+ rounds: lock scope.</span>' : ""}</div>
		<div class="grid2" style="margin-top:14px">${field("Final master", inp("video.master", "Link to the approved master"))}${field("Archive (project files, raw, licenses)", inp("video.archive", "Shared drive folder"))}</div>
		<div class="row" style="margin-top:10px">${items["video-final"].status === "done" ? `<span class="v-go">✓ Master approved</span>` : `<button class="primary" data-act="approveMaster" ${approved && v.master ? "" : "disabled"} title="${approved && v.master ? "" : "Needs every approver and a master link"}">Approve master</button><span class="hint">${approved ? (v.master ? "" : "Add the master link.") : "Waiting on sign-off."}</span>`}</div>
	</div>

	<div class="card"><h3 style="margin-top:0">Deliverables <small>cut from the master</small></h3>
		<table class="tbl"><thead><tr><th>Cut</th><th>Spec</th><th>Used in</th><th>Status</th><th>Captions</th><th>File / link</th></tr></thead><tbody>
		${dels.map((d) => `<tr><td><b>${esc(d.label)}</b></td><td class="small">${esc(d.spec)}</td><td class="small">${esc(d.use)}</td><td style="width:130px"><select data-bind="video.deliverables.${d.id}.status" data-rerender>${opt(DELIVERABLE_STATUS, v.deliverables[d.id].status)}</select></td><td style="text-align:center"><input type="checkbox" data-bind="video.deliverables.${d.id}.captions" ${v.deliverables[d.id].captions ? "checked" : ""}></td><td>${inp(`video.deliverables.${d.id}.link`, "Link")}</td></tr>`).join("")}
		</tbody></table>
	</div>

	<div class="card"><h3 style="margin-top:0">Hand-off packet <small>${hos.filter((h) => v.handoff[h.id].sent).length}/${hos.length} sent</small></h3>
		<table class="tbl"><thead><tr><th></th><th>To</th><th>Owner</th><th>What they get</th><th>Link (folder, message, ticket)</th></tr></thead><tbody>
		${hos.map((h) => `<tr><td><input type="checkbox" data-bind="video.handoff.${h.id}.sent" data-rerender ${v.handoff[h.id].sent ? "checked" : ""}></td><td><b>${esc(h.label)}</b></td><td>${esc(staffed(h.role) ?? h.role)}</td><td class="small">${esc(h.what)}</td><td>${inp(`video.handoff.${h.id}.link`, "Link")}</td></tr>`).join("")}
		</tbody></table>
		${hos.every((h) => v.handoff[h.id].sent) && items["video-handoff"].status !== "done" ? `<div class="row" style="margin-top:10px"><button class="primary" data-act="handoffDone">Mark hand-off done</button></div>` : ""}
	</div>`;
}

function viewMessaging() {
	const l = S.launch;
	const m = l.message;
	const rep = (list, cols, tpl, cls = "") => `<div class="rep">${getPath(l, list).map((_, i) => `<div class="rep-row ${cls}">${cols.map(([k, ph, rows]) => (rows ? ta(`${list}.${i}.${k}`, ph, rows) : inp(`${list}.${i}.${k}`, ph))).join("")}${list === "message.pillars" ? `<label class="row small"><input type="checkbox" data-bind="${list}.${i}.approved" ${m.pillars[i].approved ? "checked" : ""}> OK</label>` : ""}<button class="ghost sm" data-act="rm" data-list="${list}" data-i="${i}" title="Remove">✕</button></div>`).join("")}<div><button class="sm" data-act="add" data-list="${list}" data-tpl='${tpl}'>+ Add</button></div></div>`;
	return `<h2>Message house <small>the single source every asset is written from</small></h2>
	${m.status === "approved" ? `<div class="approved-bar"><b>Approved ${esc(m.approvedAt.slice(0, 10))}.</b><span class="hint grow">Changing it means assets need regenerating.</span><button class="sm" data-act="reopen">Reopen as draft</button></div>` : `<div class="draft-bar"><b>Draft.</b><span class="hint grow">Approve once the one-liner, pillars and proof are right. Assets read from this.</span><button class="primary sm" data-act="approve">Approve message house</button></div>`}
	<div class="card grid2">
		${field("Feature name <em>plain, searchable, translatable</em>", inp("message.featureName"))}
		${field("One-liner <em>≤12 words, outcome first</em>", inp("message.oneLiner"))}
		${field("Elevator (2 sentences)", ta("message.elevator", "What it is. Why it matters.", 2), "span2")}
		${field("Core promise", inp("message.promise"), "span2")}
	</div>
	<h3>Pillars & proof <small>max 3; no proof, no pillar</small></h3>
	<div class="card">${rep("message.pillars", [["claim", "Claim"], ["proof", "Proof: number, quote or demo moment"]], '{"claim":"","proof":"","approved":false}')}</div>
	<div class="card grid2">
		${field("Who it's for", ta("message.forWho", "", 2))}${field("Who it's not for", ta("message.notFor", "", 2))}
		${field("Before", ta("message.before", "Life with the old way", 2))}${field("After", ta("message.after", "Life with this", 2))}
		${field("Words to use", inp("message.useWords"))}${field("Words to avoid", inp("message.avoidWords"))}
		${field("Known limitations (said honestly)", ta("message.limits", "", 2), "span2")}
	</div>
	<h3>Objections</h3>
	<div class="card">${rep("message.objections", [["q", "Objection"], ["a", "Answer", 2]], '{"q":"","a":""}', "two")}</div>
	<h3>CTAs by audience</h3>
	<div class="card grid2">${field("Prospects", inp("message.ctas.prospect"))}${field("Eligible customers", inp("message.ctas.customer"))}${field("Ineligible plan", inp("message.ctas.ineligible"))}${field("Churned users", inp("message.ctas.churned"))}</div>
	<div class="card">${field("Approved quotes / testimonials (with permission)", ta("message.quotes", "", 3))}</div>`;
}

function viewAssets() {
	const l = S.launch;
	const as = assetsFor(l);
	const a = as.find((x) => x.id === S.assetSel) ?? as[0];
	if (!a) return `<div class="empty"><b>No assets for this tier.</b></div>`;
	const label = (v) => ASSET_STATUS.find(([k]) => k === v)?.[1];
	return `<h2>Assets <small>${as.length} for ${tierOf(l) ? `T${tierOf(l)}` : "T1 (unscored)"} · tick assets, then Draft assets to have Claude write them</small></h2>
	${l.message.status !== "approved" ? `<p class="lede" style="color:var(--warn)">The message house isn't approved yet. Drafts written now may need redoing.</p>` : ""}
	<div class="assets">
		<div class="alist">${as.map((x) => `<div class="acard ${x.id === a.id ? "on" : ""}" data-asset-open="${x.id}"><input type="checkbox" data-pick="${x.id}" ${S.picked.has(x.id) ? "checked" : ""} title="Select for Claude"><span>${esc(x.label)}${x.updatedBy === "claude" ? '<span class="badge claude">Claude</span>' : ""}</span><span class="st as-${x.status}">${esc(label(x.status))}</span></div>`).join("")}</div>
		<div class="card editor" style="margin-top:0">
			<h2>${esc(a.label)} <small>${esc(a.role)}${a.item ? ` · completes “${esc(itemsFor(l).find((i) => i.id === a.item)?.text ?? a.item)}”` : ""}</small></h2>
			<div class="spec">${esc(a.spec)}</div>
			<div class="grid3">
				${field("Status", `<select data-asset="${a.id}" data-f="status" data-rerender>${opt(ASSET_STATUS, a.status)}</select>`)}
				${field("Owner", `<input list="owners" data-asset="${a.id}" data-f="owner" value="${esc(a.owner)}" placeholder="${esc(a.role)}">`)}
				${field("Link (doc, Figma, live URL)", `<input data-asset="${a.id}" data-f="link" value="${esc(a.link)}">`)}
			</div>
			<div class="row" style="margin:14px 0 6px"><span class="hint grow">Draft (Markdown)</span><button class="sm" data-act="draftOne" data-id="${a.id}">Ask Claude to draft this</button></div>
			<textarea class="body" data-asset="${a.id}" data-f="body" placeholder="Write here, or ask Claude to draft it from the message house.">${esc(a.body)}</textarea>
		</div>
	</div>`;
}

const num = (s) => {
	const m = String(s ?? "").replace(/,/g, "").match(/-?\d+(\.\d+)?/);
	return m ? Number(m[0]) : null;
};
function viewMeasure() {
	const l = S.launch;
	const me = l.measure;
	const eligible = num(me.stages.eligible.a30) ?? num(me.stages.eligible.baseline) ?? num(me.eligibleCount);
	const pct = (v) => {
		if (v == null || v === "") return null;
		if (String(v).includes("%")) return num(v);
		const n = num(v);
		return n != null && eligible ? (100 * n) / eligible : null;
	};
	const cols = [["baseline", "Baseline"], ["t7", "T+7 target"], ["t30", "T+30 target"], ["a7", "T+7 actual"], ["a30", "T+30 actual"], ["a90", "T+90 actual"]];
	const tableRows = (list, keys, tpl) => `${getPath(l, list).map((_, i) => `<tr>${keys.map(([k, ph, type]) => `<td>${type === "check" ? `<input type="checkbox" data-bind="${list}.${i}.${k}" data-rerender ${getPath(l, `${list}.${i}.${k}`) ? "checked" : ""}>` : inp(`${list}.${i}.${k}`, ph)}</td>`).join("")}<td><button class="ghost sm" data-act="rm" data-list="${list}" data-i="${i}">✕</button></td></tr>`).join("")}<tr><td colspan="${keys.length + 1}"><button class="sm" data-act="add" data-list="${list}" data-tpl='${tpl}'>+ Add</button></td></tr>`;
	return `<h2>Measure <small>set before launch; read at T+7, T+30, T+90</small></h2>
	<div class="card grid2">
		${field("Primary success metric <em>activation, not clicks</em>", inp("measure.primary", "e.g. Activated users / eligible actives by T+30"))}
		${field("Activation definition", inp("measure.activation", "Smallest repeatable action that delivers the value"))}
		${field("Activation window", inp("measure.window"))}
		${field("Eligible users (count)", inp("measure.eligibleCount", "Used for funnel %"))}
		${field("Holdout", inp("measure.holdout", "e.g. 10% lifecycle holdout; geo holdout for paid"))}
		${field("UTM template", inp("measure.utm"))}
	</div>
	<h3>Funnel <small>counts or percentages; bars: latest actual as % of eligible · ┃ T+30 target</small></h3>
	<div class="card">
		<table class="tbl"><thead><tr><th>Stage</th>${cols.map(([, lab]) => `<th>${lab}</th>`).join("")}</tr></thead><tbody>
		${STAGES.map(([k, lab, def]) => `<tr><td title="${esc(def)}"><b>${esc(lab)}</b></td>${cols.map(([c]) => `<td>${inp(`measure.stages.${k}.${c}`, "—")}</td>`).join("")}</tr>`).join("")}
		</tbody></table>
		<div class="funnel">${STAGES.slice(1).map(([k, lab]) => {
			const s = me.stages[k];
			const actual = pct(s.a30 || s.a7);
			const target = pct(s.t30);
			return `<div class="frow"><span>${esc(lab)}</span><div class="ftrack">${actual != null ? `<i style="width:${Math.min(100, actual)}%"></i>` : ""}${target != null ? `<u style="left:${Math.min(100, target)}%"></u>` : ""}</div><span class="mono">${actual != null ? `${actual.toFixed(1)}%` : target != null ? `↗ ${target.toFixed(1)}%` : "—"}</span></div>`;
		}).join("")}</div>
		${!eligible ? `<p class="hint">Add an eligible-user count to see the funnel as percentages.</p>` : ""}
	</div>
	<h3>Events <small>entry_point on the open event is how adoption gets attributed to channels</small></h3>
	<div class="card"><table class="tbl"><thead><tr><th>Event</th><th>Trigger</th><th>Properties</th><th>Staging</th><th>Prod</th><th></th></tr></thead><tbody>${tableRows("measure.events", [["name", "event_name"], ["trigger", "When it fires"], ["props", "Properties"], ["staging", "", "check"], ["prod", "", "check"]], '{"name":"","trigger":"","props":"","staging":false,"prod":false}')}</tbody></table></div>
	<h3>Guardrails</h3>
	<div class="card"><table class="tbl"><thead><tr><th>Metric</th><th>Baseline</th><th>Review threshold</th><th>Actual</th><th></th></tr></thead><tbody>${tableRows("measure.guardrails", [["metric", "Metric"], ["baseline", "—"], ["threshold", "—"], ["actual", "—"]], '{"metric":"","baseline":"","threshold":"","actual":""}')}</tbody></table></div>
	<h3>Channel contribution <small>by entry_point / UTM</small></h3>
	<div class="card"><table class="tbl"><thead><tr><th>Channel</th><th>Exposed</th><th>Discovered</th><th>Activated</th><th>Cost</th><th>Cost / activation</th><th></th></tr></thead><tbody>${l.measure.channels.map((c, i) => `<tr>${["channel", "exposed", "discovered", "activated", "cost"].map((k) => `<td>${inp(`measure.channels.${i}.${k}`, "—")}</td>`).join("")}<td class="mono">${num(c.cost) && num(c.activated) ? `$${(num(c.cost) / num(c.activated)).toFixed(2)}` : "—"}</td><td><button class="ghost sm" data-act="rm" data-list="measure.channels" data-i="${i}">✕</button></td></tr>`).join("")}<tr><td colspan="7"><button class="sm" data-act="add" data-list="measure.channels" data-tpl='{"channel":"","exposed":"","discovered":"","activated":"","cost":""}'>+ Add channel</button></td></tr></tbody></table></div>
	<h3>Readouts</h3>
	<div class="grid3">${["7", "30", "90"].map((k) => {
		const due = addDays(l.t0, Number(k));
		return `<div class="card"><h3 style="margin-top:0">T+${k} <small>${fmtDate(due)}</small></h3>
		${field("Verdict", `<select data-bind="measure.readouts.${k}.verdict" data-rerender>${opt([["", "—"], ["on_track", "On track"], ["behind", "Behind"], ["ahead", "Ahead"]], me.readouts[k].verdict)}</select>`)}
		${field("Recommendation", `<select data-bind="measure.readouts.${k}.recommendation">${opt([["", "—"], ["double_down", "Double down"], ["iterate", "Iterate"], ["hold", "Hold"], ["sunset", "Sunset"]], me.readouts[k].recommendation)}</select>`)}
		${field("Notes", ta(`measure.readouts.${k}.notes`, "Drop-offs, channel winners, support themes, decisions", 5))}</div>`;
	}).join("")}</div>`;
}

function viewReadiness() {
	const l = S.launch;
	const r = readiness(l);
	const fb = l.feedback;
	const open = fb.items.filter((f) => !f.resolved).length;
	return `<div class="row" style="align-items:flex-end;gap:24px"><div><span class="hint">Go / no-go</span><div class="verdict v-${r.verdict}">${VERDICT[r.verdict]}</div></div><p class="lede grow">Hard gates must pass, every Phase 0–3 item must be done or waived by the DRI, and no red-team blocker can be open. Run <b>Red-team review</b> at T-3.</p></div>
	<div class="grid2">
		<div class="card"><h2>Hard gates</h2><ul class="gates">${r.gates.map((g) => `<li class="${g.ok ? "ok" : "bad"}" data-goto="${g.item}">${esc(g.label)}</li>`).join("")}</ul></div>
		<div class="card"><h2>Open before launch <small>${r.blockers.length}</small></h2>${r.blockers.length ? `<table class="tbl"><tbody>${r.blockers.slice(0, 14).map((i) => `<tr class="click" data-goto="${i.id}"><td>${esc(i.text)}</td><td class="mono" style="${i.overdue ? "color:var(--error)" : ""}">${fmtDate(i.due)}</td></tr>`).join("")}</tbody></table>${r.blockers.length > 14 ? `<p class="hint">+${r.blockers.length - 14} more on the Checklist tab (filter: Open).</p>` : ""}` : `<p class="hint">All Phase 0–3 items are closed.</p>`}
		${r.waived.length ? `<h3>Waived</h3><ul class="small">${r.waived.map((i) => `<li>${esc(i.text)}${i.note ? ` <span class="muted">— ${esc(i.note)}</span>` : ' <span class="v-go-waivers">(no reason given)</span>'}</li>`).join("")}</ul>` : ""}</div>
	</div>
	<div class="card"><h2>Red-team findings <small>${fb.at ? `reviewed ${esc(fb.at.slice(0, 10))} · ${open} open` : "not run yet"}</small></h2>
	${fb.summary ? `<div class="fb-sum"><b>Claude:</b> ${esc(fb.summary)}</div>` : ""}
	${fb.items.length ? `<table class="tbl"><thead><tr><th></th><th>Severity</th><th>Finding</th><th>Fix</th><th>Owner</th></tr></thead><tbody>${fb.items.map((f, i) => `<tr class="${f.resolved ? "resolved" : ""}"><td><input type="checkbox" title="Resolved" data-bind="feedback.items.${i}.resolved" data-rerender ${f.resolved ? "checked" : ""}></td><td><span class="st sev-${f.severity}">${esc(f.severity)}</span></td><td>${esc(f.text)}${f.item ? ` <a href="#" data-goto="${esc(f.item)}" class="small">→ item</a>` : ""}</td><td class="small">${esc(f.fix)}</td><td class="mono">${esc(f.owner)}</td></tr>`).join("")}</tbody></table>` : `<p class="hint">Press <b>Red-team review</b> on the left. Claude reads the whole launch and lists what will go wrong, most severe first.</p>`}</div>`;
}

function viewRetro() {
	return `<h2>Retro <small>within two weeks of T-0; lessons feed the next launch</small></h2>
	<div class="card grid2">
		${field("Outcome vs goal (one line, with numbers)", ta("retro.outcome", "", 2), "span2")}
		${field("What worked (keep doing)", ta("retro.worked", "", 6))}
		${field("What didn't (stop or fix)", ta("retro.didnt", "", 6))}
		${field("Process gaps (missing or misplaced checklist items)", ta("retro.gaps", "", 5))}
		${field("Benchmarks to save (exposure %, discovery %, activation %, cost/activation, email CTR)", ta("retro.benchmarks", "", 5))}
	</div>`;
}

function viewPortfolio() {
	const ls = S.launches.filter((l) => !S.project || l.project?.id === S.project);
	const start = addDays(today(), -14);
	const days = 112;
	const x = (d) => (100 * daysBetween(start, d)) / days;
	const lanes = [];
	const placed = ls.filter((l) => x(l.t0) >= 0 && x(l.t0) <= 100).map((l) => {
		const left = x(l.t0);
		let lane = lanes.findIndex((end) => end < left);
		if (lane < 0) lane = lanes.length;
		lanes[lane] = left + 17;
		const clash = ls.some((o) => o.id !== l.id && (o.project?.id ?? "") === (l.project?.id ?? "") && (o.tier ?? 3) <= 2 && (l.tier ?? 3) <= 2 && Math.abs(daysBetween(o.t0, l.t0)) <= 7);
		return { ...l, left, lane, clash };
	});
	const months = Array.from({ length: 8 }, (_, i) => addDays(start, i * 14));
	return `<div class="view"><p class="eyebrow">Launch portfolio</p><h1 class="title">All launches</h1>
	<p class="lede">One calendar for every launch, so T1s and T2s don't land on top of each other. Red outlines mark launches within 7 days of another T1/T2.</p>
	<div class="row" style="margin-top:12px"><button class="primary" data-act="new">New launch</button>${WEB() ? `<select data-portfolio-project style="width:auto">${opt([["", "All projects"], ...(S.settings.projects ?? []).map((p) => [p.id, p.name])], S.project)}</select>` : ""}</div>
	<div class="cal"><div class="cal-head">${months.map((d) => `<span>${fmtDate(d)}</span>`).join("")}</div>
		<div class="cal-body" style="height:${Math.max(1, lanes.length) * 32 + 16}px"><div class="today" style="left:${x(today())}%"></div>
		${placed.map((l) => `<div class="cal-ev t${l.tier ?? 3} ${l.clash ? "clash" : ""}" style="left:${l.left}%;top:${8 + l.lane * 32}px" data-open="${l.id}" title="${esc(l.name)} · ${fmtDate(l.t0)}">${tierPill(l.tier)} ${esc(l.name)}</div>`).join("")}</div></div>
	<div class="card">${ls.length ? `<table class="tbl"><thead><tr><th>T-0</th><th>Launch</th>${WEB() ? "<th>Project</th>" : ""}<th>Tier</th><th>DRI</th><th>Status</th><th>Done</th><th>Overdue</th></tr></thead><tbody>${ls.map((l) => `<tr class="click" data-open="${l.id}"><td class="mono">${fmtDate(l.t0)}</td><td><b>${esc(l.name)}</b></td>${WEB() ? `<td>${esc(l.project?.name || projectName(l.project?.id))}</td>` : ""}<td>${tierPill(l.tier)}</td><td>${esc(l.dri) || '<span class="v-no-go">—</span>'}</td><td class="mono">${esc(LAUNCH_STATUS.find(([k]) => k === l.status)?.[1])}</td><td class="mono">${l.pct}%</td><td class="mono ${l.overdue ? "v-no-go" : ""}">${l.overdue}</td></tr>`).join("")}</tbody></table>` : `<div class="empty"><b>No launches yet</b>${RO() ? "Launches for your projects appear here once GrowthCast starts one." : "Start one with New launch."}</div>`}</div></div>`;
}

// --- Dialogs ---
function dialog(html, onSubmit) {
	const d = $("#dlg");
	d.innerHTML = `<form method="dialog">${html}</form>`;
	d.showModal();
	d.querySelector("form").onsubmit = async (e) => {
		if (e.submitter?.value === "cancel") return;
		e.preventDefault();
		try {
			await onSubmit(new FormData(e.target), e.submitter?.value);
			d.close();
		} catch (err) {
			toast(err.message);
		}
	};
}
function newLaunchDialog() {
	const projects = S.settings.projects ?? [];
	if (WEB() && !projects.length) return toast("You aren't assigned to any portal projects yet.");
	const pick = WEB() ? field("Project <em>everyone on it can see this launch</em>", `<select name="projectId" required>${opt([["", "Choose a project…"], ...projects.map((p) => [p.id, p.name])], S.project || (projects.length === 1 ? projects[0].id : ""))}</select>`) : "";
	dialog(`<h2>New launch</h2>${pick}${field("Name", '<input name="name" required placeholder="e.g. Invoices from your domain">')}${field("T-0 launch date", `<input name="t0" type="date" required value="${addDays(today(), 35)}">`)}<p class="hint">Due dates count back from T-0. You'll score the tier next.</p><div class="actions"><button value="cancel" formnovalidate>Cancel</button><button class="primary" value="ok">Create</button></div>`, async (fd) => {
		const { body } = await post("api/launches", { name: fd.get("name"), t0: fd.get("t0"), ...(WEB() ? { projectId: fd.get("projectId"), projectName: projectName(fd.get("projectId")) } : {}) });
		await loadList();
		S.tab = "brief";
		location.hash = body.launch.id;
	});
}
async function projectContextDialog() {
	const projects = S.settings.projects ?? [];
	const pid = S.launch?.project?.id || S.project || projects[0]?.id || "";
	if (!pid) return toast("You aren't assigned to any portal projects yet.");
	const load = async (id) => (await api(`api/context?projectId=${encodeURIComponent(id)}`)).body;
	const when = (c) => (c.updatedAt ? `Last changed ${c.updatedAt.slice(0, 16).replace("T", " ")}${c.updatedBy ? ` by ${c.updatedBy}` : ""}` : "Not written yet.");
	const c = await load(pid);
	dialog(`<h2>Company context</h2><p class="hint">Claude reads this with every request for the project's launches: ICP, plans and pricing, channels, voice, rules, and anything else it should know.</p>${field("Project", `<select name="projectId" data-context-project>${opt(projects.map((p) => [p.id, p.name]), pid)}</select>`)}${field("Context (Markdown)", `<textarea name="body" rows="16" placeholder="Company, ICP, plans and pricing, channels, voice and rules">${esc(c.body)}</textarea>`)}<p class="hint" data-context-at>${esc(when(c))}</p><div class="actions"><button value="cancel" formnovalidate>Cancel</button><button class="primary" value="ok">Save</button></div>`, async (fd) => {
		await post("api/context", { projectId: fd.get("projectId"), body: fd.get("body") }, "PUT");
		toast("Context saved.");
	});
	$("[data-context-project]").onchange = async (e) => {
		const next = await load(e.target.value);
		$("#dlg textarea[name=body]").value = next.body;
		$("[data-context-at]").textContent = when(next);
	};
}
function settingsDialog() {
	if (WEB()) return projectContextDialog().catch((e) => toast(e.message));
	const s = S.settings;
	dialog(`<h2>Settings</h2>${field("Company", `<input name="company" value="${esc(s.company)}" placeholder="e.g. Durable">`)}${field("Company context file <em>Claude reads it with every request</em>", `<input name="contextFile" value="${esc(s.contextFile)}" placeholder="~/Code/durable/launches/launch-context.md">`)}${field("Export folder <em>Markdown packs land in &lt;folder&gt;/&lt;yyyy-mm&gt;-&lt;slug&gt;/</em>", `<input name="exportDir" value="${esc(s.exportDir)}" placeholder="~/Code/durable/launches">`)}<div class="actions"><button value="cancel" formnovalidate>Cancel</button><button class="primary" value="ok">Save</button></div>`, async (fd) => {
		S.settings = (await post("api/settings", Object.fromEntries(fd), "PUT")).body;
		toast("Settings saved.");
	});
}
function shareDialog() {
	dialog(`<h2>Share “${esc(S.launch.name)}”</h2>
	<p class="hint">The team launch plan is the one to present: milestones, roles, and each person's tasks with due dates. The full report covers the brief, tier, readiness, message house, checklist and measurement.</p>
	<div style="display:grid;gap:8px;margin-top:12px">
		${WEB() ? `<button value="plan">Open the team launch plan (who does what)</button>
		<button value="csv">Download tasks CSV (owner, role, due, status)</button>
		<button value="report">Open the full launch report</button>
		<p class="hint">Everyone on the portal project can open this launch in the portal.</p>
	</div><div class="actions"><button value="cancel" formnovalidate>Close</button></div>` : `<button value="plan">Open the team launch plan (who does what)</button>
		<button value="csv">Download tasks CSV (owner, role, due, status)</button>
		<button value="publishPlan">Publish the team plan as a private link (asks Claude)</button>
		<button value="sync">Sync tasks to Linear (asks Claude, via Composio)</button>
		<hr style="border:0;border-top:1px solid var(--line);margin:4px 0">
		<button value="report">Open the full launch report</button>
		<button value="export">Export Markdown pack + report to the export folder</button>
		<button class="primary" value="publish">Publish a private share link (asks Claude)</button>
	</div><div class="actions"><button value="cancel" formnovalidate>Close</button></div>`}`, async (_, v) => {
		await save();
		if (v === "report") window.open(`api/launches/${S.launch.id}/report.html`, "_blank");
		if (v === "plan") window.open(`api/launches/${S.launch.id}/team-plan.html`, "_blank");
		if (v === "csv") location.href = `api/launches/${S.launch.id}/tasks.csv`;
		if (v === "publishPlan") await ask("plan");
		if (v === "sync") await ask("sync");
		if (v === "export") toast(`Exported to ${(await post(`api/launches/${S.launch.id}/export`, {})).body.dir}`);
		if (v === "publish") await ask("share");
	});
}

// --- Actions ---
async function ask(kind, assetIds) {
	await save();
	const note = $("#askNote").value.trim();
	if (kind === "intake" && !note && !S.launch.brief.description) return toast("Describe the launch or paste a PRD link in the note first.");
	if (RO() || !askKinds().includes(kind)) return toast("That request isn't available here.");
	S.request = (await post("api/request", { kind, launchId: S.launch.id, note, assetIds: assetIds ?? [...S.picked] })).body;
	renderAsk();
	toast(WEB() ? "Claude is on it. Changes appear here when it's done." : "Queued. Send any message in Claude Code to start it.");
}
function goto(itemId, area) {
	if (!itemId) {
		S.tab = { Video: "video", Staffing: "staffing", Brief: "brief", Measure: "measure", Messaging: "messaging", Calendar: "brief", Checklist: "checklist" }[area] ?? S.tab;
		return render();
	}
	if (!itemsFor(S.launch).some((i) => i.id === itemId)) return toast("That item isn't in this tier's checklist.");
	S.tab = "checklist";
	S.f = { phase: "", who: "", show: "all", q: "" };
	render();
	const el = document.getElementById(`it-${itemId}`);
	el?.scrollIntoView({ block: "center" });
	el?.classList.add("flash");
}
const ACT = {
	new: newLaunchDialog,
	linearConnect: async () => {
		// Open the tab now, while this is still the click: browsers block a window opened after the request returns.
		const w = window.open("", "_blank");
		try {
			const { body } = await post("api/linear/connect", { projectId: S.launch.project.id });
			if (w) {
				w.opener = null;
				w.location.href = body.url;
			}
			// If the browser blocked the tab, the card offers the link instead.
			S.linear = { ...S.linear, pending: true, connected: false, link: w ? "" : body.url };
			render();
			waitForLinear();
		} catch (e) {
			w?.close();
			toast(e.message);
		}
	},
	linearCheck: () => loadLinear(true).catch((e) => toast(e.message)),
	linearDisconnect: () =>
		dialog(`<h2>Disconnect Linear?</h2><p class="hint">Launches in ${esc(S.launch.project?.name || projectName(S.launch.project?.id) || "this project")} stop syncing. Issues already in Linear stay there. You can connect again, to the same workspace or another.</p><div class="actions"><button value="cancel" formnovalidate>Cancel</button><button class="danger" value="ok">Disconnect</button></div>`, async () => {
			clearInterval(linearWait);
			S.linear = { ...(await api(`api/linear?projectId=${encodeURIComponent(S.launch.project.id)}`, { method: "DELETE" })).body, teams: null };
			render();
		}),
	linearSync: async () => {
		await save();
		const ln = S.launch.sync.linear;
		const go = async () => {
			S.request = (await post("api/request", { kind: "sync", launchId: S.launch.id })).body;
			renderAsk();
			toast("Syncing to Linear. The results appear here when it's done.");
		};
		if (ln.projectId) return go().catch((e) => toast(e.message));
		const open = itemsFor(S.launch).filter((i) => i.open).length;
		dialog(`<h2>Sync “${esc(S.launch.name)}” to Linear?</h2><p class="hint">This creates the project “Launch: ${esc(S.launch.name)}” in ${esc(ln.teamName || "the team")}, with ${open} issues, one per open task. People staffed on the launch get their tasks if their email matches an active member of the team, and Linear notifies them.</p><div class="actions"><button value="cancel" formnovalidate>Cancel</button><button class="primary" value="ok">Sync</button></div>`, go);
	},
	deleteLaunch: () => {
		const l = S.launch;
		dialog(`<h2>Delete “${esc(l.name)}”?</h2><p class="hint">${WEB() ? "Everyone on the project loses access to this launch, its checklist and its plan." : "The launch file is removed from this folder."} You can't undo this from the studio.</p><div class="actions"><button value="cancel" formnovalidate>Cancel</button><button class="danger" value="ok">Delete launch</button></div>`, async () => {
			clearTimeout(saveTimer);
			await api(`api/launches/${l.id}`, { method: "DELETE" });
			S.launch = null;
			S.dirty = false;
			await loadList();
			toast(`Deleted “${l.name}”.`);
			location.hash = "portfolio";
		});
	},
	score: (el) => {
		const k = el.dataset.f, v = Number(el.dataset.v);
		S.launch.tier.scores[k] = S.launch.tier.scores[k] === v ? null : v;
		markDirty();
		render();
	},
	rollout: (el) => {
		S.launch.rollout.full = JSON.parse(el.dataset.v);
		markDirty();
		render();
	},
	show: (el) => {
		S.f.show = el.dataset.v;
		render();
	},
	note: (el) => {
		const id = el.dataset.id;
		S.notes.has(id) ? S.notes.delete(id) : S.notes.add(id);
		render();
	},
	add: (el) => {
		getPath(S.launch, el.dataset.list).push(JSON.parse(el.dataset.tpl));
		markDirty();
		render();
	},
	rm: (el) => {
		getPath(S.launch, el.dataset.list).splice(Number(el.dataset.i), 1);
		markDirty();
		render();
	},
	approve: () => {
		const m = S.launch.message;
		if (!m.oneLiner.trim() || !m.pillars.length) return toast("Add a one-liner and at least one pillar first.");
		Object.assign(m, { status: "approved", approvedAt: new Date().toISOString() });
		const st = itemState("message-house");
		if (st.status !== "done") Object.assign(st, { status: "done", evidence: st.evidence || "Approved in studio (Messaging tab)" });
		markDirty();
		render();
	},
	reopen: () => {
		S.launch.message.status = "draft";
		markDirty();
		render();
	},
	newItem: () => {
		const el = $("#newText");
		el.scrollIntoView({ behavior: "smooth", block: "center" });
		el.focus();
	},
	editItem: (el) => {
		const i = itemsFor(S.launch).find((x) => x.id === el.dataset.id);
		if (!i) return;
		const offset = i.custom ? S.launch.custom.find((c) => c.id === i.id).due : null;
		const del = i.gate
			? `<p class="hint">This is a go/no-go gate, so it can't be deleted. Waive it with a reason instead.</p>`
			: `<p class="hint">${i.custom ? "Delete removes this item for good." : "Delete removes it from this launch; you can restore it from the bottom of the checklist."}${i.issue ? ` Its Linear issue (${esc(i.issue.identifier || "linked")}) stays in Linear.` : ""}</p>`;
		dialog(`<h2>Edit item</h2>
			${field("Item", `<textarea name="text" rows="3" required>${esc(i.text)}</textarea>`)}
			<div class="grid2">${field("Phase", `<select name="phase">${opt(PHASES.map((x) => [x.id, x.label]), i.phase)}</select>`)}${field("Role", `<select name="role">${opt(ROLES.map((r) => [r, r]), i.role)}</select>`)}</div>
			${i.custom ? field("Planned due <em>days from T-0</em>", `<input name="offset" type="number" value="${offset}">`) : !i.custom && i.edited ? `<p class="hint">Default: “${esc(i.def.text)}” · ${esc(phaseName(i.def.phase))} · ${esc(i.def.role)}. <button class="sm" value="reset" formnovalidate>Reset to default</button></p>` : ""}
			${del}
			<div class="actions"><button class="danger" value="delete" formnovalidate${i.gate ? " disabled" : ""}>Delete</button><span style="flex:1"></span><button value="cancel" formnovalidate>Cancel</button><button class="primary" value="ok">Save</button></div>`, async (fd, v) => {
			const l = S.launch;
			if (v === "reset") {
				for (const k of ["text", "phase", "role"]) delete S.launch.items[i.id][k];
			} else if (v === "delete") {
				if (i.custom) {
					l.custom = l.custom.filter((c) => c.id !== i.id);
					delete l.items[i.id];
				} else (l.items[i.id] ??= { status: "todo", owner: "", due: "", evidence: "", note: "" }).removed = true;
				toast(i.custom ? "Item deleted." : "Item removed. Restore it from the bottom of the checklist.");
			} else {
				const text = String(fd.get("text")).trim().slice(0, 400);
				if (!text) throw new Error("The item needs some text.");
				if (i.custom) Object.assign(l.custom.find((c) => c.id === i.id), { text, phase: fd.get("phase"), role: fd.get("role"), due: Number.parseInt(fd.get("offset"), 10) || 0 });
				else {
					const st = (l.items[i.id] ??= { status: "todo", owner: "", due: "", evidence: "", note: "" });
					for (const [k, val] of [["text", text], ["phase", fd.get("phase")], ["role", fd.get("role")]]) val === i.def[k] ? delete st[k] : (st[k] = val);
				}
			}
			markDirty();
			render();
		});
	},
	restoreItem: (el) => {
		delete S.launch.items[el.dataset.id].removed;
		markDirty();
		render();
		toast("Item restored.");
	},
	addItem: () => {
		const text = $("#newText").value.trim();
		if (!text) return;
		S.launch.custom.push({ id: `c_${Date.now().toString(36)}`, phase: $("#newPhase").value, role: $("#newRole").value, text, due: Number($("#newDue").value) || 0 });
		markDirty();
		render();
	},
	draftOne: (el) => ask("assets", [el.dataset.id]),
	openScript: () => {
		S.assetSel = "announcement-video";
		S.tab = "assets";
		render();
	},
	addRound: () => {
		S.launch.video.rounds.push({ at: today(), link: "", reviewer: "", decision: "", notes: "" });
		markDirty();
		render();
	},
	approveMaster: () => {
		const st = itemState("video-final");
		Object.assign(st, { status: "done", evidence: st.evidence || S.launch.video.master });
		const rv = itemState("video-review");
		if (rv.status !== "done") Object.assign(rv, { status: "done", evidence: rv.evidence || "Signed off on the Video tab" });
		if (S.launch.video.deliverables.hero.status === "todo") S.launch.video.deliverables.hero.status = "ready";
		markDirty();
		render();
	},
	handoffDone: () => {
		const st = itemState("video-handoff");
		Object.assign(st, { status: "done", evidence: st.evidence || "Hand-off packet on the Video tab" });
		markDirty();
		render();
	},
	addPerson: () => {
		S.launch.people.push({ id: `p_${Date.now().toString(36)}`, name: "", email: "", title: "", capacity: "", linearUserId: "" });
		markDirty();
		render();
		const inputs = document.querySelectorAll('[data-bind$=".name"][data-bind^="people."]');
		inputs[inputs.length - 1]?.focus();
	},
	rmPerson: (el) => {
		const id = el.dataset.id;
		S.launch.people = S.launch.people.filter((p) => p.id !== id);
		for (const [r, v] of Object.entries(S.launch.staffing)) if (v === id) delete S.launch.staffing[r];
		markDirty();
		render();
	},
	teamPlan: () => save().then(() => window.open(`api/launches/${S.launch.id}/team-plan.html`, "_blank")),
};

document.addEventListener("click", (e) => {
	const t = e.target;
	const tab = t.closest("[data-tab]");
	if (tab) {
		S.tab = tab.dataset.tab;
		store.set("prc-tab", S.tab);
		$("#stage").scrollTop = 0;
		return render();
	}
	const a = t.closest("[data-act]");
	if (a && ACT[a.dataset.act]) return e.preventDefault(), RO() && !VIEW_ACTS.has(a.dataset.act) ? undefined : ACT[a.dataset.act](a);
	const askBtn = t.closest("[data-ask]");
	if (askBtn) return ask(askBtn.dataset.ask).catch((err) => toast(err.message));
	if (t.closest("[data-ask-clear]")) return api(`api/request?launchId=${encodeURIComponent(S.launch?.id ?? "")}`, { method: "DELETE" }).then(() => ((S.request = null), renderAsk()));
	const stp = t.closest("[data-goto-step]");
	if (stp) {
		const el = document.getElementById(`it-${stp.dataset.gotoStep}`);
		el?.scrollIntoView({ block: "center" });
		el?.classList.add("flash");
		return;
	}
	const wh = t.closest("[data-who]");
	if (wh && S.launch) {
		e.preventDefault();
		S.f = { phase: "", who: wh.dataset.who, show: "all", q: "" };
		S.tab = "checklist";
		$("#stage").scrollTop = 0;
		return render();
	}
	const g = t.closest("[data-goto]");
	if (g && S.launch) return e.preventDefault(), goto(g.dataset.goto, g.dataset.area);
	const o = t.closest("[data-open]");
	if (o) return (location.hash = o.dataset.open);
	if (t.matches("[data-pick]")) {
		t.checked ? S.picked.add(t.dataset.pick) : S.picked.delete(t.dataset.pick);
		return renderAsk();
	}
	const ao = t.closest("[data-asset-open]");
	if (ao) {
		S.assetSel = ao.dataset.assetOpen;
		return render();
	}
});
function onField(e, commit) {
	const el = e.target;
	if (RO() && !el.dataset.filter) return;
	const val = el.type === "checkbox" ? el.checked : el.value;
	if (el.dataset.bind) {
		setPath(S.launch, el.dataset.bind, val);
		if (el.dataset.bind === "t0" && !validDate(val)) return;
	} else if (el.dataset.item) {
		const st = itemState(el.dataset.item);
		const f = el.dataset.f;
		if (f === "due") {
			const it = itemsFor(S.launch).find((i) => i.id === el.dataset.item);
			st.due = !val || val === it?.planned ? "" : val;
		} else st[f] = val;
	} else if (el.dataset.asset) {
		const st = assetState(el.dataset.asset);
		st[el.dataset.f] = val;
		if (el.dataset.f === "body") st.updatedBy = "";
	} else if (el.dataset.staff) {
		const role = el.dataset.staff;
		if (val) S.launch.staffing[role] = val;
		else delete S.launch.staffing[role];
		if (role === "DRI") S.launch.dri = S.launch.people.find((p) => p.id === val)?.name ?? "";
		markDirty();
		return render();
	} else if (el.dataset.filter) {
		S.f[el.dataset.filter] = val;
		if (commit || el.tagName === "SELECT") render();
		return;
	} else if (el.dataset.actChange === "linearTeam") {
		const t = S.linear?.teams?.find((x) => x.id === val);
		Object.assign(S.launch.sync.linear, { teamId: val, teamName: t?.name ?? "" });
		markDirty();
		return render();
	} else if (el.dataset.actChange === "override") {
		S.launch.tier.override = val ? Number(val) : null;
		markDirty();
		return render();
	} else return;
	markDirty();
	if (commit && (el.hasAttribute("data-rerender") || /^people\.\d+\.(name|email)$/.test(el.dataset.bind ?? ""))) render();
	else refreshSide();
}
document.addEventListener("input", (e) => onField(e, false));
document.addEventListener("change", (e) => {
	if (e.target.id === "launchSel") return (location.hash = e.target.value || "portfolio");
	if (e.target.matches("[data-portfolio-project]")) return (S.project = e.target.value), render();
	if (e.target.matches("[data-context-project]")) return;
	if (e.target.matches("[data-ask-select]")) return e.target.value && ask(e.target.value).catch((err) => toast(err.message));
	if (e.target.dataset.filter === "q") return;
	onField(e, true);
});
document.addEventListener("keydown", (e) => {
	if (e.target.matches("input, textarea, select")) {
		if (e.target.dataset.filter === "q" && e.key === "Enter") render();
		return;
	}
	if (e.key === "[") $("#toggleLeft").click();
});
$("#newLaunch").onclick = newLaunchDialog;
$("#settingsBtn").onclick = settingsDialog;
$("#shareBtn").onclick = shareDialog;
$("#toggleLeft").onclick = (e) => {
	const hidden = document.body.classList.toggle("hide-left");
	e.currentTarget.setAttribute("aria-pressed", String(!hidden));
};

let toastTimer;
function toast(msg) {
	const t = $("#toast");
	t.textContent = msg;
	t.classList.add("on");
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => t.classList.remove("on"), 3500);
}

async function route() {
	await save();
	const id = location.hash.slice(1);
	try {
		if (id && id !== "portfolio") await open(id);
		else S.portfolio = true;
	} catch (e) {
		toast(e.message);
		S.portfolio = true;
	}
	if (!S.launch && !id && S.launches.length === 1) return (location.hash = S.launches[0].id);
	$("#saveState").textContent = "";
	render();
}
window.addEventListener("hashchange", route);
window.addEventListener("beforeunload", () => S.dirty && save());
(async () => {
	const qs = new URLSearchParams(location.search);
	const qt = qs.get("tab");
	if (TABS.some(([k]) => k === qt)) S.tab = qt;
	S.settings = (await api("api/settings")).body;
	// In the portal, the proxy answers api/projects with the person's projects (admins: every project).
	if (WEB()) S.settings.projects = (await api("api/projects")).body.projects ?? [];
	// The portal links a project's launches with ?project=<id>.
	if (WEB() && projectName(qs.get("project") ?? "")) S.project = qs.get("project");
	await loadList();
	await route();
	setInterval(poll, 1500);
	// Browsers slow timers in background tabs, so check again as soon as the tab is back (say, after closing issues in Linear).
	document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && poll());
	window.addEventListener("focus", () => poll());
})();
