// The team-facing launch plan (who does what, by when) as a presentable page and a tasks CSV, and the Linear sync
// payload: the project, one milestone per phase, and one issue per open checklist item assigned to its owner.
import { ASSETS, CTX_BLOCKS, PHASES, ROLE_INFO, TIERS, fmtDate, itemsFor, readiness, tLabel, daysBetween, tierOf, workload, VERDICT } from "./model.mjs";
import { esc } from "./report.mjs";

const phaseLabel = (id) => PHASES.find((p) => p.id === id)?.label ?? id;
// First sentence, without breaking on abbreviations like "e.g." or "i.e.".
const firstSentence = (s) => (s ?? "").replace(/\b(e\.g|i\.e|etc|vs)\./gi, "$1\u0000").split(/(?<=[.!?])\s+(?=[A-Z])/)[0].replace(/\u0000/g, ".");
function phaseWindows(l) {
	const items = itemsFor(l);
	return PHASES.map((p) => {
		const its = items.filter((i) => i.phase === p.id);
		if (!its.length) return null;
		const dues = its.map((i) => i.due).sort();
		return { ...p, from: dues[0], to: dues.at(-1), count: its.length, gates: its.filter((i) => i.gate) };
	}).filter(Boolean);
}

export function renderTeamPlan(l, { studioUrl = "" } = {}) {
	const w = workload(l);
	const tier = tierOf(l);
	const r = readiness(l);
	const m = l.message;
	const dri = w.people.find((p) => p.roles.includes("DRI"))?.name || l.dri || "Unassigned";
	const act = l.measure.stages.activated;
	const taskRows = (items) =>
		items
			.map((i) => {
				const done = ["done", "waived", "na"].includes(i.status);
				return `<tr class="${i.overdue ? "late" : ""}${done ? " done" : ""}"><td><input type="checkbox" data-check="${esc(i.id)}"${done ? " checked disabled" : ""} aria-label="Done"></td><td>${esc(i.text)}${i.gate ? ' <span class="tag">gate</span>' : ""}</td><td class="mono">${esc(i.role)}</td><td class="mono">${esc(phaseLabel(i.phase))}</td><td class="mono">${fmtDate(i.due)} <span class="muted">${tLabel(daysBetween(l.t0, i.due))}</span></td><td class="mono">${i.issue ? `<a href="${esc(i.issue.url)}">${esc(i.issue.identifier || "issue")}</a>` : ""}</td></tr>`;
			})
			.join("");
	const head = `<thead><tr><th></th><th>Task</th><th>Role</th><th>Phase</th><th>Due</th><th>Linear</th></tr></thead>`;
	return `<div class="plan">
<p class="eyebrow">Launch plan${tier ? ` · ${esc(TIERS[tier].label)}` : ""}</p>
<h1>${esc(l.name)}</h1>
${m.oneLiner || l.brief.description ? `<p class="lede">${esc(m.oneLiner || firstSentence(l.brief.description))}</p>` : ""}
<section class="stats"><div><span>Launch day</span><b>${fmtDate(l.t0)}</b></div><div><span>Launch DRI</span><b>${esc(dri)}</b></div><div><span>Team</span><b>${w.people.length} people</b></div><div><span>Tasks</span><b>${w.openTotal} open</b></div><div><span>Readiness</span><b class="v-${r.verdict}">${VERDICT[r.verdict]}</b></div></section>

<section><h2>What we're launching and why</h2>
${l.brief.description ? `<p class="pre">${esc(l.brief.description)}</p>` : ""}
<dl class="kv">
<dt>For</dt><dd>${esc(l.brief.persona) || "—"}</dd>
<dt>Job to be done</dt><dd>${esc(l.brief.job) || "—"}</dd>
<dt>Who gets it</dt><dd>${esc([l.brief.plans, l.brief.platforms, l.brief.regions].filter(Boolean).join(" · ")) || "—"}</dd>
<dt>Success metric</dt><dd>${esc(l.measure.primary) || "—"}${act.t30 ? ` · target ${esc(act.t30)} by T+30` : ""}</dd>
<dt>Activation</dt><dd>${esc(l.measure.activation) || "—"}</dd>
</dl></section>

<section><h2>Milestones</h2>
<table>${`<thead><tr><th>Phase</th><th>Dates</th><th>Tasks</th><th>Gates</th></tr></thead>`}<tbody>${phaseWindows(l).map((p) => `<tr><td><b>${esc(p.label)}</b> <span class="muted mono">${esc(p.window)}</span></td><td class="mono">${fmtDate(p.from)}${p.to !== p.from ? ` → ${fmtDate(p.to)}` : ""}</td><td class="mono">${p.count}</td><td class="small">${p.gates.map((g) => esc(g.text)).join("<br>") || "—"}</td></tr>`).join("")}</tbody></table>
</section>

<section><h2>Team and roles</h2>
<table><thead><tr><th>Role</th><th>Owner</th><th>Responsible for</th><th>Open tasks</th></tr></thead><tbody>${w.roles
		.map((x) => `<tr class="${x.person ? "" : "late"}"><td class="mono">${esc(x.role)}</td><td>${x.person ? `<b>${esc(x.person.name)}</b>${x.person.title ? ` <span class="muted small">${esc(x.person.title)}</span>` : ""}` : '<span class="warn">Unstaffed</span>'}</td><td class="small">${esc(ROLE_INFO[x.role] ?? "")}</td><td class="mono">${x.open}</td></tr>`)
		.join("")}</tbody></table>
</section>

<section><h2>Who does what</h2><p class="muted small">Ticks are kept in this browser only. The source of truth is ${l.sync.linear.projectUrl ? `the <a href="${esc(l.sync.linear.projectUrl)}">Linear project</a>` : "the launch studio"}.</p>
${w.people
		.filter((p) => p.items.length)
		.map((p) => `<div class="person"><h3>${esc(p.name)} <small>${esc(p.roles.join(" · "))}${p.title ? ` · ${esc(p.title)}` : ""} · ${p.open} open${p.overdue ? `, <span class="warn">${p.overdue} overdue</span>` : ""}${p.peakWeek ? ` · busiest week ${fmtDate(p.peakWeek.week)} (${p.peakWeek.count})` : ""}</small></h3><table class="tasks">${head}<tbody>${taskRows(p.items)}</tbody></table></div>`)
		.join("")}
${w.unassigned.length ? `<div class="person"><h3 class="warn">Unassigned <small>${w.unassigned.length} tasks; staff these roles</small></h3><table class="tasks">${head}<tbody>${taskRows(w.unassigned)}</tbody></table></div>` : ""}
</section>
${studioUrl ? `<p class="muted small">Edit in the studio: ${esc(studioUrl)}</p>` : ""}
</div>`;
}

