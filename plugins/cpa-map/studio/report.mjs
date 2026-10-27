// The HTML report: the readout, the map, the action plan and the tables, as one self-contained page in the GrowthCast
// brief style. Served by the local server and the hosted service, written to disk by `export`, and shown in the
// studio's Readout and Actions views (sections only).
import { CHART_CSS, LEGEND_HTML, renderChart } from "./chart.mjs";
import { ACTION_LABEL, CONVERSION_LABEL, FORMAT_LABEL, PLATFORMS, STAGE_LABEL, esc, fmtInt, fmtMoney } from "./model.mjs";
import { narrative } from "./narrative.mjs";

export const REPORT_CSS = `
.brief { max-width: 1080px; margin: 0 auto; padding: 32px 24px 48px; }
.brief h1 { font-size: 34px; line-height: 1.1; margin: 10px 0 6px; letter-spacing: -.035em; font-weight: 700; text-wrap: balance; }
.brief h2 { font-size: 20px; letter-spacing: -.02em; margin: 0 0 12px; }
.brief h3 { font-family: var(--mono); font-weight: 400; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin: 18px 0 8px; }
.brief section { background: var(--card); border: 1px solid var(--line); padding: 20px; margin-top: 16px; }
.brief p { margin: 0 0 10px; }
.eyebrow { font-family: var(--mono); font-size: 12px; letter-spacing: .06em; width: max-content; border: 1px solid var(--fg); border-radius: 20px; padding: 5px 10px; display: flex; gap: 8px; align-items: center; }
.meta { color: var(--muted); margin: 0; font-size: 13px; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1px; padding: 0 !important; overflow: hidden; background: var(--line) !important; }
.kpis div { background: var(--card); padding: 14px 16px; display: flex; flex-direction: column; }
.kpis b { font-size: 24px; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
.kpis span { font-family: var(--mono); font-size: 11px; color: var(--muted); }
table.t { width: 100%; border-collapse: collapse; font-size: 13px; }
table.t th { text-align: left; font-weight: 400; font-family: var(--mono); font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); padding: 6px 8px; border-bottom: 1px solid var(--fg); }
table.t td { padding: 7px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
table.t td.num, table.t th.num { text-align: right; font-family: var(--mono); font-size: 12px; white-space: nowrap; }
.plan-group { margin: 10px 0 14px; }
.plan-group h4 { margin: 0 0 6px; font-size: 14px; }
.plan-item { display: grid; grid-template-columns: 24px 1fr; gap: 10px; padding: 8px 0; border-top: 1px solid var(--line); font-size: 13px; }
.plan-item .box { width: 16px; height: 16px; border: 1px solid var(--fg); margin-top: 2px; }
.plan-item .what { font-family: var(--mono); font-size: 11px; color: var(--accent-text); letter-spacing: .04em; text-transform: uppercase; }
.plan-item .nums { font-family: var(--mono); font-size: 11.5px; color: var(--muted); }
.plan-item .why { color: var(--muted); }
.how { color: var(--muted); font-size: 13px; border-left: 3px solid var(--line-2); padding-left: 12px; margin: 0 0 10px; }
.chart-box { background: var(--card); border: 1px solid var(--line); padding: 10px; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 800px) { .two { grid-template-columns: 1fr; } }
@media print { .brief section { break-inside: avoid; } body { background: #fff; } }
`;

