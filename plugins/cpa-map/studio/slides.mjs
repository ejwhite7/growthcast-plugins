// The slide deck: 16:9 pages in the GrowthCast deck style (cover, the map, the lines, kills, scales, revives, formats,
// stages, campaigns, next steps), printed one per PDF page. Same tokens as the planner's and checklist's decks.
import { CHART_CSS, renderChart } from "./chart.mjs";
import { ACTION_LABEL, CONVERSION_LABEL, FORMAT_LABEL, PLATFORMS, STAGE_LABEL, esc, fmtInt, fmtMoney, fmtPct } from "./model.mjs";
import { narrative } from "./narrative.mjs";

export const SLIDES_CSS = `
@page { size: 1280px 720px; margin: 0; }
html, body.slides { background: #d9d4c8; }
body.slides { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.slide { position: relative; width: 1280px; height: 720px; margin: 24px auto; background: var(--bg); color: var(--fg); overflow: hidden; display: flex; flex-direction: column; padding: 44px 56px 56px; page-break-after: always; break-after: page; box-shadow: 0 10px 40px rgba(0,0,0,.15); }
@media print { html, body.slides { background: none; } .slide { margin: 0; box-shadow: none; } }
.eyebrow { font-family: var(--mono); font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: var(--accent-text); margin-bottom: 6px; }
.dim { color: var(--muted); }
.sh { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; border-bottom: 1px solid var(--fg); padding-bottom: 14px; margin-bottom: 22px; }
.sh h2 { margin: 0; font-size: 34px; line-height: 1.1; letter-spacing: -.03em; font-weight: 700; max-width: 980px; }
.sh h2 small { font-family: var(--mono); font-size: 14px; font-weight: 400; color: var(--muted); letter-spacing: 0; margin-left: 8px; }
.sb { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.two .sb { flex-direction: row; gap: 40px; }
.two .col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
h3 { margin: 0 0 4px; font-family: var(--mono); font-weight: 400; font-size: 13px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.sf { position: absolute; left: 56px; right: 56px; bottom: 18px; display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); font-family: var(--mono); }
.sf .wordmark { font-family: var(--sans); font-size: 13px; color: var(--fg); }
.note { font-size: 16px; margin: 0 0 10px; max-width: 1100px; }
.cover { background: #242426; color: #f4f1e9; padding: 48px 64px; justify-content: space-between; }
.cover .cv-top { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; color: #c9c4b9; font-family: var(--mono); }
.cover .wordmark { font-family: var(--sans); font-size: 26px; color: #f4f1e9; }
.cover h1 { font-size: 64px; line-height: 1.02; letter-spacing: -.045em; margin: 0 0 18px; max-width: 1100px; font-weight: 700; }
.cover .eyebrow { color: #ff6b4a; font-size: 15px; }
.cover .cv-mid p { color: #c9c4b9; font-size: 16px; margin: 0; max-width: 1000px; }
.cover .cv-stats { display: grid; grid-template-columns: repeat(5, 1fr); border-top: 1px solid #4c4b4f; padding-top: 22px; }
.cover .cv-stats b { display: block; font-size: 34px; letter-spacing: -.03em; color: #fff; }
.cover .cv-stats span { font-family: var(--mono); font-size: 12px; color: #a8a399; }
.cover .sf { display: none; }
table.t { width: 100%; border-collapse: collapse; font-size: 14px; }
table.t th { text-align: left; font-weight: 400; font-family: var(--mono); font-size: 11px; color: var(--muted); padding: 6px 8px; border-bottom: 1px solid var(--fg); letter-spacing: .04em; text-transform: uppercase; }
table.t td { padding: 7px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
table.t td.num, table.t th.num { text-align: right; font-family: var(--mono); font-size: 13px; white-space: nowrap; }
table.t td.name { max-width: 460px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 18px; }
.kpis div { border: 1px solid var(--line-2); padding: 14px 16px; background: var(--card); }
.kpis b { display: block; font-size: 30px; letter-spacing: -.03em; }
.kpis span { font-family: var(--mono); font-size: 12px; color: var(--muted); }
.chart-box { background: var(--card); border: 1px solid var(--line); padding: 8px; flex: 1; min-height: 0; display: flex; }
.chart-box svg { height: 100%; width: auto; max-width: 100%; margin: 0 auto; }
.steps li { font-size: 17px; margin-bottom: 10px; }
.pill { font-size: 12px; }
`;

const n4 = (v) => `<td class="num">${esc(v)}</td>`;
const foot = (i, total, label) => `<div class="sf"><span class="wordmark">GrowthCast</span><span>${esc(label)}</span><span>${i} / ${total}</span></div>`;
const header = (eyebrow, title, small = "") => `<div class="sh"><div><div class="eyebrow">${esc(eyebrow)}</div><h2>${esc(title)}${small ? `<small>${esc(small)}</small>` : ""}</h2></div></div>`;

