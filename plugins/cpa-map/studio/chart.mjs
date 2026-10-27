// The map itself: an SVG scatter of every ad (log lifetime spend across, CPA or cost per secondary up) with the four
// lines, drawn the same way in the studio, the HTML report and the slides. Pure: a string in, a string out.
import { CONVERSION_LABEL, esc, fmtMoney } from "./model.mjs";

const niceStep = (raw) => {
	const p = 10 ** Math.floor(Math.log10(raw || 1));
	const f = raw / p;
	return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
};
const shortMoney = (v, cur) => fmtMoney(v, cur, 0).replace(/,000,000$/, "M").replace(/,000$/, "K");

// options: { y: "cpa" | "cps", shown: (ad) => boolean, hideOthers, selected, width, height, compact (fewer labels),
//            liveDays, title (aria) }
export function renderChart(result, currency, options = {}) {
	const { y = "cpa", shown = () => true, hideOthers = false, selected = null, width: W = 900, height: H = 520, compact = false } = options;
	const s = result.settings;
	const L = y === "cps" ? result.linesSecondary : result.lines;
	const yOf = (a) => (y === "cps" ? a.cps : a.cpa);
	const yName = y === "cps" ? `cost per ${CONVERSION_LABEL[result.secondary]}` : "CPA";
	const m = { t: 44, r: compact ? 170 : 215, b: 44, l: 64 };
	const iw = W - m.l - m.r, ih = H - m.t - m.b;
	const pool = result.ads.filter((a) => !hideOthers || shown(a));
	const spends = pool.map((a) => a.spend);
	const xmin = Math.max(1, s.minSpend || 100), xmax = Math.max(...spends, xmin * 10) * 1.25;
	const lx0 = Math.log10(xmin), lx1 = Math.log10(xmax);
	const X = (v) => m.l + ((Math.log10(Math.max(v, xmin)) - lx0) / (lx1 - lx0)) * iw;
	const ymax = L.cap || Math.max(...pool.map((a) => yOf(a) ?? 0), 1);
	const Y = (v) => m.t + ih - (Math.min(v, ymax) / ymax) * ih;
	const ticksX = [];
	for (let p = Math.floor(lx0); p <= Math.ceil(lx1); p++) {
		const v = 10 ** p;
		if (v >= xmin && v <= xmax) ticksX.push(v);
	}
	const stepY = niceStep(ymax / 6);
	const ticksY = [];
	for (let v = 0; v <= ymax + 1e-9; v += stepY) ticksY.push(v);
	const rules = [
		["kill", `kill line · ${s.killMult}× target`, L.kill],
		["account", `account ${yName} ${fmtMoney(L.account, currency)}`, L.account],
		["target", `target ${fmtMoney(L.target, currency)} · ${Math.round(s.targetPct * 100)}% under`, L.target],
		["scale", `scale line · ${s.scaleMult}× target`, L.scale],
	].filter(([, , v]) => v > 0 && v <= ymax);
	const color = (a) => (a.action === "kill" ? "var(--error)" : a.action === "scale" || a.action === "revive" ? "var(--good)" : a.action === "test" ? "var(--muted)" : "var(--line-2)");
	const order = (a) => (shown(a) ? 1 : 0) + (a.id === selected ? 2 : 0);
	const dots = [...pool].sort((a, b) => order(a) - order(b)).map((a) => {
		const v = yOf(a), dim = !shown(a), off = v == null || v > ymax;
		const cx = X(a.spend).toFixed(1), cy = (off ? m.t - 16 : Y(v)).toFixed(1);
		const c = color(a), sel = a.id === selected;
		const mark = off
			? `<path class="mark" d="M${cx - 4.5} ${cy - 4.5}L${+cx + 4.5} ${+cy + 4.5}M${+cx + 4.5} ${cy - 4.5}L${cx - 4.5} ${+cy + 4.5}" stroke="${c}" stroke-width="${a.live ? 2.4 : 1.4}" fill="none"/>`
			: `<circle class="mark" cx="${cx}" cy="${cy}" r="5.5" fill="${a.live ? c : "var(--card)"}" stroke="${a.live ? "var(--card)" : c}" stroke-width="${a.live ? 1.5 : 1.8}"/>`;
		return `<g class="dot${dim ? " dim" : ""}${sel ? " sel" : ""}" data-id="${esc(a.id)}">${sel ? `<circle cx="${cx}" cy="${cy}" r="11" fill="none" stroke="${c}" stroke-width="2"/>` : ""}${mark}<circle class="hit" cx="${cx}" cy="${cy}" r="10" fill="transparent"/></g>`;
	}).join("");
	return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(options.title ?? `Every ad: lifetime spend against ${yName}`)}">