const table = (t) => `<table class="t"><thead><tr>${t.cols.map((c, i) => `<th class="${i > 0 && !/Call|Format|Stage|Campaign|Status|Best|Worst|Kill|Ad|Call/.test(c) ? "num" : ""}">${esc(c)}</th>`).join("")}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i > 0 && /^[\d$€£¥A-Z]{0,3}[\d,.\-—%]+$|^—$/.test(String(c)) ? "num" : ""}">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

// Sections only (no <html>): the studio embeds these in its Readout and Actions views.
export function readoutSections(result, data) {
	const n = narrative(result, data);
	return `
	<section class="kpis">${n.kpis.map((k) => `<div><b>${esc(k.value)}</b><span>${esc(k.label)} · ${esc(k.note)}</span></div>`).join("")}</section>
	${n.audit.sections.map((s) => `<section><h2>${esc(s.title)}</h2>${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}${s.table ? table(s.table) : ""}</section>`).join("")}`;
}
export function planSections(result, data) {
	const n = narrative(result, data);
	const cur = data.account.currency;
	return `
	<section><h2>${esc(n.plan.title)}</h2><p>${esc(n.plan.intro)}</p></section>
	${n.plan.sections.map((s) => `<section><h2>${esc(s.title)}</h2><p class="how">${esc(s.how)}</p>${s.groups.map((g) => `<div class="plan-group"><h4>${esc(g.campaign)}</h4>${g.items.map((i) => `<div class="plan-item"><span class="box"></span><div><span class="what">${esc(i.what)}</span> · <b>${esc(i.ad.name)}</b>${i.ad.adsetName ? ` <span class="muted">· ${esc(i.ad.adsetName)}</span>` : ""}<div class="nums">${esc(i.numbers)}</div><div class="why">${esc(i.why)}</div></div></div>`).join("")}</div>`).join("")}${s.more ? `<p class="muted">… and ${s.more} more in the CSV.</p>` : ""}</section>`).join("")}
	<section><p>${esc(n.plan.closing)}</p></section>`;
}

// The whole page. tokens: the contents of tokens.css (fonts become relative to the page, so callers pass a copy with
// absolute or inlined font URLs when the page is served elsewhere).
export function renderReport(result, data, { tokens = "", fontsBase = "" } = {}) {
	const n = narrative(result, data);
	const cur = data.account.currency;
	const platform = PLATFORMS[result.platform] ?? PLATFORMS.meta;
	const svg = renderChart(result, cur, { shown: () => true, compact: true, title: "Every ad on one map" });
	const liveSvg = renderChart(result, cur, { shown: (a) => a.live, hideOthers: true, compact: true, title: "Live ads" });
	const title = `${data.account.name} · CPA map`;
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>${tokens.replace(/url\("fonts\//g, `url("${fontsBase}fonts/`)}\n${CHART_CSS}\n${REPORT_CSS}</style></head>
<body class="export">
<header class="gc-bar"><span class="wordmark">GrowthCast</span><span class="product">CPA Map · ${esc(platform.label)} · ${esc(data.account.name)}</span></header>
<div class="brief">
	<div class="eyebrow">${esc(platform.label)} · ${esc(data.account.id)} · ${esc(cur)}</div>
	<h1>${esc(n.headline)}</h1>
	<p class="meta">Data ${esc(data.window.since ?? "")} → ${esc(data.window.until ?? "")} · live = spent in the last ${data.live.days} days · built ${esc(String(data.builtAt).slice(0, 10))} · CPA on ${esc(CONVERSION_LABEL[result.primary])}s${result.secondary ? `, secondary ${esc(CONVERSION_LABEL[result.secondary])}s` : ""}</p>
	${readoutSections(result, data).replace("</section>", `</section>
	<section><h2>The map</h2><p class="muted small">X = log of lifetime spend, Y = CPA. Filled = live, hollow = not live. Red = kill, green = scale or revive.</p><div class="chart-box">${svg}${LEGEND_HTML}</div>
	<h3>Live ads only</h3><div class="chart-box">${liveSvg}</div></section>`)}
	${planSections(result, data)}
	<section><h2>Every ad on the map</h2>${table({ cols: ["Call", "Ad", "Campaign", "Format", "Stage", "Live", "Spend", `${CONVERSION_LABEL[result.primary]}s`, "CPA"], rows: [...result.ads].sort((a, b) => a.action.localeCompare(b.action) || b.spend - a.spend).slice(0, 400).map((a) => [ACTION_LABEL[a.action], a.name, a.campaignName, FORMAT_LABEL[a.format] ?? a.format, STAGE_LABEL[a.stage], a.live ? "yes" : "no", fmtMoney(a.spend, cur), fmtInt(a.conv), a.cpa == null ? "—" : fmtMoney(a.cpa, cur)]) })}${result.ads.length > 400 ? `<p class="muted">Showing 400 of ${result.ads.length}; the CSV has every ad.</p>` : ""}</section>
</div>
<footer class="foot">CPA Map by <a href="https://growthcast.app">GrowthCast</a> · ${esc(platform.label)} attribution, not incremental lift · ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</footer>
</body></html>`;
}
