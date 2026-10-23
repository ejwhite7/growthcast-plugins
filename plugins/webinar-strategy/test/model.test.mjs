// node:test coverage for the pure model: validation, time zones, URLs, readiness/progress, filters, import. NOT YET RUN.
import test from "node:test";
import assert from "node:assert/strict";
import {
	DEFAULT_TASKS, filterSessions, mergeImported, newSession, normalizeSession, overdueTasks, parseImport, progress, readiness, reminderTimes,
	resolveSchedule, safeUrl, sessionStatus, slugify, validDate, validSlug, validTime, validTimeZone, validateSession, zonedToUtcMs, duplicateSession, LIMITS,
} from "../studio/model.mjs";
import { backupExport, sessionExport } from "../studio/exports.mjs";

const NOW = Date.UTC(2026, 9, 23, 12, 0, 0); // 2026-10-23T12:00:00Z

function ready(overrides = {}) {
	const s = newSession("Launch deep dive", NOW);
	Object.assign(s.event, {
		publicTitle: "Launch deep dive", slug: "launch-deep-dive", heroUrl: "https://cdn.example.com/hero.jpg", heroAlt: "Speakers on stage",
		aida: { attention: "a", interest: "b", decision: "c", action: "d" }, shortDescription: "Short.", outcomes: ["Learn X"],
		date: "2026-12-01", time: "14:00", timeZone: "America/New_York", hosts: ["Ana"], platform: "Browser based webinar", joinUrl: "https://rooms.example.com/abc",
		thankYou: "Thanks!", topics: ["seo"],
	}, overrides);
	return s;
}

test("date, time and slug validators", () => {
	assert.ok(validDate("2026-02-28")); assert.ok(!validDate("2026-02-30")); assert.ok(!validDate("2026-2-3")); assert.ok(!validDate(""));
	assert.ok(validTime("00:00")); assert.ok(validTime("23:59")); assert.ok(!validTime("24:00")); assert.ok(!validTime("9:00"));
	assert.ok(validSlug("my-webinar-1")); assert.ok(!validSlug("My Webinar")); assert.ok(!validSlug("a--b")); assert.ok(!validSlug("ab"));
	assert.equal(slugify("  Café: Q&A — Live! "), "cafe-q-a-live");
});

test("IANA time zone validation rejects abbreviations and junk", () => {
	for (const ok of ["UTC", "America/New_York", "Asia/Kolkata", "America/Argentina/Buenos_Aires"]) assert.ok(validTimeZone(ok), ok);
	for (const bad of ["", "EST", "New York", "America/Not_A_Zone", "../etc/passwd", "x".repeat(80), null, 5]) assert.ok(!validTimeZone(bad), String(bad));
});

test("zonedToUtcMs handles offsets, DST and nonexistent times", () => {
	assert.equal(new Date(zonedToUtcMs("2026-07-01", "12:00", "America/New_York")).toISOString(), "2026-07-01T16:00:00.000Z");
	assert.equal(new Date(zonedToUtcMs("2026-01-15", "12:00", "America/New_York")).toISOString(), "2026-01-15T17:00:00.000Z");
	assert.equal(new Date(zonedToUtcMs("2026-10-23", "09:00", "Asia/Kolkata")).toISOString(), "2026-10-23T03:30:00.000Z");
	assert.equal(new Date(zonedToUtcMs("2026-10-23", "09:00", "UTC")).toISOString(), "2026-10-23T09:00:00.000Z");
	assert.equal(zonedToUtcMs("2026-03-08", "02:30", "America/New_York"), null, "spring-forward gap does not exist");
	assert.notEqual(zonedToUtcMs("2026-11-01", "01:30", "America/New_York"), null, "ambiguous fall-back time resolves");
	assert.equal(zonedToUtcMs("2026-02-30", "10:00", "UTC"), null);
});

test("resolveSchedule distinguishes unscheduled from invalid", () => {
	assert.equal(resolveSchedule({}).state, "unscheduled");
	assert.equal(resolveSchedule({ date: "2026-12-01" }).state, "invalid");
	assert.equal(resolveSchedule({ date: "2026-12-01", time: "10:00", timeZone: "" }).state, "invalid");
	assert.equal(resolveSchedule({ date: "2026-12-01", time: "10:00", timeZone: "EST" }).state, "invalid");
	const ok = resolveSchedule({ date: "2026-12-01", time: "10:00", timeZone: "UTC" });
	assert.equal(ok.state, "ok");
	assert.equal(ok.startUtc, "2026-12-01T10:00:00.000Z");
});

test("upcoming vs past is judged on the UTC instant, not the machine zone", () => {
	// 2026-10-24 08:00 in Auckland (UTC+13) is 2026-10-23T19:00:00Z
	const s = ready({ date: "2026-10-24", time: "08:00", timeZone: "Pacific/Auckland" });
	assert.equal(sessionStatus(s, Date.UTC(2026, 9, 23, 18, 59, 59)).key, "upcoming");
	assert.equal(sessionStatus(s, Date.UTC(2026, 9, 23, 19, 0, 1)).key, "past");
	s.event.recordingUrl = "https://video.example.com/r";
	assert.equal(sessionStatus(s, NOW).key, "recorded");
});

