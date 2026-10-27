// CPA map studio. One account at a time: every ad with ≥ min spend on a log-spend × CPA scatter, the four lines,
// filters (live, format, stage, campaign, ad set, metric), the playbook's steps as presets, an inspector for tags and
// manual calls, the generated action plan and readout, and exports. Settings save to the server and the chart
// recomputes locally. The same app runs in the GrowthCast client portal ("web mode"), so every API path is relative.
import { renderChart, CHART_CSS, LEGEND_HTML } from "./chart.mjs";
import { ACTION_LABEL, ACTION_ORDER, CONVERSIONS, CONVERSION_LABEL, FORMAT_LABEL, PLATFORMS, STAGES, STAGE_LABEL, analyse, esc, fmtInt, fmtMoney } from "./model.mjs";
import { planSections, readoutSections } from "./report.mjs";

const $ = (s, el = document) => el.querySelector(s);
const FILTERS = () => ({ live: "live", format: "all", stage: "all", campaign: "all", adset: "all", y: "cpa", hide: false, q: "" });
const S = { app: { mode: "local", canEdit: true, asks: [], pdf: false, platforms: { meta: true, google: true } }, projects: [], project: "", connections: [], pickable: { platform: "", list: null, busy: false }, accounts: [], id: null, data: null, settings: null, version: null, result: null, view: "map", filters: FILTERS(), step: 6, selected: null, sort: { key: "action", dir: 1 }, request: null, drawer: false };
const STEPS = {
	0: { title: "Every ad on one map.", sub: "Log lifetime spend across, CPA up. Left half is testing; top right is high spend / high cost; bottom right is where the money is.", filters: { live: "all" } },
	5: { title: "Not live: turn old winners back on.", sub: "Paused ads under the scale line with 3+ purchases that aren't one-offs (promos, launches). Turn them back on.", filters: { live: "off" } },
	6: { title: "Live: kill above the kill line, scale below the scale line.", sub: "Above the kill line and past the test budget: kill. Half an AOV spent with nothing to show: kill. Under the scale line: raise budget 20% at a time.", filters: { live: "live" } },
	7: { title: "Format: compare like with like.", sub: "One format at a time. The gap inside a format is usually wider than you expect. Kill the worst of each and scale the best; brief new content from what separates them.", filters: { live: "live", format: "first" } },
	8: { title: "Stage: grade each stage on its own metric.", sub: "TOF on cost per add-to-cart (or sign-up): a top-of-funnel ad with a bad CPA and cheap carts is doing its job. BOF on CPA.", filters: { live: "live", stage: "tof", y: "cps" }, settings: { gradeTofBySecondary: true } },
};

const api = async (path, opts) => {
	const r = await fetch(path, { cache: "no-store", ...opts });
	if (!r.ok) {
		let msg = await r.text();
		try {
			msg = JSON.parse(msg).error ?? msg;
		} catch {}
		throw new Error(msg || r.statusText);
	}
	return r.headers.get("content-type")?.includes("json") ? r.json() : r.text();
};
let toastTimer;
const toast = (msg) => {
	const t = $("#toast");
	t.textContent = msg;
	t.hidden = false;
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => (t.hidden = true), 2800);
};
const cur = () => S.data?.account?.currency ?? "USD";
const money = (v, d) => fmtMoney(v, cur(), d);
const level = () => (PLATFORMS[S.result?.platform ?? "meta"] ?? PLATFORMS.meta).level;

