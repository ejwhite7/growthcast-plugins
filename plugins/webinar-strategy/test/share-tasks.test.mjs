// node:test regressions for cadence select + legacy text, the split task checklist, dependencies, the explicit
// checklist upgrade and the self-contained share artifact (privacy, XSS, offline, stable output). NOT YET RUN.
import test from "node:test";
import assert from "node:assert/strict";
import {
	DEFAULT_TASKS, RECURRENCE_CADENCES, SUPERSEDED_TASKS, TASK_TEMPLATE_VERSION, applyTaskUpgrade, dependencyIssues, dependencyRefusal,
	newSession, normalizeSession, planTaskUpgrade, readiness, unmetDependencies,
} from "../studio/model.mjs";
import { SHARE_SCRIPT, markdownHandoff, sessionExport, shareArtifact } from "../studio/exports.mjs";

test("social live destinations each have role-owned eligibility, event, connection and test tasks", () => {
	const s = newSession();
	for (const id of ["x", "linkedin", "meta", "youtube"]) {
		const task = (step) => s.tasks.find((t) => t.id === `social-live-${id}-${step}`);
		assert.equal(task("plan").role, "Social media manager");
		assert.equal(task("event").role, "Social media manager");
		assert.equal(task("connect").role, "Producer");
		assert.ok(task("test").deps.includes(task("connect").id));
		assert.ok(task("test").deps.includes(task("event").id));
		assert.ok(s.tasks.find((t) => t.id === "go-live").deps.includes(task("test").id));
	}
	assert.deepEqual(dependencyIssues(s.tasks), []);
	const old = structuredClone(s);
	old.taskTemplate = 2;
	old.tasks = old.tasks.filter((t) => !t.id.startsWith("social-live-"));
	assert.equal(planTaskUpgrade(old).add.length, 16);
});

const NOW = Date.UTC(2026, 9, 23, 12, 0, 0);
const JOIN = "https://rooms.example.com/join/SECRET-JOIN-TOKEN";
const WAIT = "https://rooms.example.com/wait/SECRET-WAIT-TOKEN";
const REDIRECT = "https://example.com/thanks-private-REDIRECT";

function full() {
	const s = newSession("INTERNAL-ONLY-NAME", NOW);
	Object.assign(s.event, {
		publicTitle: "Public Title", slug: "public-title", aida: { attention: "att", interest: "int", decision: "dec", action: "act" }, shortDescription: "desc", outcomes: ["o1"],
		date: "2026-12-01", time: "14:00", timeZone: "America/New_York", hosts: ["Ana"], platform: "Web", joinUrl: JOIN, waitingUrl: WAIT, redirectUrl: REDIRECT,
		thankYou: "PRIVATE-THANKS", recurring: true, recurrence: "biweekly",
	});
	s.notes = "PRIVATE-NOTES";
	s.tasks[0].owner = "Dana Owner";
	s.tasks[0].evidence = "PRIVATE-EVIDENCE";
	return s;
}
// A template v1 session as stored by the previous release.
function legacy() {
	const s = newSession("Old", NOW);
	delete s.taskTemplate;
	s.event.recurring = true;
	s.event.recurrence = "first Thursday monthly, 14:00";
	delete s.event.recurrenceLegacy;
	s.tasks = [
		{ id: "brief", stage: "create", title: "Complete the event brief", hint: "Marketing lead", status: "done", owner: "Ana", due: "", evidence: "doc", custom: false },
		{ id: "promo-social", stage: "promote", title: "Schedule social posts and the founder-led post", hint: "Social", status: "doing", owner: "Bo", due: "", evidence: "", custom: false },
		{ id: "promo-email", stage: "promote", title: "Announce to the email list and lifecycle flows", hint: "Lifecycle", status: "todo", owner: "", due: "", evidence: "", custom: false },
		{ id: "t_custom01", stage: "execute", title: "Book the studio", hint: "", status: "todo", owner: "Cy", due: "", evidence: "", custom: true },
	];
	return s;
}

test("cadence is one of four supported values and round-trips", () => {
	assert.deepEqual(RECURRENCE_CADENCES.map(([k]) => k), ["", "weekly", "biweekly", "monthly", "quarterly"]);
	for (const [k] of RECURRENCE_CADENCES) {
		const s = newSession("c", NOW);
		s.event.recurrence = k;
		const r = normalizeSession(JSON.parse(JSON.stringify(s)), NOW);
		assert.equal(r.session.event.recurrence, k);
		assert.deepEqual(r.warnings, []);
	}
});

