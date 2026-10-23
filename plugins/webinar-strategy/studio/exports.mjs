// Exports. Two clearly separated families:
//   PUBLIC  - publicPage(): an allowlisted projection safe for a public RSVP page (no join / waiting / internal / private fields).
//   PRIVATE - sessionExport(), markdownHandoff(), webhookSpec(): operator handoff. Contains join links and internal planning data.
// Nothing here sends, publishes or collects anything. Webhook payloads are synthetic examples only.
import { RSVP_FIELDS, STAGES, STORE_VERSION, TASK_STATUS, cadenceLabel, canonicalTimeZone, dependencyIssues, formatInZone, progress, readiness, reminderTimes, resolveSchedule, safeUrl, unmetDependencies, validSlug } from "./model.mjs";
import { CAPABILITIES } from "./content.mjs";

export const PRIVATE_BANNER = "PRIVATE operator handoff: contains join and waiting-room links and internal planning data. Do not publish or share publicly.";
export const PUBLIC_BANNER = "Public page export (draft). Contains only fields intended for a public RSVP page. Planning output only: nothing is published by this plugin.";
export const WEBHOOK_SPEC_VERSION = "webinar-registration.v1-draft";

const fieldLabel = (id) => RSVP_FIELDS.find((f) => f.id === id)?.label ?? id;
const occurrenceId = (s) => {
	const sc = resolveSchedule(s.event);
	return sc.state === "ok" ? `${s.event.slug || s.id}@${sc.startUtc}` : null;
};

// ---------- public ----------
export function publicPage(s) {
	const e = s.event;
	const sc = resolveSchedule(e);
	const smsOn = s.rsvp.fields.smsConsent !== "off";
	const data = {
		app: "webinar-strategy", kind: "public-page", version: STORE_VERSION, specVersion: "public-page.v1-draft", notice: PUBLIC_BANNER,
		page: {
			slug: e.slug, title: e.publicTitle, visibility: e.visibility, format: e.format, topics: e.topics,
			heroImage: { url: safeUrl(e.heroUrl), alt: e.heroAlt },
			copy: { aida: { ...e.aida }, shortDescription: e.shortDescription, outcomes: e.outcomes },
			logistics: {
				date: e.date, time: e.time, timeZone: canonicalTimeZone(e.timeZone), startUtc: sc.startUtc, durationMin: e.durationMin, hosts: e.hosts,
				platform: e.platform, venue: e.venue, recurring: e.recurring, recurrence: e.recurring ? e.recurrence : "",
			},
			recording: { url: safeUrl(e.recordingUrl) },
		},
		rsvpForm: {
			formVersion: s.rsvp.formVersion,
			fields: RSVP_FIELDS.filter((f) => s.rsvp.fields[f.id] !== "off").map((f) => ({ id: f.id, label: fieldLabel(f.id), mode: s.rsvp.fields[f.id] })),
			smsConsentText: smsOn ? s.rsvp.smsConsentText : "",
		},
	};
	return { data, leaks: findLeaks(data, s) };
}
// Text forms a private URL may take when pasted: the full URL, without scheme, without query, with or without
// "www." and a trailing slash. A bare host is never a variant (that would block ordinary links to a public site),
// so host-only forms are used only when they carry the URL's query (e.g. "zoom.us/?pwd=x").
export function privateUrlVariants(raw) {
	const s = String(raw ?? "").trim();
	if (!s) return [];
	let u = null;
	try {
		u = new URL(s);
	} catch {}
	if (!u || !u.hostname) return /[/.]/.test(s) ? [s.toLowerCase()] : [];
	const path = u.pathname.replace(/\/+$/, "");
	if (!path && !u.search) return []; // a bare site origin is not a private link
	const out = new Set([s, u.href]);
	const host = u.host.toLowerCase();
	for (const h of [host, host.startsWith("www.") ? host.slice(4) : `www.${host}`]) {
		if (path) out.add(`${h}${path}`);
		if (u.search) out.add(`${h}${path || "/"}${u.search}`).add(`${h}${path}${u.search}`);
	}
	return [...out].map((v) => v.toLowerCase());
}
// Private URLs must not appear anywhere in a public payload or the page preview, even pasted into free text.
export function findLeaks(data, s) {
	const text = JSON.stringify(data).toLowerCase();
	const leaks = [];
	for (const [k, label] of [["joinUrl", "join URL"], ["waitingUrl", "waiting-room URL"], ["redirectUrl", "redirect URL"]]) {
		if (privateUrlVariants(s.event[k]).some((v) => text.includes(v))) leaks.push(`Public copy contains the ${label}`);
	}
	return leaks;
}
export function publicJson(s) {
	const { data, leaks } = publicPage(s);
	if (leaks.length) throw new Error(leaks.join("; "));
	return JSON.stringify(data, null, 2);
}