async function boot() {
	$("#chartCss").textContent = CHART_CSS;
	try {
		S.app = await api("api/settings");
	} catch {}
	if (WEB()) {
		try {
			S.projects = (await api("api/projects")).projects ?? [];
		} catch {}
		const q = new URLSearchParams(location.search);
		S.project = S.projects.find((p) => p.id === q.get("project"))?.id ?? S.projects.find((p) => p.id === localStorage.getItem("cpamap:project"))?.id ?? S.projects[0]?.id ?? "";
		const sel = $("#project");
		sel.hidden = false;
		sel.innerHTML = S.projects.map((p) => `<option value="${esc(p.id)}" ${p.id === S.project ? "selected" : ""}>${esc(p.name)}</option>`).join("") || `<option>No projects</option>`;
		$("#refreshBtn").title = "Pull this account again from the ad platform";
	}
	await loadAccounts();
	setInterval(poll, 2500);
}
const WEB = () => S.app.mode === "web";
const currentProject = () => S.projects.find((p) => p.id === S.project) ?? null;
async function loadConnections() {
	if (!WEB() || !S.project) return;
	try {
		S.connections = await api(`api/connections?projectId=${encodeURIComponent(S.project)}`);
	} catch (e) {
		S.connections = [];
	}
}
async function loadAccounts() {
	S.accounts = await api(WEB() ? `api/accounts?projectId=${encodeURIComponent(S.project)}` : "api/accounts");
	await loadConnections();
	const hash = decodeURIComponent(location.hash.slice(1));
	S.id = S.accounts.find((a) => a.id === hash)?.id ?? S.accounts[0]?.id ?? null;
	const q = new URLSearchParams(location.search);
	if (q.has("step") && STEPS[q.get("step")]) applyStep(Number(q.get("step")), false);
	for (const k of ["live", "format", "stage", "y", "campaign", "adset"]) if (q.has(k)) {
		S.filters[k] = q.get(k);
		S.step = null;
	}
	if (q.get("view")) S.view = q.get("view");
	$("#account").innerHTML = S.accounts.map((a) => `<option value="${esc(a.id)}" ${a.id === S.id ? "selected" : ""}>${esc(a.name)} · ${(PLATFORMS[a.platform] ?? PLATFORMS.meta).short} · ${a.building ? "pulling…" : `${a.ads} ads`}</option>`).join("") || `<option>No accounts yet</option>`;
	if (S.id) await loadAccount();
	else render();
}
async function loadAccount() {
	const { data, settings, version, building, request } = await api(`api/accounts/${S.id}`);
	Object.assign(S, { data, settings, version, building: !!building });
	if (request) S.request = request;
	if (location.hash !== `#${S.id}`) history.replaceState(null, "", `#${S.id}`);
	compute();
	render();
}
function compute() {
	S.result = S.data?.ads ? analyse(S.data, S.settings) : null;
	const p = $("#platform");
	if (S.result) {
		p.textContent = PLATFORMS[S.result.platform].label;
		p.hidden = false;
	}
}
let saveTimer;
function saveSettings(patch, { immediate = false } = {}) {
	if (!S.app.canEdit) return toast("You can view this map, but only the GrowthCast team can change it.");
	S.settings = { ...S.settings, ...patch };
	compute();
	render();
	clearTimeout(saveTimer);
	$("#saveState").textContent = "saving…";
	const go = async () => {
		try {
			const { settings, version } = await api(`api/accounts/${S.id}/settings`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(S.settings) });
			S.settings = settings;
			S.version = version;
			$("#saveState").textContent = "saved";
		} catch (e) {
			$("#saveState").textContent = "";
			toast(`Couldn't save settings: ${e.message}`);
		}
	};
	immediate ? go() : (saveTimer = setTimeout(go, 400));
}
const setOverride = (id, patch) => saveSettings({ overrides: { ...S.settings.overrides, [id]: { ...(S.settings.overrides[id] ?? {}), ...patch } } });
const setDecision = (id, d) => {
	const decisions = { ...S.settings.decisions };
	if (!d || decisions[id] === d) delete decisions[id];
	else decisions[id] = d;
	saveSettings({ decisions });
};
async function poll() {
	if (!S.id || S.drawer) return;
	try {
		const { version } = await api(`api/accounts/${S.id}/version`);
		if (version && version !== S.version) {
			await loadAccount();
			if (WEB()) await loadAccounts();
			toast(S.building ? "Pulling the account…" : "Reloaded: the data or settings changed");
		}
	} catch {}
	try {
		S.request = await api(`api/request${S.app.mode === "web" ? `?accountId=${S.id}` : ""}`);
		renderAsk();
	} catch {}
}

// --- Filters ---
const matches = (a) => {
	const f = S.filters;
	if (f.live === "live" && !a.live) return false;
	if (f.live === "off" && a.live) return false;
	if (f.format !== "all" && a.format !== f.format) return false;
	if (f.stage !== "all" && a.stage !== f.stage) return false;
	if (f.campaign !== "all" && a.campaignId !== f.campaign) return false;
	if (f.adset !== "all" && a.adsetId !== f.adset) return false;
	if (f.q && !`${a.name} ${a.campaignName} ${a.adsetName}`.toLowerCase().includes(f.q)) return false;
	return true;
};
const yOf = (a) => (S.filters.y === "cps" ? a.cps : a.cpa);
const linesNow = () => (S.filters.y === "cps" ? S.result.linesSecondary : S.result.lines);
const yName = () => (S.filters.y === "cps" ? `cost per ${CONVERSION_LABEL[S.result.secondary]}` : "CPA");
function applyStep(n, rerender = true) {
	const st = STEPS[n];
	S.step = n;
	S.filters = { ...FILTERS(), ...st.filters, hide: S.filters.hide };
	if (S.filters.format === "first") S.filters.format = S.result?.formats.find((f) => f !== "unknown" && S.result.ads.some((a) => a.format === f)) ?? "all";
	if (S.filters.y === "cps" && !S.result?.secondary) S.filters.y = "cpa";
	S.view = "map";
	if (st.settings) return saveSettings(st.settings);
	if (n !== 8 && S.settings?.gradeTofBySecondary) return saveSettings({ gradeTofBySecondary: false });
	if (rerender) render();
}