test("legacy free-text recurrence is preserved verbatim, not reinterpreted, and warned about", () => {
	const r = normalizeSession(legacy(), NOW);
	assert.equal(r.session.event.recurrence, "", "not guessed as monthly");
	assert.equal(r.session.event.recurrenceLegacy, "first Thursday monthly, 14:00");
	assert.match(r.warnings.join(" "), /supported cadence/);
	const again = normalizeSession(JSON.parse(JSON.stringify(r.session)), NOW);
	assert.equal(again.session.event.recurrenceLegacy, "first Thursday monthly, 14:00", "stable on reload");
	assert.ok(!readiness(r.session, NOW).checks.find((c) => c.id === "legacy-recurrence").ok);
	assert.ok(!readiness(r.session, NOW).checks.find((c) => c.id === "recurrence").ok);
	assert.ok(markdownHandoff(r.session, NOW).includes("first Thursday monthly"), "legacy text stays visible in the private handoff");
});

test("default tasks: one role each, split channels, valid acyclic dependencies, owners empty", () => {
	const s = newSession("x", NOW);
	assert.equal(s.taskTemplate, TASK_TEMPLATE_VERSION);
	for (const t of s.tasks) {
		assert.ok(t.role && !/[\/,&]| and /.test(t.role), `${t.id} has one role: ${t.role}`);
		assert.equal(t.owner, "");
		assert.ok(Array.isArray(t.deps));
	}
	assert.deepEqual(dependencyIssues(s.tasks), []);
	const ids = new Set(s.tasks.map((t) => t.id));
	for (const id of ["promo-social-posts", "promo-founder", "promo-email-list", "promo-lifecycle", "promo-paid", "promo-partner-copromo", "rec-edit", "rec-captions", "rec-thumbnail",
		"clips-cut", "quotes-stills", "fu-attendees", "fu-noshows", "post-founder", "post-partners", "post-social", "post-cs", "post-lifecycle", "post-help", "post-inapp"]) assert.ok(ids.has(id), id);
	for (const old of Object.keys(SUPERSEDED_TASKS)) assert.ok(!ids.has(old), `${old} is not in new plans`);
	assert.equal(new Set(DEFAULT_TASKS.map((t) => t.id)).size, DEFAULT_TASKS.length);
});

test("dependency validation refuses self, unknown and cycles; normalize removes self/unknown with a warning and keeps cycles", () => {
	const s = newSession("x", NOW);
	assert.match(dependencyRefusal(s.tasks, "brief", "brief"), /itself/);
	assert.match(dependencyRefusal(s.tasks, "brief", "nope-id"), /exist/);
	assert.match(dependencyRefusal(s.tasks, "brief", "readout"), /cycle/);
	assert.equal(dependencyRefusal(s.tasks, "readout", "brief"), "");
	const raw = JSON.parse(JSON.stringify(s));
	raw.tasks[0].deps = ["brief", "ghost-task", "aida"];
	const r = normalizeSession(raw, NOW);
	assert.deepEqual(r.session.tasks[0].deps, ["aida"], "cycle edge kept for the user to resolve");
	assert.match(r.warnings.join(" "), /ghost-task/);
	assert.match(r.warnings.join(" "), /cycle/);
	assert.ok(dependencyIssues(r.session.tasks).some((x) => x.kind === "cycle"));
	assert.ok(!readiness(r.session, NOW).checks.find((c) => c.id === "deps").ok);
});

test("unmet dependencies are reported until the prerequisite is done or N/A", () => {
	const s = newSession("x", NOW);
	const aida = s.tasks.find((t) => t.id === "aida");
	assert.deepEqual(unmetDependencies(s, aida).map((t) => t.id), ["brief"]);
	s.tasks.find((t) => t.id === "brief").status = "na";
	assert.deepEqual(unmetDependencies(s, aida), []);
});

test("legacy task lists are not migrated on load; the explicit upgrade preserves progress and custom tasks", () => {
	const loaded = normalizeSession(legacy(), NOW).session;
	assert.equal(loaded.taskTemplate, 1);
	assert.equal(loaded.tasks.length, 4, "nothing added or removed on load");
	const plan = planTaskUpgrade(loaded);
	assert.ok(plan.needed);
	assert.deepEqual(plan.remove, ["promo-email"], "only the untouched bundled task goes");
	assert.deepEqual(plan.keepSuperseded, ["promo-social"]);
	const { ok, session: up } = applyTaskUpgrade(loaded, plan);
	assert.ok(ok);
	assert.equal(loaded.tasks.length, 4, "input not mutated");
	assert.equal(up.taskTemplate, TASK_TEMPLATE_VERSION);
	const by = Object.fromEntries(up.tasks.map((t) => [t.id, t]));
	assert.equal(by.brief.status, "done");
	assert.equal(by.brief.owner, "Ana");
	assert.equal(by.brief.evidence, "doc");
	assert.equal(by.brief.role, "Marketing lead");
	assert.equal(by["promo-social"].status, "doing");
	assert.equal(by["promo-social"].owner, "Bo");
	assert.equal(by.t_custom01.owner, "Cy");
	assert.ok(by["promo-email-list"] && by["promo-lifecycle"] && !by["promo-email"]);
	assert.equal(up.tasks.length, DEFAULT_TASKS.length + 2, "catalogue + kept bundled + custom");
	assert.deepEqual(dependencyIssues(up.tasks), []);
	assert.deepEqual(planTaskUpgrade(up).add, []);
	assert.equal(normalizeSession(JSON.parse(JSON.stringify(up)), NOW).session.taskTemplate, TASK_TEMPLATE_VERSION);
});