export const TEAM_PLAN_CSS = `
.plan{max-width:1040px;margin:0 auto;padding:32px 20px 56px}
.plan h1{font-size:38px;line-height:1.05;letter-spacing:-.035em;margin:12px 0 8px}
.plan .lede{font-size:18px;color:var(--muted);margin:0 0 8px;max-width:60ch}
.plan h2{font-size:20px;letter-spacing:-.02em;margin:0 0 12px}
.plan h3{font-size:16px;margin:22px 0 8px;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.plan h3 small{font-family:var(--mono);font-weight:400;font-size:11.5px;color:var(--muted)}
.plan section{background:var(--card);border:1px solid var(--line);padding:20px;margin-top:16px;overflow-x:auto}
.plan table{width:100%;border-collapse:collapse;font-size:13px}
.plan td,.plan th{border-top:1px solid var(--line);padding:7px 8px;text-align:left;vertical-align:top}
.plan th{font-family:var(--mono);font-weight:400;font-size:11.5px;color:var(--muted)}
.plan tr.late td{background:color-mix(in srgb,var(--error) 7%,transparent)}
.plan tr.done td{color:var(--muted)}
.plan tr.done td:nth-child(2){text-decoration:line-through;text-decoration-color:var(--line-2)}
.plan .tasks td:first-child{width:28px}
.plan input[type=checkbox]{accent-color:var(--fg);width:16px;height:16px}
.plan .person{break-inside:avoid}
.tag{font-family:var(--mono);font-size:10.5px;padding:0 6px;border:1px solid var(--fg)}
.kv{display:grid;grid-template-columns:150px 1fr;gap:6px 14px;margin:12px 0 0;font-size:13.5px}
.kv dt{font-family:var(--mono);font-size:11.5px;color:var(--muted);padding-top:2px}.kv dd{margin:0}
.mono{font-family:var(--mono);font-size:12px;white-space:nowrap}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;background:var(--line)!important;padding:0!important}
.stats div{background:var(--card);padding:14px 16px;display:flex;flex-direction:column}
.stats span{font-family:var(--mono);font-size:11.5px;color:var(--muted)}.stats b{font-size:20px;letter-spacing:-.02em}
.v-go{color:var(--good)}.v-go-waivers{color:var(--warn)}.v-no-go{color:var(--error)}.warn{color:var(--warn)}
@media print{.plan section{break-inside:avoid-page}body{background:#fff}}
@media (max-width:640px){.kv{grid-template-columns:1fr}.plan h1{font-size:28px}}
`;
export const CHECK_SCRIPT = (id) => `
const key = "prc-plan-${id}";
let ticks = {};
try { ticks = JSON.parse(localStorage.getItem(key) || "{}"); } catch {}
for (const box of document.querySelectorAll("[data-check]:not([disabled])")) {
	box.checked = !!ticks[box.dataset.check];
	box.addEventListener("change", () => { ticks[box.dataset.check] = box.checked; try { localStorage.setItem(key, JSON.stringify(ticks)); } catch {} });
}`;

