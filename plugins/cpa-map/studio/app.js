// CPA map studio. One account at a time: every ad with ≥ min spend on a log-spend × CPA scatter, the four lines,
// filters (live, format, stage, campaign, ad set, metric), the playbook's steps as presets, an inspector for tags and
// manual calls, the generated action plan and readout, and exports. Settings save to the server and the chart
// recomputes locally. The same app runs in the GrowthCast client portal ("web mode"), so every API path is relative.
import { renderChart, CHART_CSS, LEGEND_HTML } from "./chart.mjs";
import { ACTION_LABEL, ACTION_ORDER, CONVERSIONS, CONVERSION_LABEL, FORMAT_LABEL, PLATFORMS, STAGES, STAGE_LABEL, analyse, esc, fmtInt, fmtMoney, rollup } from "./model.mjs";
import { planSections, readoutSections } from "./report.mjs";

const $ = (s, el = document) => el.querySelector(s);
const FILTERS = () => ({ live: "live", format: "all", stage: "all", campaign: [], adset: [], ad: [], y: "cpa", hide: false, q: "" });
const LISTS = ["campaign", "adset", "ad"]; // multi-select filters: [] = all
const S = { app: { mode: "local", canEdit: true, asks: [], pdf: false, platforms: { meta: true, google: true } }, projects: [], project: "", connections: [], pickable: { platform: "", list: null, busy: false }, accounts: [], id: null, data: null, settings: null, version: null, result: null, view: "map", filters: { ...FILTERS(), live: "all" }, step: null, level: "campaign", items: [], selected: null, sort: { key: "action", dir: 1 }, request: null, drawer: false, openMulti: {}, multiQ: {}, zoom: { x: null, y: null, ylog: false } };
const STEPS = {
	0: { title: "Every ad on one map.", sub: "Log lifetime spend across, CPA up. Left half is testing; top right is high spend / high cost; bottom right is where the money is.", filters: { live: "all" } },
	5: { title: "Not live: turn old winners back on.", sub: "Paused ads under the scale line with 3+ purchases that aren't one-offs (promos, launches). Turn them back on.", filters: { live: "off" } },
	6: { title: "Live: kill above the kill line, scale below the scale line.", sub: "Above the kill line and past the test budget: kill. Half an AOV spent with nothing to show: kill. Under the scale line: raise budget 20% at a time.", filters: { live: "live" } },
	7: { title: "Format: compare like with like.", sub: "One format at a time. The gap inside a format is usually wider than you expect. Kill the worst of each and scale the best; brief new content from what separates them.", filters: { live: "live", format: "first" } },
	8: { title: "Stage: grade each stage on its own metric.", sub: "TOF on cost per add-to-cart (or sign-up): a top-of-funnel ad with a bad CPA and cheap carts is doing its job. BOF on CPA.", filters: { live: "live", stage: "tof", y: "cps" }, settings: { gradeTofBySecondary: true } },
};