// ---------- private ----------
export function sessionExport(s, nowMs = Date.now()) {
	const r = readiness(s, nowMs);
	return {
		app: "webinar-strategy", kind: "session", version: STORE_VERSION, sensitivity: PRIVATE_BANNER, exportedAt: new Date(nowMs).toISOString(), session: s,
		handoff: { occurrenceId: occurrenceId(s), progress: progress(s), readiness: { passed: r.passed, total: r.total, blockers: r.blockers }, webhookSpec: webhookSpec(s) },
	};
}
export function backupExport(sessions, nowMs = Date.now()) {
	return { app: "webinar-strategy", kind: "backup", version: STORE_VERSION, sensitivity: PRIVATE_BANNER, exportedAt: new Date(nowMs).toISOString(), sessions };
}

export const WEBHOOK_FIELDS = [
	["specVersion", "Contract version string. Bump on breaking change.", true],
	["synthetic", "true on every example in this plugin. Real deliveries must not set it.", true],
	["delivery.id", "Unique per delivery attempt group; stable across retries.", true],
	["delivery.attempt", "1-based attempt counter.", true],
	["registration.id", "Identifier assigned by the receiver of the RSVP form when it durably stores the registration.", true],
	["registration.idempotencyKey", "Stable per registration so retried deliveries and resubmissions can be de-duplicated (the original wording 'item potency' is interpreted as idempotency).", true],
	["registration.formVersion", "Version of the RSVP form the registrant saw. Separate from the hero image URL.", true],
	["registration.submittedAt", "UTC ISO-8601 timestamp.", true],
	["registrant.*", "Only fields enabled on the form. Name and email are always present.", true],
	["consent.emailReminders", "Records that the registrant asked for reminders by RSVPing. Legal basis is for your privacy review.", true],
	["consent.smsMarketing", "Separate, optional, never pre-checked. Includes the exact wording shown and a capture timestamp.", true],
	["occurrence.id", "Identifier for this occurrence of the event (slug + UTC start). Required for recurring events.", true],
	["occurrence.startUtc", "UTC start instant derived from date + time + IANA zone.", true],
	["event.*", "Snapshot at submission time: slug, titles, description, outcomes, logistics, hosts, platform, venue.", true],
	["event.links.join / waiting", "Private delivery links. Present only for trusted recipients that build confirmations and reminders.", true],
	["event.links.recording", "Hosted recording URL, once attached.", false],
	["event.page.heroImageUrl / heroAlt", "Landing-page imagery.", true],
	["event.visibility", "draft, unlisted or public. Unlisted is discoverability control, not authentication.", true],
];

