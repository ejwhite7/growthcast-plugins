// Exports: the launch as a self-contained HTML report (for a share link) and as a Markdown pack (brief, checklist,
// message house, tracking plan, readiness, assets) that drops into a client's `launches/` folder.
import { ASSET_STATUS, ITEM_STATUS, LAUNCH_STATUS, PHASES, RUBRIC, STAGES, TIERS, VERDICT, assetsFor, fmtDate, progress, readiness, tLabel, daysBetween, tierOf, tierScore } from "./model.mjs";

export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const label = (list, v) => list.find(([k]) => k === v)?.[1] ?? v;
const para = (s) => (s?.trim() ? `<p class="pre">${esc(s)}</p>` : `<p class="muted">—</p>`);
const link = (s) => (/^https?:\/\//.test(s ?? "") ? `<a href="${esc(s)}">${esc(s.replace(/^https?:\/\//, "").slice(0, 60))}</a>` : esc(s));

export function renderReport(l) {
	const p = progress(l);
	const r = readiness(l);
	const tier = tierOf(l);
	const { total } = tierScore(l);
	const m = l.message;
	const rows = (items) => items.map((i) => `<tr class="${i.overdue ? "late" : ""}"><td><span class="ck ck-${i.status}">${i.status === "done" ? "✓" : i.status === "waived" ? "W" : i.status === "na" ? "–" : ""}</span></td><td>${esc(i.text)}${i.gate ? ' <span class="st st-gate">gate</span>' : ""}${i.note ? `<div class="muted small pre">${esc(i.note)}</div>` : ""}</td><td class="mono">${esc(i.owner || i.role)}</td><td class="mono">${fmtDate(i.due)}</td><td class="small">${i.evidence ? link(i.evidence) : i.status === "done" ? '<span class="warn">no evidence</span>' : ""}</td></tr>`).join("");
	return `<div class="report">
<p class="eyebrow">Launch plan · ${esc(label(LAUNCH_STATUS, l.status))}</p>
<h1>${esc(l.name)}</h1>
<p class="meta">${tier ? esc(TIERS[tier].label) : "Tier not scored"} · T-0 ${fmtDate(l.t0)} · DRI ${esc(l.dri || "unassigned")}</p>
<section class="stats"><div><span>Tier</span><b>${tier ? `T${tier}` : "—"}</b></div><div><span>Launch</span><b>${tLabel(-daysBetween(new Date().toISOString().slice(0, 10), l.t0))}</b></div><div><span>Complete</span><b>${p.pct}%</b></div><div><span>Overdue</span><b>${p.overdue}</b></div><div><span>Readiness</span><b class="v-${r.verdict}">${VERDICT[r.verdict]}</b></div></section>

<section><h2>Brief</h2>
${para(l.brief.description)}
<dl class="kv"><dt>Persona</dt><dd>${esc(l.brief.persona) || "—"}</dd><dt>Job to be done</dt><dd>${esc(l.brief.job) || "—"}</dd><dt>Instead today</dt><dd>${esc(l.brief.alternative) || "—"}</dd><dt>Plans</dt><dd>${esc(l.brief.plans) || "—"}</dd><dt>Platforms</dt><dd>${esc(l.brief.platforms) || "—"}</dd><dt>Regions / languages</dt><dd>${esc(l.brief.regions) || "—"}</dd><dt>Pricing</dt><dd>${esc(l.brief.pricing) || "—"}${l.brief.pricingDecided ? "" : ' <span class="warn">(undecided)</span>'}</dd><dt>Rollout</dt><dd>${l.rollout.full === true ? "100% at T-0" : l.rollout.full === false ? '<span class="warn">Not 100% at T-0</span>' : "—"} ${esc(l.rollout.note)}</dd><dt>Business outcome</dt><dd>${esc(l.brief.outcome) || "—"}</dd></dl>
<h3>Customer evidence</h3>${para(l.brief.evidence)}
<h3>Risks</h3>${para(l.brief.risks)}
</section>

<section><h2>Tier <small>${total}/15${l.tier.override ? ` · overridden to T${l.tier.override}` : ""}</small></h2>
<table><tbody>${RUBRIC.map((f) => `<tr><td><b>${esc(f.label)}</b><div class="muted small">${esc(f.q)}</div></td><td class="mono">${l.tier.scores[f.id] ?? "—"}/3</td><td>${l.tier.scores[f.id] != null ? esc(f.levels[l.tier.scores[f.id]]) : ""}<div class="muted small">${esc(l.tier.reasons[f.id])}</div></td></tr>`).join("")}</tbody></table>
${l.tier.override ? `<p class="small"><b>Override reason:</b> ${esc(l.tier.overrideReason)}</p>` : ""}
</section>

<section><h2>Readiness <small class="v-${r.verdict}">${VERDICT[r.verdict]}</small></h2>
<ul class="gates">${r.gates.map((g) => `<li class="${g.ok ? "ok" : "bad"}">${g.ok ? "✓" : "✕"} ${esc(g.label)}</li>`).join("")}</ul>
${r.blockers.length ? `<p class="small">${r.blockers.length} open item${r.blockers.length > 1 ? "s" : ""} before launch.</p>` : ""}
${l.feedback.items.length ? `<h3>Red-team findings${l.feedback.at ? ` <small class="muted">${esc(l.feedback.at.slice(0, 10))}</small>` : ""}</h3>${l.feedback.summary ? para(l.feedback.summary) : ""}<table><thead><tr><th>Severity</th><th>Finding</th><th>Fix</th><th>Owner</th></tr></thead><tbody>${l.feedback.items.map((f) => `<tr class="${f.resolved ? "muted" : ""}"><td><span class="st sev-${f.severity}">${esc(f.severity)}</span></td><td>${esc(f.text)}</td><td>${esc(f.fix)}</td><td class="mono">${esc(f.owner)}</td></tr>`).join("")}</tbody></table>` : ""}
</section>

<section><h2>Message house <small>${m.status === "approved" ? `approved ${esc(m.approvedAt.slice(0, 10))}` : "draft"}</small></h2>
${m.oneLiner ? `<p class="oneliner">${esc(m.oneLiner)}</p>` : ""}
${m.elevator ? para(m.elevator) : ""}
<table><thead><tr><th>Pillar</th><th>Proof</th></tr></thead><tbody>${m.pillars.map((x) => `<tr><td>${esc(x.claim)}</td><td>${esc(x.proof) || '<span class="warn">needs proof</span>'}</td></tr>`).join("") || '<tr><td colspan="2" class="muted">No pillars yet</td></tr>'}</tbody></table>
<dl class="kv"><dt>For</dt><dd>${esc(m.forWho) || "—"}</dd><dt>Not for</dt><dd>${esc(m.notFor) || "—"}</dd><dt>Before</dt><dd>${esc(m.before) || "—"}</dd><dt>After</dt><dd>${esc(m.after) || "—"}</dd><dt>Limits</dt><dd>${esc(m.limits) || "—"}</dd><dt>CTA prospects</dt><dd>${esc(m.ctas.prospect) || "—"}</dd><dt>CTA customers</dt><dd>${esc(m.ctas.customer) || "—"}</dd><dt>CTA ineligible</dt><dd>${esc(m.ctas.ineligible) || "—"}</dd><dt>CTA churned</dt><dd>${esc(m.ctas.churned) || "—"}</dd></dl>
${m.objections.length ? `<h3>Objections</h3><table><tbody>${m.objections.map((o) => `<tr><td>${esc(o.q)}</td><td>${esc(o.a)}</td></tr>`).join("")}</tbody></table>` : ""}
</section>

<section><h2>Checklist <small>${p.done}/${p.total} done</small></h2>
${PHASES.map((ph) => {
	const its = p.items.filter((i) => i.phase === ph.id);
	return its.length ? `<h3>${esc(ph.label)} <small class="muted">${esc(ph.window)}</small></h3><table class="cl"><tbody>${rows(its)}</tbody></table>` : "";
}).join("")}
</section>

<section><h2>Assets</h2>
<table><thead><tr><th>Asset</th><th>Status</th><th>Owner</th><th>Link</th></tr></thead><tbody>${assetsFor(l).map((a) => `<tr><td>${esc(a.label)}</td><td><span class="st as-${a.status}">${esc(label(ASSET_STATUS, a.status))}</span></td><td class="mono">${esc(a.owner || a.role)}</td><td class="small">${link(a.link)}</td></tr>`).join("")}</tbody></table>
</section>

<section><h2>Measurement</h2>
<dl class="kv"><dt>Primary metric</dt><dd>${esc(l.measure.primary) || "—"}</dd><dt>Activation</dt><dd>${esc(l.measure.activation) || "—"} (window ${esc(l.measure.window)})</dd><dt>Holdout</dt><dd>${esc(l.measure.holdout) || "none"}</dd></dl>
<table><thead><tr><th>Stage</th><th>Baseline</th><th>T+7 target</th><th>T+30 target</th><th>T+7</th><th>T+30</th><th>T+90</th></tr></thead><tbody>${STAGES.map(([k, lab]) => { const s = l.measure.stages[k]; return `<tr><td>${esc(lab)}</td>${["baseline", "t7", "t30", "a7", "a30", "a90"].map((c) => `<td class="mono">${esc(s[c]) || "—"}</td>`).join("")}</tr>`; }).join("")}</tbody></table>
</section>
</div>`;
}

export const REPORT_CSS = `
.report{max-width:1000px;margin:0 auto;padding:32px 20px 56px}
.report h1{font-size:34px;line-height:1.1;letter-spacing:-.035em;margin:12px 0 6px}
.report h2{font-size:20px;letter-spacing:-.02em;margin:0 0 12px;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.report h2 small,.report h3 small{font-weight:400;font-size:12px;font-family:var(--mono)}
.report h3{font-size:15px;margin:18px 0 8px}
.report section{background:var(--card);border:1px solid var(--line);padding:20px;margin-top:16px;overflow-x:auto}
.report table{width:100%;border-collapse:collapse;font-size:13px}
.report td,.report th{border-top:1px solid var(--line);padding:7px 8px;text-align:left;vertical-align:top}
.report th{font-family:var(--mono);font-weight:400;font-size:11.5px;color:var(--muted)}
.report tr.late td{background:color-mix(in srgb,var(--error) 7%,transparent)}
.kv{display:grid;grid-template-columns:160px 1fr;gap:6px 14px;margin:12px 0;font-size:13px}
.kv dt{font-family:var(--mono);font-size:11.5px;color:var(--muted);padding-top:2px}.kv dd{margin:0}
.mono{font-family:var(--mono);font-size:12px}
.oneliner{font-size:22px;font-weight:700;letter-spacing:-.02em;margin:0 0 8px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:1px;background:var(--line)!important;padding:0!important}
.stats div{background:var(--card);padding:14px 16px;display:flex;flex-direction:column}
.stats span{font-family:var(--mono);font-size:11.5px;color:var(--muted)}.stats b{font-size:24px;letter-spacing:-.03em}
.ck{display:inline-grid;place-items:center;width:18px;height:18px;border:1px solid var(--line-2);font-size:11px;font-family:var(--mono)}
.ck-done{background:var(--good);border-color:var(--good);color:#fff}.ck-waived{border-color:var(--warn);color:var(--warn)}
.gates{list-style:none;padding:0;margin:0;display:grid;gap:4px}.gates .ok{color:var(--good)}.gates .bad{color:var(--error);font-weight:600}
.v-go{color:var(--good)}.v-go-waivers{color:var(--warn)}.v-no-go{color:var(--error)}
.warn{color:var(--warn)}
@media (max-width:640px){.kv{grid-template-columns:1fr}.report h1{font-size:26px}}
`;

// --- Markdown pack ---
const mdRow = (cells) => `| ${cells.map((c) => String(c ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`;
export function renderMarkdownPack(l) {
	const p = progress(l);
	const r = readiness(l);
	const tier = tierOf(l);
	const { total } = tierScore(l);
	const m = l.message;
	const files = {};
	files["brief.md"] = `# Launch Brief — ${l.name}

| | |
|---|---|
${mdRow(["Tier", tier ? `T${tier} (score ${total}/15${l.tier.override ? `, overridden: ${l.tier.overrideReason}` : ""})` : "not scored"])}
${mdRow(["Launch DRI", l.dri])}
${mdRow(["T-0", l.t0])}
${mdRow(["Rollout", `${l.rollout.full === true ? "100% at T-0" : l.rollout.full === false ? "NOT 100% at T-0" : "unconfirmed"} ${l.rollout.note}`])}
${mdRow(["Plans / platforms / regions", `${l.brief.plans} · ${l.brief.platforms} · ${l.brief.regions}`])}
${mdRow(["Pricing / packaging", `${l.brief.pricing}${l.brief.pricingDecided ? "" : " (undecided)"}`])}
${mdRow(["Status", label(LAUNCH_STATUS, l.status)])}

## What we're shipping
${l.brief.description}

## Who it's for and the job it does
- Persona: ${l.brief.persona}
- Job to be done: ${l.brief.job}
- What they use today instead: ${l.brief.alternative}

## Customer evidence
${l.brief.evidence}

## Business outcome
${l.brief.outcome}

## Tier scoring
${mdRow(["Factor", "Score", "Level", "Reason"])}
|---|---|---|---|
${RUBRIC.map((f) => mdRow([f.label, l.tier.scores[f.id] ?? "—", l.tier.scores[f.id] != null ? f.levels[l.tier.scores[f.id]] : "", l.tier.reasons[f.id]])).join("\n")}

## Risks and open questions
${l.brief.risks}

## Links
${l.brief.links}
`;
	files["checklist.md"] = `# Launch Checklist — ${l.name}

**Tier:** ${tier ? `T${tier}` : "unscored"} · **DRI:** ${l.dri} · **T-0:** ${l.t0} · **Progress:** ${p.done}/${p.total} (${p.pct}%) · **Readiness:** ${VERDICT[r.verdict]}

${PHASES.map((ph) => {
	const its = p.items.filter((i) => i.phase === ph.id);
	return its.length ? `## ${ph.label} (${ph.window})\n\n${its.map((i) => `- [${i.status === "done" ? "x" : " "}] ${i.text}${i.gate ? " **[gate]**" : ""}${i.status === "waived" ? " _(waived)_" : i.status === "na" ? " _(n/a)_" : ""}\n  Owner: ${i.owner || i.role} · Due: ${i.due} (${tLabel(daysBetween(l.t0, i.due))}) · Evidence: ${i.evidence || "___"}${i.note ? `\n  Note: ${i.note.replace(/\n/g, " ")}` : ""}`).join("\n")}\n`
		: "";
}).join("\n")}`;
	files["message-house.md"] = `# Message House — ${l.name}