export function renderSlides(result, data, { tokens = "", fontsBase = "", print = false } = {}) {
	const n = narrative(result, data);
	const cur = data.account.currency, m = (v, d) => fmtMoney(v, cur, d);
	const P = CONVERSION_LABEL[result.primary], S = result.secondary ? CONVERSION_LABEL[result.secondary] : "";
	const platform = PLATFORMS[result.platform] ?? PLATFORMS.meta;
	const label = `${data.account.name} · CPA map · ${new Date().toISOString().slice(0, 10)}`;
	const L = result.lines;
	const adRows = (list, max = 11) => `<table class="t"><thead><tr><th>Ad</th><th>Campaign</th><th class="num">Spend</th><th class="num">${esc(P)}s</th><th class="num">CPA</th><th class="num">${data.live.days}d</th></tr></thead><tbody>${list.slice(0, max).map((a) => `<tr><td class="name">${esc(a.name)}</td><td class="name dim">${esc(a.campaignName)}</td>${n4(m(a.spend))}${n4(fmtInt(a.conv))}${n4(a.cpa == null ? "—" : m(a.cpa))}${n4(a.spendLive ? m(a.spendLive) : "—")}</tr>`).join("")}</tbody></table>${list.length > max ? `<p class="dim" style="margin:8px 0 0;font-size:12px">… and ${list.length - max} more in the action plan.</p>` : ""}`;
	const slides = [];
	slides.push(`<section class="slide cover"><div class="cv-top"><span class="wordmark">GrowthCast</span><span>CPA Map · ${esc(platform.label)}</span></div>
	<div class="cv-mid"><div class="eyebrow">${esc(data.account.name)} · ${esc(data.window.since ?? "")} → ${esc(data.window.until ?? "")}</div><h1>${esc(n.headline)}</h1><p>Every ad with ${esc(m(result.settings.minSpend))}+ lifetime spend on one map: log spend across, CPA up. Four lines decide what to kill, what to scale and what to turn back on.</p></div>
	<div class="cv-stats">${n.kpis.slice(0, 5).map((k) => `<div><b>${esc(k.value)}</b><span>${esc(k.label)} · ${esc(k.note)}</span></div>`).join("")}</div></section>`);
	slides.push(`<section class="slide">${header("Step 1", "Every ad on one map", `X = log lifetime spend · Y = CPA on ${P}s`)}<div class="sb"><div class="chart-box">${renderChart(result, cur, { shown: () => true, compact: true, width: 1100, height: 520 })}</div></div></section>`);
	slides.push(`<section class="slide two">${header("Step 2", "Four lines", `${result.basis === "live" ? `blended over the last ${data.live.days} days` : "lifetime"}`)}<div class="sb"><div class="col"><div class="kpis" style="grid-template-columns:1fr 1fr">${[["account CPA", L.account, "what the account does now"], ["target", L.target, `${Math.round(result.settings.targetPct * 100)}% under`], ["kill line", L.kill, `${result.settings.killMult}× target`], ["scale line", L.scale, `${result.settings.scaleMult}× target`]].map(([l, v, t]) => `<div><b>${esc(m(v))}</b><span>${esc(l)} · ${esc(t)}</span></div>`).join("")}</div><p class="note">${esc(n.audit.sections[1].paragraphs[1])}</p><p class="note dim">AOV ${esc(m(result.aov))} · test budget ${esc(m(result.testBudget))}${S ? ` · secondary: ${esc(S)}s at ${esc(m(result.linesSecondary.account))}` : ""}</p></div><div class="col"><h3>Live ads</h3><div class="chart-box">${renderChart(result, cur, { shown: (a) => a.live, hideOthers: true, compact: true, width: 620, height: 440 })}</div></div></div></section>`);
	slides.push(`<section class="slide">${header("Step 5 · not live", `Turn ${n.revives.length} paused winner${n.revives.length === 1 ? "" : "s"} back on`, `${result.settings.minRevivePurchases}+ ${P}s under the scale line, not one-offs`)}<div class="sb">${n.revives.length ? adRows(n.revives) : `<p class="note">No paused ad clears the bar.</p>`}</div>${foot(4, 0, label)}</section>`);
	slides.push(`<section class="slide">${header("Step 6 · live", `Kill ${n.kills.length}`, "above the kill line past the test budget, or half an AOV with nothing to show")}<div class="sb">${n.kills.length ? adRows(n.kills) : `<p class="note">Nothing to kill this week.</p>`}</div></section>`);
	slides.push(`<section class="slide">${header("Step 6 · live", `Scale ${n.scales.length}`, "under the scale line: +20% at a time, stop at target")}<div class="sb">${n.scales.length ? adRows(n.scales) : `<p class="note">No live ad is under the scale line yet.</p>`}</div></section>`);
	slides.push(`<section class="slide">${header("Step 7 · format", "Compare like with like", "the gap inside a format is wider than between formats")}<div class="sb"><table class="t"><thead><tr><th>Format</th><th class="num">Ads</th><th class="num">Live</th><th class="num">Spend</th><th class="num">${esc(P)}s</th><th class="num">CPA</th><th>Best</th><th>Worst</th><th class="num">Kill / scale / revive</th></tr></thead><tbody>${n.formats.map((f) => `<tr><td>${esc(FORMAT_LABEL[f.key] ?? f.key)}</td>${n4(fmtInt(f.ads))}${n4(fmtInt(f.live))}${n4(m(f.spend))}${n4(fmtInt(f.conv))}${n4(f.cpa == null ? "—" : m(f.cpa))}<td class="name">${f.best ? `${esc(m(f.best.cpa))} · ${esc(f.best.name)}` : "—"}</td><td class="name">${f.worst ? `${esc(m(f.worst.cpa))} · ${esc(f.worst.name)}` : "—"}</td>${n4(`${f.kills} / ${f.scales} / ${f.revives}`)}</tr>`).join("")}</tbody></table><p class="note dim" style="margin-top:14px">${esc(n.audit.sections[3].paragraphs[0])}</p></div></section>`);
	slides.push(`<section class="slide">${header("Step 8 · stage", "Grade each stage on its own metric", `TOF on cost per ${S || "secondary"} · BOF on CPA`)}<div class="sb"><table class="t"><thead><tr><th>Stage</th><th class="num">Ads</th><th class="num">Live</th><th class="num">Spend</th><th class="num">${esc(P)}s</th><th class="num">CPA</th>${S ? `<th class="num">${esc(S)}s</th><th class="num">Cost / ${esc(S)}</th>` : ""}</tr></thead><tbody>${n.stages.map((s) => { const l = result.ads.filter((a) => a.stage === s.key); const sec = l.reduce((t, a) => t + a.sec, 0); return `<tr><td>${esc(STAGE_LABEL[s.key])}</td>${n4(fmtInt(s.ads))}${n4(fmtInt(s.live))}${n4(m(s.spend))}${n4(fmtInt(s.conv))}${n4(s.cpa == null ? "—" : m(s.cpa))}${S ? n4(fmtInt(sec)) + n4(sec ? m(s.spend / sec) : "—") : ""}</tr>`; }).join("")}</tbody></table><p class="note dim" style="margin-top:14px">${esc(n.audit.sections[4].paragraphs[0])}</p></div></section>`);
	slides.push(`<section class="slide">${header("Campaigns", "Where the live spend sits")}<div class="sb"><table class="t"><thead><tr><th>Campaign</th><th>Status</th><th class="num">${data.live.days}d spend</th><th class="num">${data.live.days}d CPA</th><th class="num">Lifetime</th><th class="num">CPA</th><th class="num">Kill / scale / revive</th></tr></thead><tbody>${n.campaigns.filter((c) => c.spendLive > 0 || c.revives > 0).sort((a, b) => b.spendLive - a.spendLive).slice(0, 12).map((c) => `<tr><td class="name">${esc(c.name)}</td><td class="dim">${esc((c.status || "").toLowerCase())}</td>${n4(m(c.spendLive))}${n4(c.cpaLive == null ? "—" : m(c.cpaLive))}${n4(m(c.spend))}${n4(c.cpa == null ? "—" : m(c.cpa))}${n4(`${c.kills} / ${c.scales} / ${c.revives}`)}</tr>`).join("")}</tbody></table></div></section>`);
	slides.push(`<section class="slide">${header("This week", "Next steps")}<div class="sb"><ol class="steps">${n.plan.sections.map((s) => `<li><b>${esc(s.title.replace(/^\d\. /, ""))}.</b> ${esc(s.how)}</li>`).join("")}<li><b>Re-run the map in 7 days.</b> The lines move with the account; so do the calls.</li></ol><p class="note dim">${esc(n.plan.closing)}</p><p class="note dim" style="font-size:13px">${esc(n.audit.sections[n.audit.sections.length - 1].paragraphs[0])}</p></div></section>`);
	const total = slides.length;
	const body = slides.map((s, i) => s.replace(/<div class="sf">[\s\S]*?<\/div>/, "").replace("</section>", `${i ? foot(i + 1, total, label) : ""}</section>`)).join("\n");
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>${esc(data.account.name)} · CPA map slides</title>
<style>${tokens.replace(/url\("fonts\//g, `url("${fontsBase}fonts/`)}\n${CHART_CSS}\n${SLIDES_CSS}${print ? "\nhtml, body.slides { background: none; } .slide { margin: 0; box-shadow: none; }" : ""}</style></head>
<body class="slides">${body}</body></html>`;
}