<g class="grid">${ticksY.map((v) => `<line x1="${m.l}" x2="${m.l + iw}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/>`).join("")}${ticksX.map((v) => `<line y1="${m.t}" y2="${m.t + ih}" x1="${X(v).toFixed(1)}" x2="${X(v).toFixed(1)}"/>`).join("")}</g>
<line x1="${m.l}" x2="${m.l + iw}" y1="${m.t - 4}" y2="${m.t - 4}" class="strip"/>
<text class="strip-label" x="${m.l}" y="${m.t - 24}">off the chart ↑ (no ${esc(CONVERSION_LABEL[y === "cps" ? result.secondary : result.primary])}s, or above ${esc(fmtMoney(ymax, currency, 0))})</text>
<g class="axis">${ticksX.map((v) => `<text x="${X(v).toFixed(1)}" y="${H - 14}" text-anchor="middle">${esc(shortMoney(v, currency))}</text>`).join("")}${ticksY.map((v) => `<text x="${m.l - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${esc(fmtMoney(v, currency, 0))}</text>`).join("")}</g>
<text class="axis-name" x="${m.l + iw / 2}" y="${H - 1}" text-anchor="middle">lifetime spend (log)</text>
${rules.map(([k, label, v]) => `<line class="rule ${k}" x1="${m.l}" x2="${m.l + iw}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="rule-label ${k}" x="${m.l + iw + 8}" y="${(Y(v) + 4).toFixed(1)}">${esc(label)}</text>`).join("")}
${dots}
</svg>`;
}

// The chart's own styles, for pages that don't load studio.css (report, slides). Colours come from tokens.css.
export const CHART_CSS = `
svg.chart { display: block; width: 100%; height: auto; font-family: var(--sans); }
svg.chart text { fill: var(--muted); font-size: 12px; }
svg.chart .grid line { stroke: var(--line); }
svg.chart .strip { stroke: var(--line-2); stroke-dasharray: 2 3; }
svg.chart .strip-label, svg.chart .axis-name { font-size: 11px; fill: var(--muted); font-family: var(--mono); }
svg.chart .rule { stroke-dasharray: 6 5; stroke-width: 1.5; }
svg.chart .rule.account { stroke: var(--muted); stroke-dasharray: 2 4; }
svg.chart .rule.target { stroke: var(--fg); }
svg.chart .rule.kill { stroke: var(--error); }
svg.chart .rule.scale { stroke: var(--good); }
svg.chart .rule-label { font-size: 12px; font-weight: 600; font-family: var(--mono); }
svg.chart .rule-label.kill { fill: var(--error); }
svg.chart .rule-label.scale { fill: var(--good); }
svg.chart .rule-label.target { fill: var(--fg); }
svg.chart .rule-label.account { fill: var(--muted); font-weight: 400; }
svg.chart .dot { cursor: pointer; }
svg.chart .dot.dim { opacity: .14; pointer-events: none; }
.legend { display: flex; gap: 16px; flex-wrap: wrap; padding: 6px 2px; color: var(--muted); font-size: 12px; font-family: var(--mono); }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.legend i { width: 11px; height: 11px; border-radius: 50%; display: inline-block; border: 2px solid var(--line-2); background: var(--line-2); }
.legend i.kill { border-color: var(--error); background: var(--error); }
.legend i.scale { border-color: var(--good); background: var(--good); }
.legend i.hollow { background: var(--card); }
.legend i.hollow.scale { border-color: var(--good); }
.legend i.x { border: 0; background: none; border-radius: 0; width: auto; height: auto; color: var(--error); font-style: normal; font-weight: 700; }
`;
export const LEGEND_HTML = `<div class="legend"><span><i class="kill"></i>Kill</span><span><i class="scale"></i>Scale</span><span><i class="hollow scale"></i>Revive (turn back on)</span><span><i></i>Hold / testing, live</span><span><i class="hollow"></i>Not live</span><span><i class="x">×</i>Off the chart</span></div>`;