Status: ${m.status === "approved" ? `Approved ${m.approvedAt.slice(0, 10)}` : "Draft"}

**Feature name:** ${m.featureName}
**One-liner:** ${m.oneLiner}
**Elevator:** ${m.elevator}
**Core promise:** ${m.promise}

${mdRow(["Pillar", "Proof", "Approved"])}
|---|---|---|
${m.pillars.map((x) => mdRow([x.claim, x.proof || "NEEDS PROOF", x.approved ? "yes" : ""])).join("\n")}

**For:** ${m.forWho}
**Not for:** ${m.notFor}
**Before:** ${m.before}
**After:** ${m.after}

## Objections
${m.objections.map((o) => `- **${o.q}** ${o.a}`).join("\n")}

**Use:** ${m.useWords}
**Avoid:** ${m.avoidWords}
**Known limitations:** ${m.limits}

## CTAs
- Prospect: ${m.ctas.prospect}
- Customer: ${m.ctas.customer}
- Ineligible plan: ${m.ctas.ineligible}
- Churned: ${m.ctas.churned}

## Approved quotes
${m.quotes}
`;
	const me = l.measure;
	files["tracking-plan.md"] = `# Tracking Plan — ${l.name}

- **Primary metric:** ${me.primary}
- **Activation:** ${me.activation} (window: ${me.window})
- **Eligible users:** ${me.eligibleCount}
- **Holdout:** ${me.holdout || "none"}
- **UTM:** \`${me.utm}\`

## Funnel
${mdRow(["Stage", "Definition", "Baseline", "T+7 target", "T+30 target", "T+7", "T+30", "T+90"])}
|---|---|---|---|---|---|---|---|
${STAGES.map(([k, lab, def]) => mdRow([lab, def, ...["baseline", "t7", "t30", "a7", "a30", "a90"].map((c) => me.stages[k][c])])).join("\n")}

## Events
${mdRow(["Event", "Trigger", "Properties", "Staging", "Prod"])}
|---|---|---|---|---|
${me.events.map((e) => mdRow([`\`${e.name}\``, e.trigger, e.props, e.staging ? "✓" : "", e.prod ? "✓" : ""])).join("\n")}