const csvCell = (v) => (/[",\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));
export function renderTasksCsv(l) {
	const rows = [["Owner", "Email", "Role", "Phase", "Task", "Due", "T-offset", "Status", "Gate", "Linear issue", "Task id", "Waits on"]];
	for (const i of itemsFor(l)) rows.push([i.person?.name ?? i.owner ?? "", i.person?.email ?? "", i.role, phaseLabel(i.phase), i.text, i.due, tLabel(daysBetween(l.t0, i.due)), i.status, i.gate ? "yes" : "", i.issue?.url ?? "", i.id, i.after.join(" ")]);
	return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

export function renderTeamPlanMarkdown(l) {
	const w = workload(l);
	const line = (i) => `- [${["done", "waived", "na"].includes(i.status) ? "x" : " "}] ${i.text} (${i.role}, ${i.due}, ${tLabel(daysBetween(l.t0, i.due))})${i.gate ? " **gate**" : ""}${i.issue ? ` [${i.issue.identifier}](${i.issue.url})` : ""}`;
	return `# Launch plan — ${l.name}

T-0 ${l.t0} · ${tierOf(l) ? `T${tierOf(l)}` : "tier unscored"} · DRI ${w.people.find((p) => p.roles.includes("DRI"))?.name || l.dri || "unassigned"}

${l.message.oneLiner || firstSentence(l.brief.description)}

## Team and roles
| Role | Owner | Open tasks |
|---|---|---|
${w.roles.map((x) => `| ${x.role} | ${x.person?.name ?? "**Unstaffed**"} | ${x.open} |`).join("\n")}

## Who does what
${w.people.filter((p) => p.items.length).map((p) => `### ${p.name} (${p.roles.join(", ")})\n${p.items.map(line).join("\n")}`).join("\n\n")}
${w.unassigned.length ? `\n### Unassigned\n${w.unassigned.map(line).join("\n")}` : ""}
`;
}

// --- Task context ---
// The overview every task carries, then the brief and message-house blocks chosen for the task (empty ones left out).
export const launchOverview = (l) => l.context.trim() || l.message.oneLiner || firstSentence(l.brief.description);
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const CTX_RENDER = {
	pillars: (l) => l.message.pillars.filter((p) => p.claim).map((p) => `- ${p.claim}${p.proof ? ` (proof: ${clip(p.proof, 300)})` : ""}`).join("\n"),
	audience: (l) => [l.message.forWho && `**For:** ${l.message.forWho}`, l.message.notFor && `**Not for:** ${l.message.notFor}`, l.message.before && `**Before:** ${l.message.before}`, l.message.after && `**After:** ${l.message.after}`].filter(Boolean).join("\n"),
	words: (l) => [l.message.useWords && `**Use:** ${l.message.useWords}`, l.message.avoidWords && `**Avoid:** ${l.message.avoidWords}`].filter(Boolean).join("\n"),
	ctas: (l) => [["prospect", "Prospects"], ["customer", "Eligible customers"], ["ineligible", "Ineligible plan"], ["churned", "Churned"]].filter(([k]) => l.message.ctas[k]).map(([k, label]) => `- ${label}: ${l.message.ctas[k]}`).join("\n"),
	objections: (l) => l.message.objections.filter((o) => o.q).slice(0, 6).map((o) => `- **${o.q}** ${clip(o.a, 300)}`).join("\n"),
	limits: (l) => clip(l.message.limits, 800),
	eligibility: (l) => [l.brief.plans && `**Plans:** ${l.brief.plans}`, l.brief.platforms && `**Platforms:** ${l.brief.platforms}`, l.brief.regions && `**Regions:** ${l.brief.regions}`, l.brief.pricing && `**Pricing:** ${clip(l.brief.pricing, 300)}`].filter(Boolean).join("\n"),
	quotes: (l) => clip(l.message.quotes, 800),
	metric: (l) => [l.measure.primary && `**Primary:** ${l.measure.primary}`, l.measure.activation && `**Activation:** ${l.measure.activation}`, l.measure.window && l.measure.primary ? `**Window:** ${l.measure.window}` : ""].filter(Boolean).join("\n"),
	video: (l) => [l.video.format && `**Format:** ${l.video.format}`, l.video.length && `**Length:** ${l.video.length}`, l.video.hook && `**Hook:** ${l.video.hook}`].filter(Boolean).join("\n"),
};
export function taskContext(l, i) {
	const draft = l.message.status !== "approved" && i.ctx.some((k) => !["eligibility", "metric", "video"].includes(k));
	const blocks = i.ctx.map((k) => [CTX_BLOCKS.find(([b]) => b === k)?.[1], CTX_RENDER[k]?.(l)]).filter(([label, body]) => label && body);
	return [
		launchOverview(l) ? `**What we're launching:** ${launchOverview(l)}` : "",
		i.context ? `**For this task:** ${i.context}` : "",
		...blocks.map(([label, body]) => `**${label}**\n${body}`),
		blocks.length && draft ? "_The message house isn't approved yet, so this may change._" : "",
	].filter(Boolean);
}

// --- Linear ---
// Issue titles stay short; a longer task text goes in full into the body, as do the names of what it waits on and blocks.
const TITLE_MAX = 120;
export const issueTitle = (i) => (i.text.length > TITLE_MAX ? `${i.text.slice(0, TITLE_MAX - 3)}…` : i.text);
// The issue body: the task, what it waits on and blocks, then its context.
export function issueDescription(l, i, { studioUrl = "", items = itemsFor(l) } = {}) {
	const byId = Object.fromEntries(items.map((x) => [x.id, x]));
	const assetFor = Object.fromEntries(ASSETS.filter((a) => a.item).map((a) => [a.item, a]));
	const name = (id) => {
		const x = byId[id];
		return x ? `${x.issue?.identifier ? `${x.issue.identifier} ` : ""}${x.text}${x.open ? "" : " (done)"}` : id;
	};
	const ctx = taskContext(l, i);
	return [
		`**Launch:** ${l.name} · T-0 ${fmtDate(l.t0)}${tierOf(l) ? ` · T${tierOf(l)}` : ""}`,
		`**Phase:** ${phaseLabel(i.phase)} · **Role:** ${i.role} · **Due:** ${fmtDate(i.due)} (${tLabel(daysBetween(l.t0, i.due))})`,
		i.text.length > TITLE_MAX ? `**Task:** ${i.text}` : "",
		i.gate ? "**Go/no-go gate.** The launch can't go ahead until this is done." : "",
		assetFor[i.id] ? `**Deliverable:** ${assetFor[i.id].label}. ${assetFor[i.id].spec}` : "",
		i.after.length ? `**Waits on:**\n${i.after.map((id) => `- ${name(id)}`).join("\n")}` : "",
		i.blocks.length ? `**Blocks:**\n${i.blocks.map((id) => `- ${name(id)}`).join("\n")}` : "",
		i.note ? `**Note:** ${i.note}` : "",
		ctx.length ? `---\n\n### Context\n\n${ctx.join("\n\n")}` : "",
		`---\n\n**Done:** close this issue. Closing it ticks the task off in the release checklist.${studioUrl ? ` [Open the launch](${studioUrl})` : ""}`,
	]
		.filter(Boolean)
		.join("\n\n");
}

// Everything Claude needs to create or update the Linear project through Composio, plus what's already linked.
export function linearPayload(l, { studioUrl = "" } = {}) {
	const items = itemsFor(l);
	const windows = phaseWindows(l);
	const sync = l.sync.linear;
	const w = workload(l);
	const lead = w.people.find((p) => p.roles.includes("DRI"));
	const describe = (i) => issueDescription(l, i, { studioUrl, items });
	const synced = items.filter((i) => i.open || sync.issues[i.id]);
	const inLinear = new Set(synced.map((i) => i.id));
	return {
		launchId: l.id,
		team: { id: sync.teamId, name: sync.teamName },
		project: {
			existingId: sync.projectId || null,
			name: `Launch: ${l.name}`,
			description: (l.message.oneLiner || firstSentence(l.brief.description) || `Product launch on ${l.t0}`).slice(0, 250),
			start_date: windows[0]?.from ?? l.t0,
			target_date: l.t0,
			lead_email: lead?.email || null,
		},
		milestones: windows.map((p, n) => ({ phase: p.id, name: `${n + 1}. ${p.label}`, target_date: p.to, existingId: sync.milestones[p.id] ?? null })),
		people: l.people.map((p) => ({ email: p.email, name: p.name, linearUserId: p.linearUserId || null })),
		issues: synced.map((i) => ({
				key: i.id,
				existing: sync.issues[i.id] ?? null,
				open: i.open,
				title: issueTitle(i),
				description: describe(i),
				due_date: i.due,
				priority: i.gate ? 2 : ["launch", "gonogo"].includes(i.phase) ? 2 : 3,
				milestone: i.phase,
				role: i.role,
				assignee_email: i.person?.email || null,
				assignee_name: i.person?.name || i.owner || null,
			})),
		// One Linear "blocks" relation per dependency where both tasks have an issue. `existing` is the relation id from an
		// earlier sync; `remove` lists relations the sync made for dependencies that no longer exist.
		relations: synced.flatMap((i) => i.after.filter((p) => inLinear.has(p)).map((p) => ({ key: `${p}>${i.id}`, blocker: p, blocked: i.id, existing: sync.relations[`${p}>${i.id}`] ?? null }))),
		remove: Object.entries(sync.relations)
			.filter(([k]) => !synced.some((i) => i.after.some((p) => `${p}>${i.id}` === k && inLinear.has(p))))
			.map(([key, id]) => ({ key, id })),
	};
}

// Merge what the sync produced back into the launch: ids, urls, assignees' Linear ids, and pulled issue states.
export function applyLinearResult(l, res) {
	const s = l.sync.linear;
	const now = new Date().toISOString();
	for (const k of ["teamId", "teamName", "projectId", "projectUrl"]) if (res[k]) s[k] = String(res[k]);
	Object.assign(s.milestones, res.milestones ?? {});
	for (const [key, v] of Object.entries(res.issues ?? {})) if (v?.id) s.issues[key] = { id: v.id, identifier: v.identifier ?? "", url: v.url ?? "", state: v.state ?? s.issues[key]?.state ?? "", syncedAt: now };
	for (const [key, id] of Object.entries(res.relations ?? {})) if (/^[^>]+>[^>]+$/.test(key)) id ? (s.relations[key] = String(id)) : delete s.relations[key];
	for (const [email, id] of Object.entries(res.people ?? {})) {
		const p = l.people.find((x) => x.email === String(email).toLowerCase());
		if (p && id) p.linearUserId = String(id);
	}
	const changed = [];
	for (const [key, v] of Object.entries(res.pulled ?? {})) {
		const link = s.issues[key];
		if (!link) continue;
		link.state = v.state ?? link.state;
		const st = (l.items[key] ??= { status: "todo", owner: "", due: "", evidence: "", note: "" });
		if (v.state === "completed" && st.status !== "done") {
			Object.assign(st, { status: "done", evidence: st.evidence || link.url });
			changed.push(`${key}: done`);
		} else if (v.state === "canceled" && !["na", "waived", "done"].includes(st.status)) {
			Object.assign(st, { status: "na", note: st.note || `Canceled in Linear (${link.identifier})` });
			changed.push(`${key}: n/a`);
		} else if (v.state === "started" && st.status === "todo") {
			st.status = "doing";
			changed.push(`${key}: in progress`);
		}
	}
	if (res.issues || res.projectId) s.syncedAt = now;
	if (res.pulled) s.pulledAt = now;
	return changed;
}