export function webhookSpec(s) {
	const e = s.event;
	const sc = resolveSchedule(e);
	const f = s.rsvp.fields;
	const registrant = { name: "Example Person", email: "example@example.invalid" };
	if (f.phone !== "off") registrant.phone = "+1-555-0100";
	if (f.company !== "off") registrant.company = "Example Co";
	if (f.companySize !== "off") registrant.companySize = "11-50";
	if (f.jobTitle !== "off") registrant.jobTitle = "Example Title";
	const occ = occurrenceId(s);
	const example = {
		specVersion: WEBHOOK_SPEC_VERSION, synthetic: true,
		delivery: { id: "EXAMPLE-delivery-0001", attempt: 1 },
		registration: { id: "EXAMPLE-reg-0001", idempotencyKey: `EXAMPLE-idem:${occ ?? "unscheduled"}:example-person`, formVersion: s.rsvp.formVersion, submittedAt: "<UTC ISO-8601 timestamp>" },
		registrant,
		consent: {
			emailReminders: { granted: true, basis: "RSVP submission (confirm legal basis separately)" },
			smsMarketing: { fieldEnabled: f.smsConsent !== "off", granted: false, wording: f.smsConsent !== "off" ? s.rsvp.smsConsentText : "", capturedAt: null },
		},
		occurrence: { id: occ, startUtc: sc.startUtc, localDate: e.date, localTime: e.time, timeZone: canonicalTimeZone(e.timeZone), durationMin: e.durationMin, recurring: e.recurring, recurrence: e.recurring ? e.recurrence : "" },
		event: {
			slug: e.slug, internalName: e.internalName, title: e.publicTitle, shortDescription: e.shortDescription, outcomes: e.outcomes, aida: { ...e.aida },
			hosts: e.hosts, platform: e.platform, venue: e.venue, visibility: e.visibility, topics: e.topics,
			page: { heroImageUrl: safeUrl(e.heroUrl), heroAlt: e.heroAlt },
			links: { join: safeUrl(e.joinUrl), waiting: safeUrl(e.waitingUrl), recording: safeUrl(e.recordingUrl) },
			afterRsvp: { redirectUrl: safeUrl(e.redirectUrl), thankYou: e.thankYou },
		},
	};
	return {
		app: "webinar-strategy", kind: "webhook-spec", specVersion: WEBHOOK_SPEC_VERSION, sensitivity: PRIVATE_BANNER,
		status: "PROPOSED CONTRACT. EXAMPLE ONLY. This plugin never collects registrants or sends webhooks; every value below is a synthetic placeholder.",
		transport: { method: "POST", contentType: "application/json", headers: ["Idempotency-Key: <registration.idempotencyKey>", "Authentication and request signing: to be defined by the CMS implementer"] },
		fields: WEBHOOK_FIELDS.map(([path, description, required]) => ({ path, description, required })),
		example,
	};
}