## Guardrails
${mdRow(["Metric", "Baseline", "Review threshold", "Actual"])}
|---|---|---|---|
${me.guardrails.map((g) => mdRow([g.metric, g.baseline, g.threshold, g.actual])).join("\n")}
${["7", "30", "90"].filter((k) => me.readouts[k].notes).map((k) => `\n## Readout T+${k}\nVerdict: ${me.readouts[k].verdict} · Recommendation: ${me.readouts[k].recommendation}\n\n${me.readouts[k].notes}\n`).join("")}`;
	files["readiness.md"] = `# Readiness — ${l.name}

**Verdict: ${VERDICT[r.verdict]}**

## Hard gates
${r.gates.map((g) => `- [${g.ok ? "x" : " "}] ${g.label}`).join("\n")}

## Open before launch (${r.blockers.length})
${r.blockers.map((i) => `- ${i.text} (${i.owner || i.role}, due ${i.due})`).join("\n")}

## Waived
${r.waived.map((i) => `- ${i.text}: ${i.note}`).join("\n")}

## Red-team findings ${l.feedback.at ? `(${l.feedback.at.slice(0, 10)})` : ""}
${l.feedback.summary}

${mdRow(["Severity", "Finding", "Fix", "Owner", "Resolved"])}
|---|---|---|---|---|
${l.feedback.items.map((f) => mdRow([f.severity, f.text, f.fix, f.owner, f.resolved ? "yes" : ""])).join("\n")}
`;
	if (Object.values(l.retro).some((v) => v.trim())) files["retro.md"] = `# Retro — ${l.name}\n\n## Outcome vs goal\n${l.retro.outcome}\n\n## What worked\n${l.retro.worked}\n\n## What didn't\n${l.retro.didnt}\n\n## Process gaps\n${l.retro.gaps}\n\n## Benchmarks\n${l.retro.benchmarks}\n`;
	for (const a of assetsFor(l)) if (a.body.trim()) files[`assets/${a.id}.md`] = `<!-- ${a.label} · status: ${label(ASSET_STATUS, a.status)} · owner: ${a.owner || a.role} -->\n\n${a.body}\n`;
	return files;
}
export { ITEM_STATUS };