test("safeUrl accepts https and loopback http only, without credentials or whitespace", () => {
	assert.equal(safeUrl("https://example.com/a?b=1"), "https://example.com/a?b=1");
	assert.equal(safeUrl("http://localhost:3000/x"), "http://localhost:3000/x");
	for (const bad of ["javascript:alert(1)", "data:text/html,hi", "http://example.com", "ftp://example.com", "https://user:pw@example.com", "https://exa mple.com", " ", "", "//example.com", "https://example.com/\nfoo", null, 7]) assert.equal(safeUrl(bad), null, String(bad));
	assert.equal(safeUrl(`https://example.com/${"a".repeat(LIMITS.url)}`), null);
});

test("new sessions carry planning defaults and survive a normalize round-trip unchanged", () => {
	const s = newSession("Round trip", NOW);
	assert.equal(s.rsvp.fields.name, "required");
	assert.equal(s.rsvp.fields.email, "required");
	assert.equal(s.event.visibility, "draft");
	assert.equal(s.tasks.length, DEFAULT_TASKS.length);
	const r = normalizeSession(JSON.parse(JSON.stringify(s)), NOW);
	assert.deepEqual(r.errors, []);
	assert.deepEqual(r.warnings, []);
	assert.deepEqual(r.session, s);
});

test("normalizeSession rejects bad ids and versions, keeps name/email mandatory, reports coercions", () => {
	assert.ok(normalizeSession(null).errors.length);
	assert.ok(normalizeSession({ id: "../x" }).errors.length);
	assert.ok(normalizeSession({ id: "ws_ok1", schemaVersion: 99 }).errors.length);
	const s = newSession("x", NOW);
	s.rsvp.fields.name = "off";
	s.rsvp.fields.email = "optional";
	s.rsvp.fields.smsConsent = "required";
	s.event.visibility = "everyone";
	s.tasks[0].due = "2026-13-45";
	s.tasks[0].status = "nope";
	const r = normalizeSession(s, NOW);
	assert.equal(r.session.rsvp.fields.name, "required");
	assert.equal(r.session.rsvp.fields.email, "required");
	assert.equal(r.session.rsvp.fields.smsConsent, "off");
	assert.equal(r.session.event.visibility, "draft");
	assert.equal(r.session.tasks[0].due, "");
	assert.equal(r.session.tasks[0].status, "todo");
	assert.ok(r.warnings.length >= 4);
});

test("normalizeSession drops unknown keys and trims oversize strings", () => {
	const s = newSession("x", NOW);
	s.event.shortDescription = "z".repeat(LIMITS.text + 500);
	s.evil = "<script>";
	const r = normalizeSession(s, NOW).session;
	assert.equal(r.event.shortDescription.length, LIMITS.text);
	assert.ok(!("evil" in r));
});

test("validateSession flags bad URLs, schedule and SMS-without-phone", () => {
	const s = ready({ joinUrl: "javascript:alert(1)", timeZone: "EST" });
	s.rsvp.fields.smsConsent = "optional";
	s.rsvp.fields.phone = "off";
	const paths = validateSession(s).map((e) => e.path);
	assert.ok(paths.includes("event.joinUrl"));
	assert.ok(paths.includes("event.timeZone"));
	assert.ok(paths.includes("rsvp.fields.smsConsent"));
	assert.deepEqual(validateSession(ready()), []);
});

test("readiness: empty session has blockers, complete one has none", () => {
	const empty = readiness(newSession("x", NOW), NOW);
	assert.ok(empty.blockers >= 5);
	const full = readiness(ready(), NOW);
	assert.equal(full.blockers, 0);
	assert.ok(full.checks.find((c) => c.id === "schedule").ok);
	const past = readiness(ready({ date: "2020-01-01" }), NOW);
	assert.ok(!past.checks.find((c) => c.id === "future").ok);
});

test("readiness warns when public copy contains a pasted link and when SMS wording is missing", () => {
	const s = ready({ shortDescription: "Join at https://rooms.example.com/abc" });
	assert.ok(!readiness(s, NOW).checks.find((c) => c.id === "public-links").ok);
	const t = ready();
	t.rsvp.fields.phone = "optional";
	t.rsvp.fields.smsConsent = "optional";
	assert.ok(!readiness(t, NOW).checks.find((c) => c.id === "rsvp-sms").ok);
	t.rsvp.smsConsentText = "Text me reminders";
	assert.ok(readiness(t, NOW).checks.find((c) => c.id === "rsvp-sms").ok);
});

test("progress counts done over non-N/A tasks and per stage", () => {
	const s = newSession("x", NOW);
	assert.equal(progress(s).total, DEFAULT_TASKS.length);
	assert.equal(progress(s).done, 0);
	s.tasks[0].status = "done";
	s.tasks[1].status = "done";
	s.tasks[2].status = "na";
	const p = progress(s);
	assert.equal(p.total, DEFAULT_TASKS.length - 1);
	assert.equal(p.done, 2);
	assert.equal(p.pct, Math.round((2 / p.total) * 100));
	assert.equal(p.byStage.length, 7);
});