// ---------- markdown ----------
const cell = (v) => String(v ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim() || " ";
const quote = (v) => String(v ?? "").split(/\r?\n/).map((l) => `> ${l}`).join("\n") || "> ";
const line = (k, v) => `- **${k}:** ${String(v ?? "").replace(/\r?\n/g, " ").trim() || "_not set_"}`;

export function markdownHandoff(s, nowMs = Date.now()) {
	const e = s.event;
	const sc = resolveSchedule(e);
	const pr = progress(s);
	const rd = readiness(s, nowMs);
	const out = [];
	out.push(`# ${e.publicTitle || e.internalName || s.id}: virtual event handoff`, "", `> **${PRIVATE_BANNER}**`, "",
		`Exported ${new Date(nowMs).toISOString()} by Virtual Event Strategy (planning only; nothing was published or sent).`, "");
	out.push("## Event", line("Internal name", e.internalName), line("Page slug", e.slug), line("Public title", e.publicTitle), line("Format", e.format), line("Topics", e.topics.join(", ")),
		line("Visibility (intended)", e.visibility), line("Planning state", s.planningState),
		line("Starts (UTC)", sc.startUtc ?? (sc.state === "invalid" ? `invalid: ${sc.error}` : "unscheduled")),
		line("Local", e.date ? `${e.date} ${e.time} ${e.timeZone}` : ""), line("In event zone", sc.ms != null ? formatInZone(sc.ms, e.timeZone) : ""), line("Duration (min)", e.durationMin),
		line("Hosts", e.hosts.join(", ")), line("Platform", e.platform), line("Venue", e.venue),
		line("Repeating", e.recurring ? `yes: ${cadenceLabel(e.recurrence) || "cadence not chosen"} (planning metadata; nothing is scheduled by this app)` : "no"),
		...(e.recurrenceLegacy ? [line("Legacy repeating text (choose a supported cadence)", e.recurrenceLegacy)] : []),
		line("Hero image", e.heroUrl), line("Hero alt text", e.heroAlt), line("Recording URL", e.recordingUrl), "");
	out.push("### Private links", line("Join", e.joinUrl), line("Waiting room", e.waitingUrl), line("Redirect after RSVP", e.redirectUrl), line("Thank-you message", e.thankYou), "");
	out.push("## Copy (AIDA)", "", "**Attention**", quote(e.aida.attention), "", "**Interest**", quote(e.aida.interest), "", "**Decision**", quote(e.aida.decision), "", "**Action**", quote(e.aida.action), "",
		"**Short description**", quote(e.shortDescription), "", "**Outcomes**", ...(e.outcomes.length ? e.outcomes.map((o) => `- ${o.replace(/\r?\n/g, " ")}`) : ["- _none yet_"]), "");
	out.push("## RSVP form", line("Form version", s.rsvp.formVersion), ...RSVP_FIELDS.map((f) => `- ${fieldLabel(f.id)}: ${s.rsvp.fields[f.id]}`), line("SMS consent wording", s.rsvp.smsConsentText), "");
	out.push("## Tier and capabilities", line("Tier", s.tier || "not chosen"), ...CAPABILITIES.map((c) => `- [${s.capabilities[c.id] ? "x" : " "}] ${c.label}`), "");
	out.push(`## Workflow (${pr.done}/${pr.total} done, ${pr.pct}%)`, "");
	for (const st of STAGES) {
		const tasks = s.tasks.filter((t) => t.stage === st.id);
		out.push(`### ${st.label}`, "", "| Task | Status | Role | Named owner | Depends on | Blocked by | Due | Evidence |", "| --- | --- | --- | --- | --- | --- | --- | --- |",
			...tasks.map((t) => `| ${cell(t.title)} | ${t.status} | ${cell(t.role || t.hint)} | ${cell(t.owner)} | ${cell(depTitles(s, t.deps))} | ${cell(depTitles(s, unmetDependencies(s, t).map((d) => d.id)))} | ${cell(t.due)} | ${cell(t.evidence)} |`), "");
	}
	const issues = dependencyIssues(s.tasks);
	if (issues.length) out.push("**Dependency problems:**", ...issues.map((x) => `- ${x.kind}: ${cell(x.taskId)} → ${cell(x.dep)}`), "");
	out.push("## Reminders and follow-ups", "", "| Message | Audience | Timing | Planned at (UTC) | Enabled |", "| --- | --- | --- | --- | --- |",
		...reminderTimes(s, nowMs).map((r) => `| ${cell(r.label)} | ${r.audience} | ${r.timing} | ${r.atUtc ?? " "} | ${r.enabled ? "yes" : "no"} |`), "");
	out.push("## Reuse", ...["before", "during", "after"].flatMap((p) => [`### ${p}`, ...s.reuse.filter((r) => r.phase === p).map((r) => `- [${r.done ? "x" : " "}] ${r.label.replace(/\r?\n/g, " ")}${r.note ? `: ${r.note.replace(/\r?\n/g, " ")}` : ""}`)]), "");
	out.push(`## Readiness (${rd.passed}/${rd.total} passed, ${rd.blockers} blockers)`, ...rd.checks.map((c) => `- [${c.ok ? "x" : " "}] ${c.text}${c.ok ? "" : ` (${c.severity})`}`), "");
	out.push("## Registration webhook", "", `A proposed, versioned contract (\`${WEBHOOK_SPEC_VERSION}\`) is in the JSON export under \`handoff.webhookSpec\`. It is an example only: this plugin collects no registrants and sends no webhooks.`, "");
	if (s.notes.trim()) out.push("## Notes", quote(s.notes), "");
	return out.join("\n");
}

// ---------- share artifact (self-contained HTML + Markdown) ----------
// A planning snapshot meant to be attached or sent as a file. No URL is created by this plugin: it is not hosted
// anywhere. It omits join / waiting / redirect links, the thank-you text, internal name, notes and task evidence, and
// fails closed if a private link appears anywhere in its text (task titles, roles and owners included).
export const SHARE_NOTICE = "Planning snapshot, not a live page. Generated as a file by Virtual Event Strategy; nothing was published, hosted or sent.";
export const SHARE_CAUTION = "Internal role and named-owner assignments may be sensitive. Check them before forwarding this file outside your team.";
const statusLabel = (v) => TASK_STATUS.find(([k]) => k === v)?.[1] ?? v;
const depTitles = (s, ids) => ids.map((id) => s.tasks.find((t) => t.id === id)?.title ?? id).join("; ");
export const leaksInText = (text, s) => findLeaks(String(text), s);

export function shareData(s, nowMs = Date.now()) {
	const e = s.event;
	const sc = resolveSchedule(e);
	const pr = progress(s);
	return {
		title: e.publicTitle || "Untitled virtual event plan", snapshotAt: new Date(nowMs).toISOString(), notice: SHARE_NOTICE, caution: SHARE_CAUTION,
		progress: { done: pr.done, total: pr.total, pct: pr.pct },
		logistics: [
			["When (event zone)", sc.state === "ok" ? formatInZone(sc.ms, e.timeZone) : sc.state === "unscheduled" ? "Not scheduled yet" : "Schedule needs fixing"],
			["Start (UTC)", sc.startUtc ?? "Not set"], ["Time zone", canonicalTimeZone(e.timeZone) || "Not set"], ["Duration", `${e.durationMin} min`],
			["Hosts", e.hosts.join(", ") || "Not set"], ["Platform", e.platform || "Not set"], ["Venue", e.venue || "None"], ["Format", e.format || "Not set"],
			["Repeats", e.recurring ? cadenceLabel(e.recurrence) || "Cadence not chosen yet" : "No"],
		],
		copy: [["Attention", e.aida.attention], ["Interest", e.aida.interest], ["Decision", e.aida.decision], ["Action", e.aida.action], ["Short description", e.shortDescription]],
		outcomes: e.outcomes,
		stages: STAGES.map((st) => ({
			label: st.label, deliverables: st.deliverables,
			tasks: s.tasks.filter((t) => t.stage === st.id).map((t) => ({
				title: t.title, status: statusLabel(t.status), role: t.role || t.hint || "Not set", owner: t.owner || "Unassigned", due: t.due || "",
				dependsOn: depTitles(s, t.deps), blockedBy: depTitles(s, unmetDependencies(s, t).map((d) => d.id)),
			})),
		})),
		dependencyProblems: dependencyIssues(s.tasks).length,
	};
}

const mdText = (v) => String(v ?? "").replace(/\r?\n/g, " ").replace(/([\\`*_[\]<>#|])/g, "\\$1").trim();
export function shareMarkdown(d) {
	const out = [`# ${mdText(d.title)}: virtual event plan`, "", `> ${d.notice}`, `> ${d.caution}`, "", `Snapshot: ${d.snapshotAt} · Workflow ${d.progress.done}/${d.progress.total} done (${d.progress.pct}%)`, ""];
	out.push("## Logistics", ...d.logistics.map(([k, v]) => `- **${k}:** ${mdText(v)}`), "");
	out.push("## Copy", ...d.copy.flatMap(([k, v]) => [`**${k}**`, "", mdText(v) || "_not written_", ""]), "**Outcomes**", ...(d.outcomes.length ? d.outcomes.map((o) => `- ${mdText(o)}`) : ["- _none yet_"]), "");
	out.push("## Plan and checklist");
	for (const st of d.stages) {
		out.push("", `### ${st.label}`, "", "| Task | Status | Role | Named owner | Depends on | Blocked by | Due |", "| --- | --- | --- | --- | --- | --- | --- |",
			...st.tasks.map((t) => `| ${[t.title, t.status, t.role, t.owner, t.dependsOn, t.blockedBy, t.due].map((v) => mdText(v) || " ").join(" | ")} |`));
	}
	if (d.dependencyProblems) out.push("", `> ${d.dependencyProblems} dependency problem(s) need review in the studio.`);
	return `${out.join("\n")}\n`;
}

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const SHARE_CSS = `*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1d1b16;background:#faf8f3}
.skip{position:absolute;left:-999px}.skip:focus{left:8px;top:8px;background:#fff;padding:6px;z-index:3}
.toolbar{position:sticky;top:0;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 16px;background:#fff;border-bottom:1px solid #ddd6c8;z-index:2}
button{font:inherit;padding:6px 12px;border:1px solid #8a8170;border-radius:6px;background:#fff;cursor:pointer}button[aria-pressed=true]{background:#1d1b16;color:#fff}button:disabled{opacity:.45;cursor:default}
button:focus-visible,.slide:focus-visible{outline:3px solid #2f6fdb;outline-offset:2px}main{max-width:1040px;margin:0 auto;padding:16px}
.slide{background:#fff;border:1px solid #ddd6c8;border-radius:10px;padding:20px 24px;margin:0 0 16px}.notice{background:#fff6dc;border:1px solid #e8cf7a;padding:8px 12px;border-radius:6px}
[data-view=slides] .slide{min-height:calc(100vh - 110px)}table{border-collapse:collapse;width:100%;font-size:13.5px}th,td{text-align:left;border-bottom:1px solid #e7e1d4;padding:6px;vertical-align:top}
.blocked{color:#a3261b;font-weight:600}dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px}dt{font-weight:600}
@media print{.toolbar,.skip{display:none}.slide,.slide[hidden]{display:block!important;break-after:page;border:0;min-height:0}body{background:#fff}}`;
// Fixed behaviour. No user data is ever interpolated here; Markdown is read from the escaped #md-src element.
export const SHARE_SCRIPT = `(function(){var b=document.body,s=[].slice.call(document.querySelectorAll(".slide")),i=0,$=function(x){return document.getElementById(x)};
function show(f){var sl=b.getAttribute("data-view")==="slides";s.forEach(function(x,k){x.hidden=sl&&k!==i});$("viewDoc").setAttribute("aria-pressed",String(!sl));$("viewSlides").setAttribute("aria-pressed",String(sl));
$("prev").disabled=!sl||i===0;$("next").disabled=!sl||i===s.length-1;$("slideStatus").textContent=sl?"Slide "+(i+1)+" of "+s.length:"Document view";if(f&&sl&&s[i])s[i].focus()}
function go(d){i=Math.max(0,Math.min(s.length-1,i+d));show(true)}
$("viewDoc").addEventListener("click",function(){b.setAttribute("data-view","doc");show(false)});$("viewSlides").addEventListener("click",function(){b.setAttribute("data-view","slides");show(true)});
$("prev").addEventListener("click",function(){go(-1)});$("next").addEventListener("click",function(){go(1)});$("print").addEventListener("click",function(){window.print()});
document.addEventListener("keydown",function(e){if(b.getAttribute("data-view")!=="slides"||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))return;if(e.key==="ArrowRight"||e.key==="PageDown"){go(1);e.preventDefault()}if(e.key==="ArrowLeft"||e.key==="PageUp"){go(-1);e.preventDefault()}});
$("dlMd").addEventListener("click",function(){var u=URL.createObjectURL(new Blob([$("md-src").textContent],{type:"text/markdown"})),a=document.createElement("a");a.href=u;a.download=b.getAttribute("data-md-name")||"webinar-plan.md";document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u)},1500)});
show(false)})();`;
const SHARE_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'";

// { ok, html, markdown, leaks, filename }. html/markdown are null when a private link would leak (fail closed).
export function shareArtifact(s, nowMs = Date.now(), { view = "doc" } = {}) {
	const d = shareData(s, nowMs);
	const markdown = shareMarkdown(d);
	const leaks = [...new Set([...findLeaks(d, s), ...leaksInText(markdown, s)])];
	const base = safeFilename(s, "");
	if (leaks.length) return { ok: false, html: null, markdown: null, leaks, filename: `${base}.plan.html` };
	const slide = (label, ...body) => `<section class="slide" tabindex="-1" role="region" aria-roledescription="slide" aria-label="${esc(label)}">${body.join("")}</section>`;
	const row = (cells, tag = "td") => `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
	const slides = [
		slide("Overview", `<h1>${esc(d.title)}</h1><p class="notice" role="note"><strong>${esc(d.notice)}</strong></p><p class="notice" role="note">${esc(d.caution)}</p>`,
			`<p>Snapshot taken ${esc(d.snapshotAt)}. Workflow ${d.progress.done} of ${d.progress.total} tasks done (${d.progress.pct}%).</p>`,
			d.dependencyProblems ? `<p class="blocked">${d.dependencyProblems} dependency problem(s) need review in the studio.</p>` : ""),
		slide("Logistics", `<h2>Logistics</h2><dl>${d.logistics.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`),
		slide("Copy", `<h2>Copy</h2>${d.copy.map(([k, v]) => `<h3>${esc(k)}</h3><p>${esc(v) || "<em>Not written yet</em>"}</p>`).join("")}<h3>Outcomes</h3><ul>${d.outcomes.map((o) => `<li>${esc(o)}</li>`).join("") || "<li><em>None yet</em></li>"}</ul>`),
		...d.stages.map((st) => slide(`Stage: ${st.label}`, `<h2>${esc(st.label)}</h2><p>Deliverables: ${esc(st.deliverables.join(" · "))}</p>`,
			`<table><caption class="skip">${esc(st.label)} tasks</caption><thead>${row(["Task", "Status", "Role", "Named owner", "Depends on", "Blocked by", "Due"].map(esc), "th")}</thead><tbody>`,
			st.tasks.map((t) => row([esc(t.title), esc(t.status), esc(t.role), esc(t.owner), esc(t.dependsOn) || "None", t.blockedBy ? `<span class="blocked">${esc(t.blockedBy)}</span>` : "None", esc(t.due) || "—"])).join(""), "</tbody></table>")),
	];
	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${SHARE_CSP}">
<meta name="referrer" content="no-referrer">
<title>${esc(d.title)}: virtual event plan</title>
<style>${SHARE_CSS}</style>
</head>
<body data-view="${view === "slides" ? "slides" : "doc"}" data-md-name="${esc(`${base}.plan.md`)}">
<a class="skip" href="#main">Skip to content</a>
<div class="toolbar" role="toolbar" aria-label="Plan view and export">
<button type="button" id="viewDoc" aria-pressed="true">Document</button><button type="button" id="viewSlides" aria-pressed="false">Slides</button>
<button type="button" id="prev">Previous slide</button><button type="button" id="next">Next slide</button><span id="slideStatus" role="status" aria-live="polite"></span>
<button type="button" id="print">Print / Save PDF</button><button type="button" id="dlMd">Download Markdown</button>
</div>
<main id="main">
${slides.join("\n")}
</main>
<pre id="md-src" hidden>${esc(markdown)}</pre>
<script>${SHARE_SCRIPT}</script>
</body>
</html>
`;
	return { ok: true, html, markdown, leaks: [], filename: `${base}${view === "slides" ? ".slides" : ".plan"}.html` };
}

export const safeFilename = (s, ext) => `${(validSlug(s.event.slug) ? s.event.slug : s.id).replace(/[^a-z0-9_-]/gi, "-")}${ext}`;