const api = async (path, opts = {}) => {
	// Every write is JSON, including bodiless DELETEs: the portal proxy refuses writes without the content type.
	const headers = opts.method && opts.method !== "GET" ? { "content-type": "application/json", ...(opts.headers ?? {}) } : opts.headers;
	const r = await fetch(path, { cache: "no-store", ...opts, headers });
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
	for (const k of ["live", "format", "stage", "y", "campaign", "adset", "ad"]) if (q.has(k)) {
		const v = q.get(k);
		S.filters[k] = LISTS.includes(k) ? (v === "all" ? [] : v.split(",").filter(Boolean)) : v;
		S.step = null;
	}
	for (const k of LISTS) if (S.filters[k].length) S.openMulti[k] = true;
	if (q.get("view")) S.view = q.get("view");
	if (["campaign", "adset", "ad"].includes(q.get("level"))) S.level = q.get("level");
	if (q.has("settings")) S.drawer = true;
	if (q.has("zoom")) {
		const [x0, x1, y0, y1, lg] = q.get("zoom").split(",");
		S.zoom = { x: +x0 > 0 && +x1 > +x0 ? [+x0, +x1] : null, y: +y1 > 0 ? [Math.max(0, +y0 || 0), +y1] : null, ylog: lg === "log" };
	}
	$("#account").innerHTML = S.accounts.map((a) => `<option value="${esc(a.id)}" ${a.id === S.id ? "selected" : ""}>${esc(a.name)} · ${(PLATFORMS[a.platform] ?? PLATFORMS.meta).short} · ${a.building ? "pulling…" : `${a.ads} ads`}</option>`).join("") || `<option>No accounts yet</option>`;
	if (S.id) await loadAccount();
	else render();
}
async function loadAccount() {
	const { data, settings, version, building, request } = await api(`api/accounts/${S.id}`);
	if (S.data && data?.account?.id !== S.data.account?.id) S.zoom = { x: null, y: null, ylog: false }; // a new account starts unzoomed
	Object.assign(S, { data, settings, version, building: !!building });
	if (request) S.request = request;
	if (location.hash !== `#${S.id}`) history.replaceState(null, "", `#${S.id}`);
	compute();
	render();
	if (S.drawer) drawer();
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
	if (f.campaign.length && !f.campaign.includes(a.campaignId)) return false;
	if (f.adset.length && !f.adset.includes(a.adsetId)) return false;
	if (f.ad.length && !f.ad.includes(a.id)) return false;
	if (f.q && !`${a.name} ${a.campaignName} ${a.adsetName}`.toLowerCase().includes(f.q)) return false;
	return true;
};
const yOf = (a) => (S.filters.y === "cps" ? a.cps : a.cpa);
// The lines drawn: the stage's own lines when one stage is filtered and it is graded on the metric shown.
const linesNow = () => {
	const r = S.result, f = S.filters, sl = f.stage !== "all" ? r.stageLines?.[f.stage] : null;
	if (f.y === "cps") return sl?.basis === "secondary" ? sl : r.linesSecondary;
	return sl?.basis === "primary" ? sl : r.lines;
};
const yName = () => (S.filters.y === "cps" ? `cost per ${CONVERSION_LABEL[S.result.secondary]}` : "CPA");
function applyStep(n, rerender = true) {
	const st = STEPS[n];
	S.step = n;
	S.level = "ad";
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
	${pk.platform ? `${pk.list === null ? `<p class="muted small">${pk.busy ? "Listing the ad accounts you can reach…" : ""}</p>` : pk.list.length ? `<div class="field"><label>Account</label><select id="addAccount">${pk.list.map((a) => `<option value="${esc(a.externalId)}" data-name="${esc(a.name)}" data-currency="${esc(a.currency ?? "")}">${esc(a.name)} · ${esc(a.externalId)}${a.currency ? ` · ${esc(a.currency)}` : ""}</option>`).join("")}</select></div><button class="primary" data-act="add-account" style="width:100%">Pull it into the map</button><p class="muted small">A first pull takes a few minutes on a big account.</p>` : `<p class="muted small">${pk.error ? `The platform refused to list ad accounts: ${esc(pk.error)}` : "The connection can't see any ad accounts."} ${pk.platform === "meta" ? "A system-user token needs <code>ads_read</code> and the ad account assigned to it; or enter the account id below." : "Enter the customer id below."}</p>`}
	<div class="field"><label>${pk.list?.length ? "Or an account id" : "Account id"}</label><input id="addAccountId" placeholder="${pk.platform === "meta" ? "act_123456789" : "1234567890"}" autocomplete="off"></div><button class="quiet" data-act="add-account-id" style="width:100%">Pull this id into the map</button>` : ""}` : ""}`;
}
function renderRail() {
	const rail = $("#rail");
	if (!S.result) return (rail.innerHTML = `${webPanel()}${WEB() ? "" : `<h4>Accounts</h4><p class="muted small">Nothing built yet. In Claude Code: <code>/cpa-map:open &lt;account name&gt;</code> pulls an account through BlueAlpha and builds the map.</p>`}`);
	const r = S.result, f = S.filters;
	const count = (pred) => r.ads.filter(pred).length;
	const seg = (name, opts) => `<div class="seg" role="group" aria-label="${name}">${opts.map(([v, label, n]) => `<button data-filter="${name}" data-v="${esc(v)}" aria-pressed="${f[name] === v}">${esc(label)}${n != null ? `<span class="n">${n}</span>` : ""}</button>`).join("")}</div>`;
	const [, adsetWord] = level();
	const multi = (name, label, items, sel) => {
		const mq = S.multiQ[name] ?? "", cap = 400;
		return `<details class="multi" data-multi-box="${name}" ${S.openMulti[name] ? "open" : ""}><summary><span>${esc(label)}</span><b>${sel.length ? `${sel.length} of ${items.length}` : `All · ${items.length}`}</b></summary><div class="multi-list">${items.length > 8 ? `<input type="search" data-multi-q="${name}" placeholder="Type to find…" value="${esc(mq)}" autocomplete="off">` : ""}<div class="multi-items">${items.slice(0, cap).map((it) => `<label data-text="${esc(it.name.toLowerCase())}" ${mq && !it.name.toLowerCase().includes(mq) ? "hidden" : ""}><input type="checkbox" data-multi="${name}" value="${esc(it.id)}" ${sel.includes(it.id) ? "checked" : ""}><span title="${esc(it.name)}">${esc(it.name)}</span><small>${esc(it.meta ?? "")}</small></label>`).join("") || `<p class="muted small">Nothing here.</p>`}${items.length > cap ? `<p class="muted small">Showing ${cap} of ${items.length}: narrow by campaign or ${esc(adsetWord.toLowerCase())} first.</p>` : ""}</div>${sel.length ? `<button class="quiet" data-multi-clear="${name}">Every ${esc(label.toLowerCase())}</button>` : ""}</div></details>`;
	};
	const campaigns = r.campaigns.map((c) => ({ id: c.id, name: c.name, meta: `${c.ads}${c.live ? ` · ${c.live} live` : ""}` }));
	const adsets = r.adsets.filter((g) => !f.campaign.length || f.campaign.includes(g.campaignId)).map((g) => ({ id: g.id, name: g.name, meta: String(g.ads) }));
	const adItems = r.ads.filter((a) => (!f.campaign.length || f.campaign.includes(a.campaignId)) && (!f.adset.length || f.adset.includes(a.adsetId))).sort((a, b) => b.spend - a.spend).map((a) => ({ id: a.id, name: a.name, meta: money(a.spend) }));
	rail.innerHTML = `${webPanel()}
	<h4>The playbook</h4>
	<div class="steps">${[0, 5, 6, 7, 8].map((n) => `<button data-step="${n}" aria-pressed="${S.step === n}"><b>${n ? `Step ${n}` : "Map"}</b>${esc(STEPS[n].title)}</button>`).join("")}</div>
	<h4>Filters</h4>
	${seg("live", [["live", "Live", count((a) => a.live)], ["off", "Not live", count((a) => !a.live)], ["all", "All", r.ads.length]])}
	${seg("format", [["all", "All formats"], ...r.formats.filter((x) => count((a) => a.format === x)).map((x) => [x, FORMAT_LABEL[x], count((a) => a.format === x)])])}
	${seg("stage", [["all", "All stages"], ...STAGES.filter((x) => count((a) => a.stage === x)).map((x) => [x, STAGE_LABEL[x], count((a) => a.stage === x)])])}
	${multi("campaign", "Campaign", campaigns, f.campaign)}
	${multi("adset", adsetWord, adsets, f.adset)}
	${multi("ad", "Ad", adItems, f.ad)}
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
	const level = S.level, [, adsetWord] = level_();
	// Campaign and ad-set levels show one dot per group, built from the ads that match the filters.
	const items = level === "ad" ? shown : rollup(r, level, shown);
	S.items = items;
	const chartResult = level === "ad" ? r : { ...r, ads: items };
	const L = linesNow();
	const off = items.filter((a) => yOf(a) == null || yOf(a) > L.cap);
	const title = step ? step.title : level === "ad" ? "Ads" : level === "adset" ? `${adsetWord}s` : "Campaigns";
	const sub = step ? step.sub : `${[f.live !== "all" ? (f.live === "live" ? "live" : "not live") : "", f.format !== "all" ? FORMAT_LABEL[f.format] : "", f.stage !== "all" ? STAGE_LABEL[f.stage] : "", f.campaign.map((id) => r.campaigns.find((c) => c.id === id)?.name ?? id).join(", "), f.adset.map((id) => r.adsets.find((g) => g.id === id)?.name ?? id).join(", "), f.ad.length ? `${f.ad.length} chosen ad${f.ad.length > 1 ? "s" : ""}` : "", f.q ? `“${f.q}”` : ""].filter(Boolean).join(" · ") || (level === "ad" ? "every ad on the map" : `every ${level === "adset" ? adsetWord.toLowerCase() : "campaign"} with ads on the map`)}. ${level === "ad" ? "Click a dot or row for its numbers; call it by hand in the inspector." : "Each dot is a whole group, graded on its totals. Click one to see it; use › to drill into it."}`;
	const noun = level === "ad" ? "ads" : level === "adset" ? `${adsetWord.toLowerCase()}s` : "campaigns";
	stage.innerHTML = `
	${crumbs()}
	<div class="headline">${S.step ? `<span class="step">Step ${S.step}</span>` : ""}<h1>${esc(title)}</h1></div>
	<p class="sub">${esc(sub)}</p>
	<p class="stats"><b>${items.length} ${noun}</b>${level !== "ad" ? ` (${shown.length} ads)` : ""} · <b>${items.filter((a) => a.action === "kill").length} kill</b> · <b>${items.filter((a) => a.action === "scale").length} scale</b> · <b>${items.filter((a) => a.action === "revive").length} revive</b> · ${esc(yName())} ↑ · filled = live, hollow = not live · ${off.length} off the chart${r.hidden ? ` · ${r.hidden} ads under ${money(S.settings.minSpend)} hidden` : ""} · ${esc(S.data.account.name)} · ${esc(S.data.window.since ?? "lifetime")} → ${esc(S.data.window.until)} · live = delivering now and spent in the last ${S.data.live.days} days</p>
	<div class="chart-wrap">${chartTools()}${renderChart(chartResult, cur(), { y: f.y, shown: level === "ad" ? matches : () => true, hideOthers: f.hide, selected: S.selected, lines: L, view: viewNow() })}${LEGEND_HTML}</div>
	<div class="table-wrap">${table(items)}</div>`;
}
const level_ = () => (PLATFORMS[S.result?.platform ?? "meta"] ?? PLATFORMS.meta).level;
// Campaigns › campaign › ad set, plus the level switch. Each crumb resets the filters below it.
function crumbs() {
	const r = S.result, f = S.filters, [, adsetWord] = level_();
	const camp = f.campaign.length === 1 ? r.campaigns.find((c) => c.id === f.campaign[0]) : null;
	const set = f.adset.length === 1 ? r.adsets.find((g) => g.id === f.adset[0]) : null;
	const parts = [`<button data-crumb="campaign" ${S.level === "campaign" && !f.campaign.length ? 'aria-current="page"' : ""}>All campaigns</button>`];
	if (camp) parts.push(`<button data-crumb="adset" ${S.level === "adset" && !f.adset.length ? 'aria-current="page"' : ""} title="${esc(camp.name)}">${esc(camp.name)}</button>`);
	else if (f.campaign.length > 1) parts.push(`<span>${f.campaign.length} campaigns</span>`);
	if (set) parts.push(`<button data-crumb="ad" ${S.level === "ad" ? 'aria-current="page"' : ""} title="${esc(set.name)}">${esc(set.name)}</button>`);
	else if (f.adset.length > 1) parts.push(`<span>${f.adset.length} ${esc(adsetWord.toLowerCase())}s</span>`);
	const seg = [["campaign", "Campaigns"], ["adset", `${adsetWord}s`], ["ad", "Ads"]].map(([v, l]) => `<button data-level="${v}" aria-pressed="${S.level === v}">${esc(l)}</button>`).join("");
	return `<div class="crumbs"><nav aria-label="Drill-down">${parts.join('<i aria-hidden="true">›</i>')}</nav><div class="seg level" role="group" aria-label="Level">${seg}</div></div>`;
}
// Drill into one campaign or ad set: filter to it and go one level down.
function drill(id) {
	const g = S.items.find((x) => x.id === id);
	if (!g?.kind) return;
	if (g.kind === "campaign") Object.assign(S.filters, { campaign: [g.key], adset: [], ad: [] });
	else Object.assign(S.filters, { campaign: [g.campaignId], adset: [g.key], ad: [] });
	S.level = g.kind === "campaign" ? "adset" : "ad";
	S.step = null;
	S.selected = null;
	S.openMulti[g.kind === "campaign" ? "campaign" : "adset"] = true;
	render();
}
// --- Chart zoom ---
// The view: null parts mean the chart's defaults (X from the min spend, Y from 0 to the cap line).
const viewNow = () => ({ xmin: S.zoom.x?.[0] ?? null, xmax: S.zoom.x?.[1] ?? null, ymin: S.zoom.y?.[0] ?? null, ymax: S.zoom.y?.[1] ?? null, ylog: S.zoom.ylog });
const zoomed = () => !!(S.zoom.x || S.zoom.y || S.zoom.ylog);
function chartTools() {
	const b = (k, label, title, on = false) => `<button data-zoom="${k}" title="${esc(title)}" aria-pressed="${on}">${label}</button>`;
	return `<div class="chart-tools"><span>View</span>${b("fit", "Fit to data", "Snap both axes to the ads that match the filters")}${b("all", "Show all", "Zoom out until every matching ad is on the chart")}${b("in", "+", "Zoom in")}${b("out", "−", "Zoom out")}${b("log", "Y log", "Log scale on the Y axis", S.zoom.ylog)}${zoomed() ? b("reset", "Reset", "Back to the default view: spend from the minimum, Y up to the cap line") : ""}<em>drag a box to zoom · ⌘ or ctrl + wheel</em></div>`;
}
function currentScales() {
	const svg = $("#stage svg.chart");
	if (!svg) return null;
	const d = svg.dataset, [pl, pt, pw, ph] = d.plot.split(",").map(Number);
	return { xmin: +d.xmin, xmax: +d.xmax, ymin: +d.ymin, ymax: +d.ymax, ylog: d.ylog === "1", pl, pt, pw, ph, svg };
}
// Pixel (client) → data value, through the svg's viewBox.
function unproject(sc, clientX, clientY) {
	const r = sc.svg.getBoundingClientRect(), vb = sc.svg.viewBox.baseVal;
	const px = ((clientX - r.left) / r.width) * vb.width, py = ((clientY - r.top) / r.height) * vb.height;
	const fx = Math.min(1, Math.max(0, (px - sc.pl) / sc.pw)), fy = Math.min(1, Math.max(0, 1 - (py - sc.pt) / sc.ph));
	const x = 10 ** (Math.log10(sc.xmin) + fx * (Math.log10(sc.xmax) - Math.log10(sc.xmin)));
	const y = sc.ylog ? 10 ** (Math.log10(Math.max(sc.ymin, 1e-9)) + fy * (Math.log10(sc.ymax) - Math.log10(Math.max(sc.ymin, 1e-9)))) : sc.ymin + fy * (sc.ymax - sc.ymin);
	return { x, y };
}
function zoomBy(factor) {
	const sc = currentScales();
	if (!sc) return;
	const lx0 = Math.log10(sc.xmin), lx1 = Math.log10(sc.xmax), cx = (lx0 + lx1) / 2, hw = ((lx1 - lx0) / 2) * factor;
	const x = [Math.max(1, 10 ** (cx - hw)), 10 ** (cx + hw)];
	let y;
	if (sc.ylog) {
		const ly0 = Math.log10(Math.max(sc.ymin, 1e-9)), ly1 = Math.log10(sc.ymax), cy = (ly0 + ly1) / 2, hh = ((ly1 - ly0) / 2) * factor;
		y = [10 ** (cy - hh), 10 ** (cy + hh)];
	} else y = [sc.ymin, sc.ymin + (sc.ymax - sc.ymin) * factor];
	S.zoom = { ...S.zoom, x, y };
	renderStage();
}
function zoomTo(kind) {
	const r = S.result;
	if (kind === "reset") S.zoom = { x: null, y: null, ylog: false };
	else if (kind === "log") S.zoom = { ...S.zoom, ylog: !S.zoom.ylog };
	else if (kind === "in") return zoomBy(1 / 1.5);
	else if (kind === "out") return zoomBy(1.5);
	else {
		const ads = r.ads.filter(matches), ys = ads.map(yOf).filter((v) => v != null && v > 0);
		if (!ads.length) return toast("No ads match the filters.");
		if (kind === "fit") {
			const xs = ads.map((a) => a.spend);
			S.zoom = { ...S.zoom, x: [Math.max(1, Math.min(...xs) / 1.15), Math.max(...xs) * 1.15], y: ys.length ? [S.zoom.ylog ? Math.min(...ys) / 1.15 : 0, Math.max(...ys) * 1.08] : null };
		} else if (kind === "all") S.zoom = { ...S.zoom, x: null, y: ys.length ? [0, Math.max(...ys) * 1.05] : null };
	}
	renderStage();
}
// Drag a box on the chart to zoom to it.
let drag = null;
document.addEventListener("mousedown", (e) => {
	const svg = e.target.closest?.("#stage svg.chart");
	if (!svg || e.button !== 0 || e.target.closest(".dot")) return;
	const sc = currentScales();
	if (!sc) return;
	const wrap = svg.closest(".chart-wrap"), box = document.createElement("div");
	box.className = "zoom-box";
	wrap.appendChild(box);
	drag = { sc, x0: e.clientX, y0: e.clientY, box, wrap };
	e.preventDefault();
});
document.addEventListener("mousemove", (e) => {
	if (!drag) return;
	const w = drag.wrap.getBoundingClientRect();
	const x = Math.min(drag.x0, e.clientX) - w.left, y = Math.min(drag.y0, e.clientY) - w.top;
	Object.assign(drag.box.style, { left: `${x}px`, top: `${y}px`, width: `${Math.abs(e.clientX - drag.x0)}px`, height: `${Math.abs(e.clientY - drag.y0)}px` });
});
document.addEventListener("mouseup", (e) => {
	if (!drag) return;
	const { sc, x0, y0, box } = drag;
	drag = null;
	box.remove();
	if (Math.abs(e.clientX - x0) < 8 || Math.abs(e.clientY - y0) < 8) return;
	const a = unproject(sc, Math.min(x0, e.clientX), Math.max(y0, e.clientY)), b = unproject(sc, Math.max(x0, e.clientX), Math.min(y0, e.clientY));
	if (!(b.x > a.x && b.y > a.y)) return;
	S.zoom = { ...S.zoom, x: [a.x, b.x], y: [sc.ylog ? Math.max(a.y, 1e-6) : a.y, b.y] };
	renderStage();
});
document.addEventListener("wheel", (e) => {
	if (!(e.ctrlKey || e.metaKey) || !e.target.closest?.("#stage svg.chart")) return;
	e.preventDefault();
	zoomBy(e.deltaY > 0 ? 1.25 : 1 / 1.25);
}, { passive: false });

function table(items) {
	const { key, dir } = S.sort, r = S.result, level = S.level, [, adsetWord] = level_();
	const val = (a) => ({ action: ACTION_ORDER[a.action], name: a.name.toLowerCase(), format: a.format, stage: a.stage, spend: a.spend, conv: a.conv, cpa: a.cpa ?? Infinity, sec: a.sec, cps: a.cps ?? Infinity, spendLive: a.spendLive, ads: a.ads ?? 1 }[key]);
	const rows = [...items].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : b.spend - a.spend) * dir);
	const th = (k, label, num) => `<th class="${num ? "num" : ""}" data-sort="${k}">${label}${key === k ? (dir > 0 ? " ↑" : " ↓") : ""}</th>`;
	const nameHead = level === "ad" ? "Ad" : level === "adset" ? adsetWord : "Campaign";
	const path = (a) => (level === "ad" ? `${esc(a.campaignName)}${a.adsetName ? " · " + esc(a.adsetName) : ""}` : level === "adset" ? esc(a.campaignName) : `${a.campaignStatus ? esc(String(a.campaignStatus).toLowerCase()) : ""}`);
	const calls = (a) => ["kill", "scale", "revive"].filter((k) => a.counts?.[k]).map((k) => `<span class="pill ${k}">${a.counts[k]}</span>`).join(" ") || "—";
	return `<table class="ads"><thead><tr>${th("action", "Call")}${th("name", nameHead)}${level !== "ad" ? th("ads", "Ads", 1) : ""}${th("format", "Format")}${th("stage", "Stage")}${th("spend", "Spend", 1)}${th("conv", CONVERSION_LABEL[r.primary] + "s", 1)}${th("cpa", "CPA", 1)}${r.secondary ? th("sec", CONVERSION_LABEL[r.secondary] + "s", 1) + th("cps", "Cost / " + CONVERSION_LABEL[r.secondary], 1) : ""}${th("spendLive", `Spend ${S.data.live.days}d`, 1)}${level !== "ad" ? `<th>Ad calls</th><th></th>` : ""}</tr></thead>
	<tbody>${rows.slice(0, 600).map((a) => `<tr class="row ${a.id === S.selected ? "sel" : ""}" data-id="${esc(a.id)}"><td><span class="pill ${a.action}">${ACTION_LABEL[a.action]}</span>${a.manual ? " ✎" : ""}${a.paused && a.live === false && a.action !== "revive" ? `<span class="muted small"> · ${esc(a.paused)} paused</span>` : ""}</td><td><span class="name" title="${esc(a.name)}">${esc(a.name)}</span><span class="camp" title="${esc(a.campaignName)}">${path(a)}</span></td>${level !== "ad" ? `<td class="num">${a.liveAds}/${a.ads}</td>` : ""}<td>${FORMAT_LABEL[a.format] ?? a.format}</td><td><span class="fun fun-${a.stage}">${STAGE_LABEL[a.stage]}</span></td><td class="num">${money(a.spend)}</td><td class="num">${fmtInt(a.conv)}</td><td class="num">${a.cpa == null ? "—" : money(a.cpa)}</td>${r.secondary ? `<td class="num">${fmtInt(a.sec)}</td><td class="num">${a.cps == null ? "—" : money(a.cps)}</td>` : ""}<td class="num">${a.spendLive ? money(a.spendLive) : "—"}</td>${level !== "ad" ? `<td>${calls(a)}</td><td><button class="quiet drill" data-act="drill" data-id="${esc(a.id)}" title="Open its ${level === "campaign" ? adsetWord.toLowerCase() + "s" : "ads"}">›</button></td>` : ""}</tr>`).join("") || `<tr><td colspan="12" class="empty">Nothing matches these filters.</td></tr>`}</tbody></table>${rows.length > 600 ? `<p class="muted small">Showing 600 of ${rows.length}. Narrow the filters or use the CSV.</p>` : ""}`;
}
function renderInspector() {
	const el = $("#inspector");
	if (!S.result) return (el.innerHTML = "");
	const r = S.result, a = r.ads.find((x) => x.id === S.selected), g = S.items.find((x) => x.id === S.selected && x.kind);
	const [, adsetWord] = level();
	if (g) {
		const next = g.kind === "campaign" ? `${adsetWord.toLowerCase()}s` : "ads";
		return (el.innerHTML = `<h2>${esc(g.name)}</h2><div class="path">${g.kind === "campaign" ? "Campaign" : adsetWord}${g.kind === "adset" ? ` · ${esc(g.campaignName)}` : ""}${g.campaignStatus ? ` · campaign ${esc(String(g.campaignStatus).toLowerCase())}` : ""}${g.adsetStatus ? ` · ${esc(adsetWord.toLowerCase())} ${esc(String(g.adsetStatus).toLowerCase())}` : ""}</div>
	<span class="pill ${g.action}">${ACTION_LABEL[g.action]}</span><p class="reason">${esc(g.reason)}</p>
	<dl class="kv"><dt>Ads on the map</dt><dd>${g.liveAds} live / ${g.ads}</dd><dt>Lifetime spend</dt><dd>${money(g.spend)}</dd><dt>${CONVERSION_LABEL[r.primary]}s</dt><dd>${fmtInt(g.conv)}</dd><dt>CPA</dt><dd>${g.cpa == null ? "—" : money(g.cpa)}</dd>${r.secondary ? `<dt>${CONVERSION_LABEL[r.secondary]}s</dt><dd>${fmtInt(g.sec)}</dd><dt>Cost / ${CONVERSION_LABEL[r.secondary]}</dt><dd>${g.cps == null ? "—" : money(g.cps)}</dd>` : ""}<dt>Spend last ${S.data.live.days}d</dt><dd>${g.spendLive ? money(g.spendLive) : "—"}</dd><dt>Spend last 7d</dt><dd>${g.spend7 ? money(g.spend7) : "—"}</dd><dt>Clicks / impr.</dt><dd>${fmtInt(g.clicks)} / ${fmtInt(g.impressions)}</dd><dt>Mostly</dt><dd>${FORMAT_LABEL[g.format] ?? g.format} · ${STAGE_LABEL[g.stage]}</dd></dl>
	<h4>Its ads' calls</h4><dl class="kv">${Object.entries(g.counts).filter(([, v]) => v).map(([k, v]) => `<dt>${ACTION_LABEL[k]}</dt><dd>${v}</dd>`).join("")}</dl>
	<button class="primary" data-act="drill" data-id="${esc(g.id)}" style="width:100%">Open its ${next} ›</button>
	<p class="muted small">Calls on a group come from its totals against the same lines. Hand calls and tags are made on ads.</p>`);
	}
	if (!a) return (el.innerHTML = `<h4>Lines</h4><dl class="kv"><dt>Account CPA</dt><dd>${money(r.lines.account)}</dd><dt>Target</dt><dd>${money(r.lines.target)}</dd><dt>Kill line</dt><dd>${money(r.lines.kill)}</dd><dt>Scale line</dt><dd>${money(r.lines.scale)}</dd><dt>AOV</dt><dd>${money(r.aov)}</dd><dt>Test budget</dt><dd>${money(r.testBudget)}</dd><dt>Basis</dt><dd>${r.basis === "live" ? `last ${S.data.live.days} days` : "lifetime"}</dd><dt>CPA on</dt><dd>${CONVERSION_LABEL[r.primary]}s</dd>${r.secondary ? `<dt>Secondary</dt><dd>${CONVERSION_LABEL[r.secondary]}s</dd>` : ""}</dl>
		${Object.entries(r.stageLines).filter(([, L]) => L.custom).map(([st, L]) => `<h4>${STAGE_LABEL[st]} lines</h4><dl class="kv"><dt>Graded on</dt><dd>${L.basis === "secondary" ? `cost / ${CONVERSION_LABEL[r.secondary]}` : "CPA"}</dd><dt>Target</dt><dd>${money(L.target)}</dd><dt>Kill line</dt><dd>${money(L.kill)}</dd><dt>Scale line</dt><dd>${money(L.scale)}</dd></dl>`).join("")}
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
	const r = S.result, s = r.settings; // normalized: stored settings may predate newer keys
	const row = (label, help, input) => `<div class="row"><div>${label}<small>${help}</small></div>${input}</div>`;
	const numf = (key, step = 1, scale = 1) => `<input type="number" step="${step}" data-set="${key}" data-scale="${scale}" value="${+(s[key] * scale).toFixed(4)}">`;
	const selectf = (key, opts) => `<select data-set="${key}">${opts.map(([v, l]) => `<option value="${v}" ${String(s[key]) === String(v) ? "selected" : ""}>${l}</option>`).join("")}</select>`;
	d.innerHTML = `<button class="close" data-act="settings">Close</button><h2>Lines & thresholds</h2><p class="help">Everything recomputes as you type and is saved to the account's settings, where Claude can read and edit it too.</p>
	<h4>Lines</h4>
	${row("Account CPA basis", `Current blended CPA: ${money(r.lines.account)}`, selectf("cpaBasis", [["live", `Last ${S.data.live.days} days`], ["lifetime", "Lifetime"]]))}
	${row("Target", `Target ${money(r.lines.target)}`, selectf("targetMode", [["pct", "% under account CPA"], ["cpa", "A fixed CPA"]]))}
	${s.targetMode === "cpa" ? row("Target CPA", `On ${CONVERSION_LABEL[r.primary]}s; the kill and scale lines multiply it`, numf("targetCpa", 1)) : row("Target: % under account CPA", `Target ${money(r.lines.target)}`, numf("targetPct", 1, 100))}
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
	<h4>Goals by stage</h4><p class="help">Each stage can be graded on its own conversion and its own target; kill and scale lines multiply that target. 0 keeps the account lines.</p>
	${["tof", "mof", "bof"].map((st) => { const cfg = s.stages[st], L = r.stageLines[st]; return row(`${STAGE_LABEL[st]}: graded on`, `Target ${money(L.target)} · kill ${money(L.kill)} · scale ${money(L.scale)}${L.basis === "secondary" ? ` per ${CONVERSION_LABEL[r.secondary]}` : ""}`, `<select data-stage-set="${st}.basis"><option value="" ${!cfg.basis ? "selected" : ""}>Auto (${st === "tof" && s.gradeTofBySecondary && r.secondary ? CONVERSION_LABEL[r.secondary] : "CPA"})</option><option value="primary" ${cfg.basis === "primary" ? "selected" : ""}>CPA on ${CONVERSION_LABEL[r.primary]}s</option>${r.secondary ? `<option value="secondary" ${cfg.basis === "secondary" ? "selected" : ""}>Cost per ${CONVERSION_LABEL[r.secondary]}</option>` : ""}</select>`) + row(`${STAGE_LABEL[st]}: target`, "0 = from the account lines", `<input type="number" step="1" min="0" data-stage-set="${st}.target" value="${cfg.target}">`); }).join("")}
	<h4>Campaign stages</h4><p class="help">Stages come from names: TOF for prospecting, cold, lookalike, broad, non-brand; MOF for retargeting, engaged, conquest; BOF for cart, checkout, brand, past buyers. Set a campaign here when the names mislead; one ad's stage can still be changed in the inspector.</p>
	<table class="camp-stages"><thead><tr><th>Campaign</th><th class="num">Ads</th><th>Tagged</th><th>Stage</th></tr></thead><tbody>${r.campaigns.map((c) => `<tr><td title="${esc(c.name)}">${esc(c.name)}</td><td class="num">${c.ads}</td><td>${STAGE_LABEL[c.autoStage] ?? c.autoStage}</td><td><select data-camp-stage="${esc(c.id)}"><option value="" ${!s.campaignStages[c.id] ? "selected" : ""}>Auto</option>${STAGES.map((st) => `<option value="${st}" ${s.campaignStages[c.id] === st ? "selected" : ""}>${STAGE_LABEL[st]}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table>
	<h4>Notes for the exports</h4><textarea data-set="notes" rows="4" placeholder="Context the readout should carry: offers, seasonality, what changed.">${esc(s.notes)}</textarea>`;
}

// --- Events ---
document.addEventListener("click", (e) => {
	const t = e.target.closest("[data-level],[data-crumb],[data-zoom],[data-multi],[data-multi-clear],[data-filter],[data-step],[data-id],[data-ask],[data-decide],[data-act],[data-sort],[data-view],#toggleLeft,#toggleRight,#settingsBtn,#exportBtn,#refreshBtn");
	if (!t) {
		if (!e.target.closest("#exportMenu")) $("#exportMenu").hidden = true;
		return;
	}
	if (t.dataset.zoom) return zoomTo(t.dataset.zoom);
	if (t.dataset.level) {
		S.level = t.dataset.level;
		S.step = null;
		S.selected = null;
		return render();
	}
	if (t.dataset.crumb) {
		const to = t.dataset.crumb;
		if (to === "campaign") Object.assign(S.filters, { campaign: [], adset: [], ad: [] });
		if (to === "adset") Object.assign(S.filters, { adset: [], ad: [] });
		if (to === "ad") Object.assign(S.filters, { ad: [] });
		S.level = to;
		S.step = null;
		S.selected = null;
		return render();
	}
	if (t.dataset.act === "drill") return drill(t.dataset.id);
	if (t.dataset.multi) {
		const k = t.dataset.multi, set = new Set(S.filters[k]);
		t.checked ? set.add(t.value) : set.delete(t.value);
		S.filters[k] = [...set];
		const inScope = (a) => (!S.filters.campaign.length || S.filters.campaign.includes(a.campaignId)) && (!S.filters.adset.length || S.filters.adset.includes(a.adsetId));
		if (k === "campaign") S.filters.adset = S.filters.adset.filter((id) => S.result.adsets.some((g) => g.id === id && (!set.size || set.has(g.campaignId))));
		if (k !== "ad") S.filters.ad = S.filters.ad.filter((id) => S.result.ads.some((a) => a.id === id && inScope(a)));
		S.step = null;
		return render();
	}
	if (t.dataset.multiClear) {
		S.filters[t.dataset.multiClear] = [];
		if (t.dataset.multiClear === "campaign") S.filters.adset = [];
		S.step = null;
		return render();
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
	if (t.dataset.act === "add-account" || t.dataset.act === "add-account-id") {
		const sel = $("#addAccount"), opt = t.dataset.act === "add-account" ? sel?.selectedOptions[0] : null;
		const typed = t.dataset.act === "add-account-id" ? ($("#addAccountId")?.value ?? "").trim().replace(/-/g, "") : "";
		if (!opt && !typed) return toast(S.pickable.platform === "meta" ? "Enter the account id, like act_123456789." : "Enter the 10-digit customer id.");
		(async () => {
			try {
				t.disabled = true;
				const { account } = await api("api/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: S.project, projectName: currentProject()?.name ?? "", platform: S.pickable.platform, externalId: opt ? opt.value : typed, name: opt ? opt.dataset.name : typed, currency: opt ? opt.dataset.currency : "" }) });
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
		S.filters.campaign = [a.campaignId];
		S.filters.adset = t.dataset.act === "focus-adset" ? [a.adsetId] : [];
		S.filters.ad = [];
		S.level = "ad";
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
			S.pickable = { platform: t.value, list: [], busy: false, error: err.message };
			renderRail();
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
		if (t.dataset.filter !== "hide") S.step = null;
		return render();
	}
	if (t.dataset.tag && S.selected) return setOverride(S.selected, { [t.dataset.tag]: t.type === "checkbox" ? t.checked : t.value });
	if (t.dataset.stageSet) {
		const [st, key] = t.dataset.stageSet.split(".");
		const cur = S.result.settings.stages;
		saveSettings({ stages: { ...cur, [st]: { ...cur[st], [key]: key === "target" ? Number(t.value) : t.value } } });
		return drawer();
	}
	if (t.dataset.campStage != null) {
		const campaignStages = { ...S.settings.campaignStages };
		if (t.value) campaignStages[t.dataset.campStage] = t.value;
		else delete campaignStages[t.dataset.campStage];
		saveSettings({ campaignStages });
		return drawer();
	}
	if (t.dataset.set) {
		let v = t.value;
		if (t.type === "number") v = Number(v) / Number(t.dataset.scale || 1);
		if (v === "true" || v === "false") v = v === "true";
		saveSettings({ [t.dataset.set]: v });
		return drawer();
	}
});
document.addEventListener("toggle", (e) => {
	if (e.target.matches?.("details[data-multi-box]")) S.openMulti[e.target.dataset.multiBox] = e.target.open;
}, true);
document.addEventListener("input", (e) => {
	if (e.target.dataset?.multiQ) {
		const q = (S.multiQ[e.target.dataset.multiQ] = e.target.value.trim().toLowerCase());
		for (const l of e.target.parentElement.querySelectorAll("label[data-text]")) l.hidden = !!q && !l.dataset.text.includes(q);
		return;
	}
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
	const a = S.result.ads.find((x) => x.id === g.dataset.id) ?? S.items.find((x) => x.id === g.dataset.id);
	if (!a) return (tip.hidden = true);
	const r = S.result;
	tip.innerHTML = `<b>${esc(a.name)}</b><div>${a.kind ? `${a.kind === "campaign" ? "Campaign" : level()[1]} · ${a.liveAds} live / ${a.ads} ads` : `${esc(a.campaignName)}${a.adsetName ? ` · ${esc(a.adsetName)}` : ""}`}</div><div class="m">${money(a.spend)} spent · ${fmtInt(a.conv)} ${CONVERSION_LABEL[r.primary]}s · CPA ${a.cpa == null ? "—" : money(a.cpa)}${r.secondary ? ` · ${fmtInt(a.sec)} ${CONVERSION_LABEL[r.secondary]}s` : ""}</div><div class="m">${FORMAT_LABEL[a.format]} · ${STAGE_LABEL[a.stage]} · ${a.live ? `live, ${money(a.spendLive)} in ${S.data.live.days}d` : "not live"}</div><div class="r">${ACTION_LABEL[a.action]}: ${esc(a.reason)}</div>`;
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