test("overdue tasks compare calendar dates in UTC and ignore finished work", () => {
	const s = newSession("x", NOW);
	s.tasks[0].due = "2026-10-22";
	s.tasks[1].due = "2026-10-22";
	s.tasks[1].status = "done";
	s.tasks[2].due = "2026-10-23";
	assert.equal(overdueTasks(s, NOW).length, 1);
});

test("reminders are computed from the UTC start and flag past ones", () => {
	const s = ready({ date: "2026-10-24", time: "12:00", timeZone: "UTC" });
	const r = Object.fromEntries(reminderTimes(s, NOW).map((x) => [x.id, x]));
	assert.equal(r["r-1d"].atUtc, "2026-10-23T12:00:00.000Z");
	assert.equal(r["r-1d"].past, false);
	assert.equal(r["r-7d"].past, true);
	assert.equal(r.confirm.atUtc, null);
	assert.equal(r["f-noshow"].atUtc, "2026-10-25T12:00:00.000Z");
	const unscheduled = reminderTimes(newSession("x", NOW), NOW).find((x) => x.id === "r-1d");
	assert.equal(unscheduled.atUtc, null);
});

test("library filters: text, topic, host, upcoming/recorded; unscheduled is labelled", () => {
	const a = ready({ publicTitle: "SEO secrets", topics: ["SEO"], hosts: ["Ana"], date: "2026-12-01" });
	const b = ready({ publicTitle: "Founder interview", topics: ["founders"], hosts: ["Bo"], date: "2026-01-01", recordingUrl: "https://video.example.com/b" });
	const c = newSession("Unplanned idea", NOW);
	const list = [a, b, c];
	assert.equal(sessionStatus(c, NOW).label, "Unscheduled");
	assert.deepEqual(filterSessions(list, { q: "seo" }, NOW), [a]);
	assert.deepEqual(filterSessions(list, { q: "UNPLANNED" }, NOW), [c]);
	assert.deepEqual(filterSessions(list, { topic: "seo" }, NOW), [a]);
	assert.deepEqual(filterSessions(list, { host: "bo" }, NOW), [b]);
	assert.deepEqual(filterSessions(list, { view: "recorded" }, NOW), [b]);
	assert.deepEqual(filterSessions(list, { view: "upcoming" }, NOW), [a, c]);
	assert.equal(filterSessions(list, {}, NOW).length, 3);
	assert.equal(filterSessions(list, { q: "nothing matches" }, NOW).length, 0);
});

test("import rejects malformed, oversize, foreign, public and wrong-version files without partial results", () => {
	assert.equal(parseImport("{nope").ok, false);
	assert.equal(parseImport("[]").ok, false);
	assert.equal(parseImport(JSON.stringify({ app: "other" })).ok, false);
	assert.equal(parseImport(JSON.stringify({ app: "webinar-strategy", kind: "public-page", version: 1 })).ok, false);
	assert.equal(parseImport(JSON.stringify({ app: "webinar-strategy", kind: "backup", version: 2, sessions: [] })).ok, false);
	assert.equal(parseImport(JSON.stringify({ app: "webinar-strategy", kind: "backup", version: 1, sessions: [] })).ok, false);
	assert.equal(parseImport("x".repeat(LIMITS.importBytes + 1)).ok, false);
	const good = newSession("ok", NOW);
	const mixed = parseImport(JSON.stringify({ app: "webinar-strategy", kind: "backup", version: 1, sessions: [good, { id: "../bad" }] }), NOW);
	assert.equal(mixed.ok, false);
	assert.deepEqual(mixed.sessions, []);
});

test("import round-trips backup and single-session exports; merge never overwrites", () => {
	const a = ready();
	const viaBackup = parseImport(JSON.stringify(backupExport([a], NOW)), NOW);
	assert.ok(viaBackup.ok);
	assert.deepEqual(viaBackup.sessions[0], a);
	const viaSession = parseImport(JSON.stringify(sessionExport(a, NOW)), NOW);
	assert.ok(viaSession.ok);
	assert.equal(viaSession.sessions[0].id, a.id);
	const merged = mergeImported([a], viaBackup.sessions, NOW);
	assert.equal(merged.sessions.length, 2);
	assert.notEqual(merged.sessions[1].id, a.id);
	assert.match(merged.sessions[1].event.internalName, /\(imported\)$/);
	assert.equal(merged.renamed.length, 1);
	assert.equal(merged.sessions[0], a);
});

test("duplicateSession resets scheduling, recording and progress but keeps copy", () => {
	const a = ready({ recordingUrl: "https://video.example.com/a" });
	a.tasks[0].status = "done";
	const d = duplicateSession(a, NOW);
	assert.notEqual(d.id, a.id);
	assert.equal(d.event.recordingUrl, "");
	assert.equal(d.event.date, "");
	assert.equal(d.event.visibility, "draft");
	assert.equal(d.tasks[0].status, "todo");
	assert.equal(d.event.aida.attention, "a");
	assert.equal(a.tasks[0].status, "done", "original untouched");
});