// --- Render ---
function render() {
	for (const b of document.querySelectorAll(".views button")) b.classList.toggle("on", b.dataset.view === S.view);
	renderRail();
	renderStage();
	renderInspector();
	renderExportMenu();
}
function webPanel() {
	if (!WEB()) return "";
	const proj = currentProject();
	if (!proj) return `<h4>Project</h4><p class="muted small">No project to show. Ask a GrowthCast admin to add you to one.</p>`;
	const conn = (platform) => S.connections.find((c) => c.platform === platform) ?? { platform, status: "none", available: S.app.platforms?.[platform] };
	const row = (platform, label) => {
		const c = conn(platform);
		if (!c.available) return `<div class="field"><label>${label}</label><span class="muted small">Not set up on this portal yet.</span></div>`;
		return `<div class="field"><label>${label}</label>${c.status === "active" ? `<span class="small">Connected${c.by ? ` by ${esc(c.by)}` : ""}.</span> ${S.app.canEdit ? `<button class="quiet" data-act="disconnect" data-platform="${platform}" style="margin-left:6px;padding:2px 8px">Disconnect</button>` : ""}` : c.status === "pending" ? `<span class="small muted">Waiting for the connection to finish… <a href="#" data-act="connect" data-platform="${platform}">start again</a></span>` : S.app.canEdit ? `<button data-act="connect" data-platform="${platform}">Connect ${label}</button>` : `<span class="muted small">Not connected.</span>`}</div>`;
	};
	const active = ["meta", "google"].filter((p) => conn(p).status === "active");
	const pk = S.pickable;
	return `<h4>${esc(proj.name)}</h4>
	${row("meta", "Meta Ads")}${row("google", "Google Ads")}
	${S.app.canEdit && active.length ? `<h4>Add an ad account</h4>
	<div class="field"><label>Platform</label><select id="addPlatform"><option value="">Choose…</option>${active.map((p) => `<option value="${p}" ${pk.platform === p ? "selected" : ""}>${PLATFORMS[p].label}</option>`).join("")}</select></div>
	${pk.platform ? (pk.list === null ? `<p class="muted small">${pk.busy ? "Listing the ad accounts you can reach…" : ""}</p>` : pk.list.length ? `<div class="field"><label>Account</label><select id="addAccount">${pk.list.map((a) => `<option value="${esc(a.externalId)}" data-name="${esc(a.name)}" data-currency="${esc(a.currency ?? "")}">${esc(a.name)} · ${esc(a.externalId)}${a.currency ? ` · ${esc(a.currency)}` : ""}</option>`).join("")}</select></div><button class="primary" data-act="add-account" style="width:100%">Pull it into the map</button><p class="muted small">A first pull takes a few minutes on a big account.</p>` : `<p class="muted small">The connection can't see any ad accounts. Reconnect with a user who has access.</p>`) : ""}` : ""}`;
}
function renderRail() {
	const rail = $("#rail");
	if (!S.result) return (rail.innerHTML = `${webPanel()}${WEB() ? "" : `<h4>Accounts</h4><p class="muted small">Nothing built yet. In Claude Code: <code>/cpa-map:open &lt;account name&gt;</code> pulls an account through BlueAlpha and builds the map.</p>`}`);
	const r = S.result, f = S.filters;
	const count = (pred) => r.ads.filter(pred).length;
	const seg = (name, opts) => `<div class="seg" role="group" aria-label="${name}">${opts.map(([v, label, n]) => `<button data-filter="${name}" data-v="${esc(v)}" aria-pressed="${f[name] === v}">${esc(label)}${n != null ? `<span class="n">${n}</span>` : ""}</button>`).join("")}</div>`;
	const [, adsetWord] = level();
	const campaigns = r.campaigns, adsets = r.adsets.filter((g) => f.campaign === "all" || g.campaignId === f.campaign);
	rail.innerHTML = `${webPanel()}
	<h4>The playbook</h4>
	<div class="steps">${[0, 5, 6, 7, 8].map((n) => `<button data-step="${n}" aria-pressed="${S.step === n}"><b>${n ? `Step ${n}` : "Map"}</b>${esc(STEPS[n].title)}</button>`).join("")}</div>
	<h4>Filters</h4>
	${seg("live", [["live", "Live", count((a) => a.live)], ["off", "Not live", count((a) => !a.live)], ["all", "All", r.ads.length]])}
	${seg("format", [["all", "All formats"], ...r.formats.filter((x) => count((a) => a.format === x)).map((x) => [x, FORMAT_LABEL[x], count((a) => a.format === x)])])}
	${seg("stage", [["all", "All stages"], ...STAGES.filter((x) => count((a) => a.stage === x)).map((x) => [x, STAGE_LABEL[x], count((a) => a.stage === x)])])}
	<div class="field"><label>Campaign</label><select data-filter="campaign"><option value="all">All campaigns (${campaigns.length})</option>${campaigns.map((c) => `<option value="${esc(c.id)}" ${f.campaign === c.id ? "selected" : ""}>${esc(c.name)} · ${c.ads}${c.live ? ` · ${c.live} live` : ""}</option>`).join("")}</select></div>
	<div class="field"><label>${esc(adsetWord)}</label><select data-filter="adset"><option value="all">All ${esc(adsetWord.toLowerCase())}s (${adsets.length})</option>${adsets.map((g) => `<option value="${esc(g.id)}" ${f.adset === g.id ? "selected" : ""}>${esc(g.name)} · ${g.ads}</option>`).join("")}</select></div>
	${r.secondary ? seg("y", [["cpa", "Y: CPA"], ["cps", `Y: cost / ${CONVERSION_LABEL[r.secondary]}`]]) : ""}
	<div class="field"><input type="search" id="q" placeholder="Find an ad, campaign or ${esc(adsetWord.toLowerCase())}…" value="${esc(f.q)}"></div>
	<label class="check"><input type="checkbox" data-filter="hide" ${f.hide ? "checked" : ""}> Hide ads outside the filters (not just fade them)</label>
	<button class="quiet" data-act="reset" style="width:100%">Clear filters</button>
	${S.app.asks?.length ? `<h4>Ask Claude</h4><textarea id="note" rows="3" placeholder="Anything Claude should know, e.g. “we're launching a new offer next week” or “ignore the UK campaigns”."></textarea>
	<div class="ask-btns">${[["actions", "Write the action list", "primary"], ["audit", "Account readout", ""], ["brief", "Brief new creative", ""], ["retag", "Check the tags", ""], ["explain", "Explain this ad", ""]].filter(([k]) => S.app.asks.includes(k) && (k !== "explain" || S.selected)).map(([k, l, c]) => `<button data-ask="${k}" class="${c}">${l}</button>`).join("")}</div>
	<div id="askState" class="ask-state" hidden></div>` : ""}`;
	renderAsk();
}
function renderAsk() {
	const el = $("#askState");
	if (!el) return;
	const r = S.request;
	if (!r?.context && !r?.kind || (r.at && Date.now() - r.at > 12 * 3600e3)) return (el.hidden = true);
	el.hidden = false;
	el.className = `ask-state ${r.deliveredAt || r.status === "done" ? "got" : "queued"}`;
	el.innerHTML = r.status === "done" ? `<b>${esc(r.title)}</b> is done.${r.summary ? `<p class="pre">${esc(r.summary)}</p>` : ""}<button data-act="clear">Dismiss</button>` : r.deliveredAt || r.status === "running" ? `Claude picked up “${esc(r.title)}”. Watch this map: it reloads when settings change.<button data-act="clear">Dismiss</button>` : `Queued “${esc(r.title)}”. ${S.app.mode === "web" ? "It runs on the server." : "Send any message to Claude in Claude Code and it arrives with it."}<button data-act="clear">Clear</button>`;
}
function renderStage() {
	const stage = $("#stage");
	if (!S.result) {
		if (S.id && S.building) return (stage.innerHTML = `<div class="empty"><p><b>Pulling ${esc(S.accounts.find((a) => a.id === S.id)?.name ?? "this account")}…</b></p><p>Every ad with spend, the last 30 days and the last 7, straight from the ad platform. This page updates itself when the map is ready.${S.request?.status === "failed" ? `<br><span style="color:var(--error)">The pull failed: ${esc(S.request.error || "unknown error")}. Press Refresh to try again.</span>` : ""}</p></div>`);
		return (stage.innerHTML = WEB()
			? `<div class="empty"><p>${S.accounts.length ? "Pick an account above." : "No ad account on this project yet."}</p><p>${S.app.canEdit ? "Connect Meta Ads or Google Ads on the left, then add an ad account: the map pulls every ad and builds itself." : "Ask the GrowthCast team to connect an ad account to this project."}</p></div>`
			: `<div class="empty"><p>No account has been built yet.</p><p>Ask Claude: <code>/cpa-map:open Durable</code> (or any Meta or Google Ads account name) and it pulls the ads through BlueAlpha and builds the map.</p></div>`);
	}
	const r = S.result, f = S.filters;
	if (S.view === "actions") return (stage.innerHTML = `<div class="doc"><div class="headline"><h1>${esc(S.data.account.name)}: action plan</h1></div><p class="sub">Generated from the rules and the current settings. Ask Claude to write the memo with judgement, or export it below.</p>${planSections(r, S.data)}</div>`);
	if (S.view === "readout") return (stage.innerHTML = `<div class="doc"><div class="headline"><h1>${esc(S.data.account.name)}: account readout</h1></div><p class="sub">The audit the exports carry: the lines, where the spend sits, like-with-like comparisons, paused winners, caveats.</p>${readoutSections(r, S.data)}</div>`);
	const step = STEPS[S.step] ?? null;
	const shown = r.ads.filter(matches);
	const L = linesNow();
	const off = shown.filter((a) => yOf(a) == null || yOf(a) > L.cap);
	const title = step ? step.title : "Filtered view";
	const sub = step ? step.sub : `${[f.live !== "all" ? (f.live === "live" ? "live" : "not live") : "", f.format !== "all" ? FORMAT_LABEL[f.format] : "", f.stage !== "all" ? STAGE_LABEL[f.stage] : "", f.campaign !== "all" ? r.campaigns.find((c) => c.id === f.campaign)?.name : "", f.adset !== "all" ? r.adsets.find((g) => g.id === f.adset)?.name : "", f.q ? `“${f.q}”` : ""].filter(Boolean).join(" · ") || "every ad on the map"}.`;
	stage.innerHTML = `
	<div class="headline">${S.step ? `<span class="step">Step ${S.step}</span>` : ""}<h1>${esc(title)}</h1></div>
	<p class="sub">${esc(sub)}</p>
	<p class="stats"><b>${shown.length} ads</b> · <b>${shown.filter((a) => a.action === "kill").length} kill</b> · <b>${shown.filter((a) => a.action === "scale").length} scale</b> · <b>${shown.filter((a) => a.action === "revive").length} revive</b> · ${esc(yName())} ↑ · filled = live, hollow = not live · ${off.length} off the chart${r.hidden ? ` · ${r.hidden} ads under ${money(S.settings.minSpend)} hidden` : ""} · ${esc(S.data.account.name)} · ${esc(S.data.window.since ?? "lifetime")} → ${esc(S.data.window.until)} · live = spent in the last ${S.data.live.days} days</p>
	<div class="chart-wrap">${renderChart(r, cur(), { y: f.y, shown: matches, hideOthers: f.hide, selected: S.selected })}${LEGEND_HTML}</div>
	<div class="table-wrap">${table(shown)}</div>`;
}
function table(shown) {
	const { key, dir } = S.sort, r = S.result;
	const val = (a) => ({ action: ACTION_ORDER[a.action], name: a.name.toLowerCase(), format: a.format, stage: a.stage, spend: a.spend, conv: a.conv, cpa: a.cpa ?? Infinity, sec: a.sec, cps: a.cps ?? Infinity, spendLive: a.spendLive }[key]);
	const rows = [...shown].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : b.spend - a.spend) * dir);
	const th = (k, label, num) => `<th class="${num ? "num" : ""}" data-sort="${k}">${label}${key === k ? (dir > 0 ? " ↑" : " ↓") : ""}</th>`;
	return `<table class="ads"><thead><tr>${th("action", "Call")}${th("name", "Ad")}${th("format", "Format")}${th("stage", "Stage")}${th("spend", "Spend", 1)}${th("conv", CONVERSION_LABEL[r.primary] + "s", 1)}${th("cpa", "CPA", 1)}${r.secondary ? th("sec", CONVERSION_LABEL[r.secondary] + "s", 1) + th("cps", "Cost / " + CONVERSION_LABEL[r.secondary], 1) : ""}${th("spendLive", `Spend ${S.data.live.days}d`, 1)}</tr></thead>
	<tbody>${rows.slice(0, 600).map((a) => `<tr class="row ${a.id === S.selected ? "sel" : ""}" data-id="${esc(a.id)}"><td><span class="pill ${a.action}">${ACTION_LABEL[a.action]}</span>${a.manual ? " ✎" : ""}</td><td><span class="name" title="${esc(a.name)}">${esc(a.name)}</span><span class="camp" title="${esc(a.campaignName)}">${esc(a.campaignName)}${a.adsetName ? " · " + esc(a.adsetName) : ""}</span></td><td>${FORMAT_LABEL[a.format] ?? a.format}</td><td><span class="fun fun-${a.stage}">${STAGE_LABEL[a.stage]}</span></td><td class="num">${money(a.spend)}</td><td class="num">${fmtInt(a.conv)}</td><td class="num">${a.cpa == null ? "—" : money(a.cpa)}</td>${r.secondary ? `<td class="num">${fmtInt(a.sec)}</td><td class="num">${a.cps == null ? "—" : money(a.cps)}</td>` : ""}<td class="num">${a.spendLive ? money(a.spendLive) : "—"}</td></tr>`).join("") || `<tr><td colspan="10" class="empty">No ads match these filters.</td></tr>`}</tbody></table>${rows.length > 600 ? `<p class="muted small">Showing 600 of ${rows.length}. Narrow the filters or use the CSV.</p>` : ""}`;
}
function renderInspector() {
	const el = $("#inspector");
	if (!S.result) return (el.innerHTML = "");
	const r = S.result, a = r.ads.find((x) => x.id === S.selected);
	const [, adsetWord] = level();
	if (!a) return (el.innerHTML = `<h4>Lines</h4><dl class="kv"><dt>Account CPA</dt><dd>${money(r.lines.account)}</dd><dt>Target</dt><dd>${money(r.lines.target)}</dd><dt>Kill line</dt><dd>${money(r.lines.kill)}</dd><dt>Scale line</dt><dd>${money(r.lines.scale)}</dd><dt>AOV</dt><dd>${money(r.aov)}</dd><dt>Test budget</dt><dd>${money(r.testBudget)}</dd><dt>Basis</dt><dd>${r.basis === "live" ? `last ${S.data.live.days} days` : "lifetime"}</dd><dt>CPA on</dt><dd>${CONVERSION_LABEL[r.primary]}s</dd>${r.secondary ? `<dt>Secondary</dt><dd>${CONVERSION_LABEL[r.secondary]}s</dd>` : ""}</dl>
		<h4>Counts</h4><dl class="kv">${Object.entries(r.counts).map(([k, v]) => `<dt>${ACTION_LABEL[k]}</dt><dd>${v}</dd>`).join("")}</dl>
		<p class="muted small">Click a dot or a row to see its numbers, fix its format or stage, or call it by hand. Filled dots are live; hollow ones haven't spent in ${S.data.live.days} days.</p>`);
	const sel = (name, opts, curv) => `<select data-tag="${name}" ${S.app.canEdit ? "" : "disabled"}>${opts.map(([v, l]) => `<option value="${v}" ${v === curv ? "selected" : ""}>${l}</option>`).join("")}</select>`;
	el.innerHTML = `<h2>${esc(a.name)}</h2><div class="path">${esc(a.campaignName)} · ${esc(a.adsetName)}${a.campaignStatus ? ` · campaign ${esc(a.campaignStatus.toLowerCase())}` : ""}${a.status ? ` · ad ${esc(String(a.status).toLowerCase())}` : ""}</div>
	<span class="pill ${a.action}">${ACTION_LABEL[a.action]}${a.manual ? " · by hand" : ""}</span><p class="reason">${esc(a.reason)}</p>
	<dl class="kv"><dt>Lifetime spend</dt><dd>${money(a.spend)}</dd><dt>${CONVERSION_LABEL[r.primary]}s</dt><dd>${fmtInt(a.conv)}</dd><dt>CPA</dt><dd>${a.cpa == null ? "—" : money(a.cpa)}</dd>${r.secondary ? `<dt>${CONVERSION_LABEL[r.secondary]}s</dt><dd>${fmtInt(a.sec)}</dd><dt>Cost / ${CONVERSION_LABEL[r.secondary]}</dt><dd>${a.cps == null ? "—" : money(a.cps)}</dd>` : ""}<dt>Conversion value</dt><dd>${money(a.values?.[r.primary] ?? 0)}</dd><dt>Spend last ${S.data.live.days}d</dt><dd>${a.spendLive ? money(a.spendLive) : "—"}</dd><dt>${CONVERSION_LABEL[r.primary]}s last ${S.data.live.days}d</dt><dd>${fmtInt(a.conversionsLive?.[r.primary] ?? 0)}</dd><dt>Spend last 7d</dt><dd>${a.spend7 ? money(a.spend7) : "—"}</dd><dt>Clicks / impr.</dt><dd>${fmtInt(a.clicks)} / ${fmtInt(a.impressions)}</dd><dt>Ad id</dt><dd>${esc(a.id)}</dd></dl>
	<h4>Tags</h4><div class="tags"><div class="field"><label>Format</label>${sel("format", r.formats.map((x) => [x, FORMAT_LABEL[x]]), a.format)}</div><div class="field"><label>Stage</label>${sel("stage", STAGES.map((x) => [x, STAGE_LABEL[x]]), a.stage)}</div></div>
	<label class="check"><input type="checkbox" data-tag="oneOff" ${a.oneOff ? "checked" : ""} ${S.app.canEdit ? "" : "disabled"}> One-off (promo, launch): never revive</label>
	<h4>Your call</h4><div class="decide">${[["kill", "Kill", "danger"], ["scale", "Scale", "good"], ["revive", "Revive", "good"], ["keep", "Keep as is", ""]].map(([d, label, cls]) => `<button class="${cls}" data-decide="${d}" aria-pressed="${a.manual === d}" ${S.app.canEdit ? "" : "disabled"}>${label}</button>`).join("")}${a.manual ? `<button data-decide="" class="quiet">Clear</button>` : ""}</div>
	<p class="muted small">Filter to this <a href="#" data-act="focus-campaign">campaign</a> or <a href="#" data-act="focus-adset">${esc(adsetWord.toLowerCase())}</a>.</p>`;
}
function renderExportMenu() {
	const m = $("#exportMenu");
	if (!S.id) return (m.innerHTML = `<p class="muted small" style="padding:8px 12px">Build an account first.</p>`);
	const base = `api/accounts/${S.id}/`;
	const pdfNote = S.app.pdf ? "" : `<small>Needs Chrome on the machine running the map; otherwise open the HTML and print to PDF.</small>`;
	const pdfLinks = S.app.pdf || !WEB() ? `<a href="${base}slides.pdf">Slides PDF<small>The deck, one 16:9 page per slide.${pdfNote}</small></a>
	<a href="${base}report.pdf">Report PDF<small>The HTML report printed.${pdfNote}</small></a>` : `<a href="${base}slides.html?print" target="_blank" rel="noopener">Slides, print to PDF<small>Opens the deck ready for your browser's Print → Save as PDF (one slide per page).</small></a>`;
	m.innerHTML = `<h5>Formats</h5>
	<a href="${base}report.html" target="_blank" rel="noopener">HTML report<small>Readout, map, action plan and every ad, one page. Opens in a new tab.</small></a>
	<a href="${base}slides.html" target="_blank" rel="noopener">Slides<small>A GrowthCast deck: cover, map, lines, kills, scales, revives, formats, stages, next steps.</small></a>
	${pdfLinks}
	<a href="${base}report.html?download" download>Download HTML</a>
	<h5>Narrative</h5>
	<a href="${base}plan.md" download>Action plan (.md)<small>Implement the calls: kills, scales, revives, grouped by campaign, with the numbers.</small></a>
	<a href="${base}readout.md" download>Account readout (.md)<small>The audit: lines, spend, like-with-like, paused winners, caveats.</small></a>
	<a href="${base}actions.csv" download>Actions CSV<small>Every ad on the map with its call, for Ads Manager or a sheet.</small></a>
	${S.app.asks?.length ? `<h5>Ask Claude</h5><button data-ask="actions">Write the action memo</button><button data-ask="audit">Write the account readout</button>` : ""}`;
}