test("JSON and Markdown exports carry roles, owners and dependencies", () => {
	const s = full();
	const json = sessionExport(s, NOW);
	assert.deepEqual(json.session.tasks.find((t) => t.id === "aida").deps, ["brief"]);
	assert.equal(json.session.tasks.find((t) => t.id === "aida").role, "Product marketer");
	const md = markdownHandoff(s, NOW);
	assert.match(md, /\| Task \| Status \| Role \| Named owner \| Depends on \| Blocked by \|/);
	assert.match(md, /Biweekly/);
});

test("share artifact: actual plan content, roles, owners, dependencies, status and labels", () => {
	const a = shareArtifact(full(), NOW);
	assert.ok(a.ok);
	for (const want of ["Public Title", "Planning snapshot", "may be sensitive", "Biweekly (every two weeks)", "America/New_York", "Product marketer", "Dana Owner", "Complete the event brief",
		"Blocked by", "To do", "att", "o1", "Print / Save PDF", "Download Markdown", 'id="viewSlides"', 'aria-roledescription="slide"', "attendee follow-up", "Founder"]) assert.ok(a.html.includes(want), want);
	assert.match(a.markdown, /Dana Owner/);
	assert.match(a.markdown, /Depends on/);
	assert.equal(a.filename, "public-title.plan.html");
	assert.equal(shareArtifact(full(), NOW, { view: "slides" }).filename, "public-title.slides.html");
	assert.match(shareArtifact(full(), NOW, { view: "slides" }).html, /data-view="slides"/);
});

test("share artifact omits private links, internal name, notes, thank-you and evidence", () => {
	const { html, markdown } = shareArtifact(full(), NOW);
	for (const secret of ["SECRET-JOIN", "SECRET-WAIT", "REDIRECT", "INTERNAL-ONLY-NAME", "PRIVATE-NOTES", "PRIVATE-THANKS", "PRIVATE-EVIDENCE"]) {
		assert.ok(!html.includes(secret), `html: ${secret}`);
		assert.ok(!markdown.includes(secret), `md: ${secret}`);
	}
});

test("share artifact fails closed when a private link sits in a task title, role, owner or public copy", () => {
	for (const mutate of [
		(s) => (s.tasks[3].title = `Check ${JOIN}`),
		(s) => (s.tasks[3].owner = "rooms.example.com/wait/SECRET-WAIT-TOKEN"),
		(s) => (s.tasks[3].role = REDIRECT),
		(s) => (s.event.aida.action = `Join: ${JOIN}`),
	]) {
		const s = full();
		mutate(s);
		const a = shareArtifact(s, NOW);
		assert.equal(a.ok, false);
		assert.equal(a.html, null);
		assert.equal(a.markdown, null);
		assert.ok(a.leaks.length > 0);
	}
});

test("share artifact escapes user strings, including script terminators, and has fixed script and no network", () => {
	const s = full();
	s.event.publicTitle = `</script><script>alert(1)</script><img src=x onerror=alert(2)>"'&`;
	s.tasks[1].title = "</SCRIPT ><svg onload=alert(3)>";
	s.tasks[1].owner = `"><iframe src="https://evil.example">`;
	const { html } = shareArtifact(s, NOW);
	assert.equal(html.match(/<script/gi).length, 1, "exactly one script element");
	assert.equal((html.match(/<\/script/gi) ?? []).length, 1);
	assert.ok(html.includes(`<script>${SHARE_SCRIPT}</script>`), "script is the fixed constant");
	assert.ok(html.includes("&lt;/script&gt;&lt;script&gt;alert(1)"));
	assert.ok(!/<(img|svg|iframe|link|object|embed|base)\b/i.test(html));
	assert.ok(!/\b(src|href)\s*=\s*["']?(https?:|\/\/)/i.test(html), "no network assets");
	assert.ok(!/fetch\(|XMLHttpRequest|localStorage|import\s*\(|\bimport\s+[{*\w]/.test(html));
	assert.match(html, /Content-Security-Policy" content="default-src 'none';[^"]*connect-src 'none'/);
	assert.ok(!/https?:\/\/(localhost|127\.0\.0\.1)/.test(html), "no invented localhost URL");
});

test("share artifact output is stable for the same input and time", () => {
	assert.equal(shareArtifact(full(), NOW).html, shareArtifact(full(), NOW).html);
	assert.equal(shareArtifact(full(), NOW).markdown, shareArtifact(full(), NOW).markdown);
});