async function ask(kind) {
	const note = $("#note")?.value ?? "";
	try {
		S.request = await api("api/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, accountId: S.id, adIds: S.selected ? [S.selected] : [], filters: S.filters, note }) });
		$("#exportMenu").hidden = true;
		renderAsk();
		toast(S.app.mode === "web" ? "Sent to Claude; this map reloads when it's done" : "Queued for Claude: send any message in Claude Code and it arrives with it");
	} catch (e) {
		toast(e.message);
	}
}
function drawer() {
	const d = $("#drawer");
	d.hidden = !S.drawer;
	if (!S.drawer || !S.result) return;
	const s = S.settings, r = S.result;
	const row = (label, help, input) => `<div class="row"><div>${label}<small>${help}</small></div>${input}</div>`;
	const numf = (key, step = 1, scale = 1) => `<input type="number" step="${step}" data-set="${key}" data-scale="${scale}" value="${+(s[key] * scale).toFixed(4)}">`;
	const selectf = (key, opts) => `<select data-set="${key}">${opts.map(([v, l]) => `<option value="${v}" ${String(s[key]) === String(v) ? "selected" : ""}>${l}</option>`).join("")}</select>`;
	d.innerHTML = `<button class="close" data-act="settings">Close</button><h2>Lines & thresholds</h2><p class="help">Everything recomputes as you type and is saved to the account's settings, where Claude can read and edit it too.</p>
	<h4>Lines</h4>
	${row("Account CPA basis", `Current blended CPA: ${money(r.lines.account)}`, selectf("cpaBasis", [["live", `Last ${S.data.live.days} days`], ["lifetime", "Lifetime"]]))}
	${row("Target: % under account CPA", `Target ${money(r.lines.target)}`, numf("targetPct", 1, 100))}
	${row("Kill line: × target", money(r.lines.kill), numf("killMult", 0.1))}
	${row("Scale line: × target", money(r.lines.scale), numf("scaleMult", 0.05))}
	${row("Chart top: × target", "Ads above this go in the off-chart strip", numf("capMult", 0.5))}
	<h4>Ads</h4>
	${row("Min lifetime spend on the map", `${r.hidden} ads hidden`, numf("minSpend", 10))}
	${row("Test budget (spend)", `0 = 3 × target (${money(r.testBudget)}). Live ads under it are still testing`, numf("testBudget", 10))}
	${row("AOV", `0 = computed from ${CONVERSION_LABEL[r.primary]} value (${money(r.aov)})`, numf("aov", 1))}
	${row("Conversions needed to revive", "Paused ads need this many", numf("minRevivePurchases", 1))}
	<h4>Conversions</h4>
	${row("CPA counts", "The conversion the lines are drawn on", selectf("primary", [["", `Auto (${CONVERSION_LABEL[r.primary]})`], ...CONVERSIONS.map((c) => [c, CONVERSION_LABEL[c]])]))}
	${row("Secondary (TOF metric)", `Auto picks ${CONVERSION_LABEL[r.secondary] ?? "nothing"}`, selectf("secondary", [["", "Auto"], ...CONVERSIONS.map((c) => [c, CONVERSION_LABEL[c]])]))}
	${row("Grade TOF on the secondary", "Step 8: TOF ads judged on cost per secondary conversion", selectf("gradeTofBySecondary", [["false", "No"], ["true", "Yes"]]))}
	${row("Live window (days)", "Changing this needs a rebuild: use Refresh", `<input type="number" value="${s.liveDays}" disabled>`)}
	<h4>Notes for the exports</h4><textarea data-set="notes" rows="4" placeholder="Context the readout should carry: offers, seasonality, what changed.">${esc(s.notes)}</textarea>`;
}

// --- Events ---
document.addEventListener("click", (e) => {
	const t = e.target.closest("[data-filter],[data-step],[data-id],[data-ask],[data-decide],[data-act],[data-sort],[data-view],#toggleLeft,#toggleRight,#settingsBtn,#exportBtn,#refreshBtn");
	if (!t) {
		if (!e.target.closest("#exportMenu")) $("#exportMenu").hidden = true;
		return;
	}
	if (t.dataset.filter && t.tagName === "BUTTON") {
		S.filters[t.dataset.filter] = t.dataset.v;
		if (t.dataset.filter !== "y") S.step = S.step === 7 && t.dataset.filter === "format" ? 7 : null;
		return render();
	}
	if (t.dataset.step != null) return applyStep(Number(t.dataset.step));
	if (t.dataset.id) {
		S.selected = S.selected === t.dataset.id ? null : t.dataset.id;
		return render();
	}
	if (t.dataset.ask) return ask(t.dataset.ask);
	if (t.dataset.decide != null) return setDecision(S.selected, t.dataset.decide);
	if (t.dataset.sort) {
		S.sort = S.sort.key === t.dataset.sort ? { key: t.dataset.sort, dir: -S.sort.dir } : { key: t.dataset.sort, dir: 1 };
		return renderStage();
	}
	if (t.dataset.view) {
		S.view = t.dataset.view;
		return render();
	}
	if (t.id === "toggleLeft" || t.id === "toggleRight") {
		const left = t.id === "toggleLeft";
		document.body.classList.toggle(left ? "hide-left" : "hide-right");
		t.setAttribute("aria-pressed", String(!document.body.classList.contains(left ? "hide-left" : "hide-right")));
		return;
	}
	if (t.id === "settingsBtn" || t.dataset.act === "settings") {
		S.drawer = !S.drawer;
		return drawer();
	}
	if (t.id === "exportBtn") {
		const m = $("#exportMenu");
		m.hidden = !m.hidden;
		return;
	}
	if (t.id === "refreshBtn") return ask("refresh");
	if (t.dataset.act === "connect" || t.dataset.act === "disconnect") {
		e.preventDefault();
		const platform = t.dataset.platform;
		(async () => {
			try {
				if (t.dataset.act === "connect") {
					const { url } = await api("api/connections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: S.project, platform }) });
					window.open(url, "_blank", "noopener");
					toast("Finish connecting in the new tab; this page picks it up.");
				} else {
					if (!confirm(`Disconnect ${PLATFORMS[platform].label} from ${currentProject()?.name}? Built maps stay; refreshing them needs a new connection.`)) return;
					await api(`api/connections?projectId=${encodeURIComponent(S.project)}&platform=${platform}`, { method: "DELETE" });
				}
				await loadConnections();
				render();
			} catch (err) {
				toast(err.message);
			}
		})();
		return;
	}
	if (t.dataset.act === "add-account") {
		const sel = $("#addAccount"), opt = sel?.selectedOptions[0];
		if (!opt) return;
		(async () => {
			try {
				t.disabled = true;
				const { account } = await api("api/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: S.project, projectName: currentProject()?.name ?? "", platform: S.pickable.platform, externalId: opt.value, name: opt.dataset.name, currency: opt.dataset.currency }) });
				S.pickable = { platform: "", list: null, busy: false };
				await loadAccounts();
				S.id = account.id;
				$("#account").value = S.id;
				await loadAccount();
				toast("Pulling the account; this page updates itself when it's ready");
			} catch (err) {
				t.disabled = false;
				toast(err.message);
			}
		})();
		return;
	}
	if (t.dataset.act === "reset") {
		S.filters = { ...FILTERS(), live: "all" };
		S.step = 0;
		return render();
	}
	if (t.dataset.act === "focus-campaign" || t.dataset.act === "focus-adset") {
		e.preventDefault();
		const a = S.result.ads.find((x) => x.id === S.selected);
		if (!a) return;
		S.filters.campaign = a.campaignId;
		S.filters.adset = t.dataset.act === "focus-adset" ? a.adsetId : "all";
		S.filters.live = "all";
		S.step = null;
		S.view = "map";
		return render();
	}
	if (t.dataset.act === "clear") {
		e.preventDefault();
		api(`api/request${S.app.mode === "web" ? `?accountId=${S.id}` : ""}`, { method: "DELETE" }).then(() => {
			S.request = null;
			renderAsk();
		});
	}
});
document.addEventListener("change", (e) => {
	const t = e.target;
	if (t.id === "project") {
		S.project = t.value;
		localStorage.setItem("cpamap:project", S.project);
		S.id = null;
		S.selected = null;
		S.pickable = { platform: "", list: null, busy: false };
		return loadAccounts();
	}
	if (t.id === "addPlatform") {
		S.pickable = { platform: t.value, list: null, busy: !!t.value };
		renderRail();
		if (!t.value) return;
		return api(`api/connections/accounts?projectId=${encodeURIComponent(S.project)}&platform=${t.value}`).then((list) => {
			S.pickable = { platform: t.value, list, busy: false };
			renderRail();
		}).catch((err) => {
			S.pickable = { platform: t.value, list: [], busy: false };
			renderRail();
			toast(err.message);
		});
	}
	if (t.id === "account") {
		S.id = t.value;
		S.selected = null;
		S.filters = FILTERS();
		S.step = 6;
		return loadAccount();
	}
	if (t.dataset.filter) {
		S.filters[t.dataset.filter] = t.type === "checkbox" ? t.checked : t.value;
		if (t.dataset.filter === "campaign") S.filters.adset = "all";
		if (t.dataset.filter !== "hide") S.step = null;
		return render();
	}
	if (t.dataset.tag && S.selected) return setOverride(S.selected, { [t.dataset.tag]: t.type === "checkbox" ? t.checked : t.value });
	if (t.dataset.set) {
		let v = t.value;
		if (t.type === "number") v = Number(v) / Number(t.dataset.scale || 1);
		if (v === "true" || v === "false") v = v === "true";
		saveSettings({ [t.dataset.set]: v });
		return drawer();
	}
});
document.addEventListener("input", (e) => {
	if (e.target.id === "q") {
		S.filters.q = e.target.value.trim().toLowerCase();
		S.step = null;
		renderStage();
	}
});
document.addEventListener("keydown", (e) => {
	if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
	if (e.key === "Escape") {
		if (S.drawer) {
			S.drawer = false;
			return drawer();
		}
		S.selected = null;
		return render();
	}
	if (e.key === "[") $("#toggleLeft").click();
	if (e.key === "]") $("#toggleRight").click();
});
const tip = $("#tip");
document.addEventListener("mousemove", (e) => {
	const g = e.target.closest?.(".dot:not(.dim)");
	if (!g || !S.result) return (tip.hidden = true);
	const a = S.result.ads.find((x) => x.id === g.dataset.id);
	if (!a) return (tip.hidden = true);
	const r = S.result;
	tip.innerHTML = `<b>${esc(a.name)}</b><div>${esc(a.campaignName)}${a.adsetName ? ` · ${esc(a.adsetName)}` : ""}</div><div class="m">${money(a.spend)} spent · ${fmtInt(a.conv)} ${CONVERSION_LABEL[r.primary]}s · CPA ${a.cpa == null ? "—" : money(a.cpa)}${r.secondary ? ` · ${fmtInt(a.sec)} ${CONVERSION_LABEL[r.secondary]}s` : ""}</div><div class="m">${FORMAT_LABEL[a.format]} · ${STAGE_LABEL[a.stage]} · ${a.live ? `live, ${money(a.spendLive)} in ${S.data.live.days}d` : "not live"}</div><div class="r">${ACTION_LABEL[a.action]}: ${esc(a.reason)}</div>`;
	tip.hidden = false;
	tip.style.left = `${Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 10)}px`;
	tip.style.top = `${Math.min(e.clientY + 14, window.innerHeight - tip.offsetHeight - 10)}px`;
});
window.addEventListener("hashchange", () => {
	const id = decodeURIComponent(location.hash.slice(1));
	if (id && id !== S.id && S.accounts.some((a) => a.id === id)) {
		S.id = id;
		$("#account").value = id;
		loadAccount();
	}
});
boot().catch((e) => ($("#stage").innerHTML = `<div class="empty">${esc(e.message)}</div>`));
