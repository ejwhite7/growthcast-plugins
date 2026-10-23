// node:test coverage for the public/private export boundary and webhook example. NOT YET RUN.
import test from "node:test";
import assert from "node:assert/strict";
import { newSession } from "../studio/model.mjs";
import { PRIVATE_BANNER, findLeaks, markdownHandoff, publicJson, publicPage, safeFilename, sessionExport, webhookSpec } from "../studio/exports.mjs";
import { CANVAS, CAPABILITIES, EDGES, NODES, VENDORS } from "../studio/content.mjs";

const NOW = Date.UTC(2026, 9, 23, 12, 0, 0);
const JOIN = "https://rooms.example.com/join/SECRET-JOIN-TOKEN";
const WAIT = "https://rooms.example.com/wait/SECRET-WAIT-TOKEN";
const REDIRECT = "https://example.com/thanks-private-REDIRECT";

function full() {
	const s = newSession("INTERNAL-ONLY-NAME", NOW);
	Object.assign(s.event, {
		publicTitle: "Public Title", slug: "public-title", heroUrl: "https://cdn.example.com/h.jpg", heroAlt: "alt",
		aida: { attention: "att", interest: "int", decision: "dec", action: "act" }, shortDescription: "desc", outcomes: ["o1"],
		date: "2026-12-01", time: "14:00", timeZone: "America/New_York", hosts: ["Ana"], platform: "Web", venue: "", joinUrl: JOIN, waitingUrl: WAIT,
		redirectUrl: REDIRECT, thankYou: "PRIVATE-THANKS", recordingUrl: "https://video.example.com/r", topics: ["seo"], recurring: true, recurrence: "monthly",
	});
	s.notes = "PRIVATE-NOTES";
	s.tasks[0].owner = "PRIVATE-OWNER";
	s.tasks[0].evidence = "PRIVATE-EVIDENCE";
	s.rsvp.fields.phone = "optional";
	s.rsvp.fields.smsConsent = "optional";
	s.rsvp.smsConsentText = "Text me reminders";
	return s;
}

test("public page excludes join, waiting, redirect, internal and planning data", () => {
	const { data, leaks } = publicPage(full());
	assert.deepEqual(leaks, []);
	const text = JSON.stringify(data);
	for (const secret of [JOIN, WAIT, REDIRECT, "SECRET-JOIN", "SECRET-WAIT", "INTERNAL-ONLY-NAME", "PRIVATE-THANKS", "PRIVATE-NOTES", "PRIVATE-OWNER", "PRIVATE-EVIDENCE"]) assert.ok(!text.includes(secret), secret);
	for (const key of ["joinUrl", "waitingUrl", "redirectUrl", "internalName", "thankYou", "notes", "tasks", "owner"]) assert.ok(!text.includes(`"${key}"`), key);
	assert.equal(data.page.title, "Public Title");
	assert.equal(data.page.logistics.startUtc, "2026-12-01T19:00:00.000Z");
	assert.equal(data.page.heroImage.url, "https://cdn.example.com/h.jpg");
	assert.equal(data.page.copy.aida.action, "act");
	assert.ok(data.rsvpForm.fields.some((f) => f.id === "smsConsent" && f.mode === "optional"));
});

test("public export fails closed if a private link is pasted into public text", () => {
	const s = full();
	s.event.shortDescription = `Join here ${JOIN}`;
	assert.equal(findLeaks(publicPage(s).data, s).length, 1);
	assert.throws(() => publicJson(s), /join URL/);
	assert.doesNotThrow(() => publicJson(full()));
});

test("unsafe URLs are omitted from exports instead of being emitted", () => {
	const s = full();
	s.event.heroUrl = "javascript:alert(1)";
	s.event.joinUrl = "data:text/html,x";
	assert.equal(publicPage(s).data.page.heroImage.url, null);
	assert.equal(webhookSpec(s).example.event.links.join, null);
});

test("webhook spec is versioned, synthetic and carries ids, consent and links", () => {
	const w = webhookSpec(full());
	assert.equal(w.specVersion, "webinar-registration.v1-draft");
	assert.match(w.status, /EXAMPLE ONLY/);
	const ex = w.example;
	assert.equal(ex.synthetic, true);
	assert.equal(ex.specVersion, w.specVersion);
	assert.ok(ex.registration.id.startsWith("EXAMPLE"));
	assert.ok(ex.registration.idempotencyKey.startsWith("EXAMPLE"));
	assert.equal(ex.registration.formVersion, "v1");
	assert.equal(ex.registrant.email, "example@example.invalid");
	assert.ok("phone" in ex.registrant);
	assert.equal(ex.consent.smsMarketing.granted, false);
	assert.equal(ex.consent.smsMarketing.wording, "Text me reminders");
	assert.equal(ex.occurrence.id, "public-title@2026-12-01T19:00:00.000Z");
	assert.equal(ex.occurrence.timeZone, "America/New_York");
	assert.equal(ex.event.page.heroImageUrl, "https://cdn.example.com/h.jpg");
	assert.equal(ex.event.links.join, JOIN);
	assert.equal(ex.event.links.waiting, WAIT);
	assert.equal(ex.event.links.recording, "https://video.example.com/r");
	assert.equal(ex.event.afterRsvp.thankYou, "PRIVATE-THANKS");
	assert.match(w.sensitivity, /PRIVATE/);
});

test("webhook example omits fields the form does not ask for; unscheduled has null occurrence", () => {
	const s = newSession("x", NOW);
	const ex = webhookSpec(s).example;
	assert.ok(!("phone" in ex.registrant));
	assert.equal(ex.occurrence.id, null);
	assert.equal(ex.consent.smsMarketing.fieldEnabled, false);
});

test("session export is labelled private and contains the full session", () => {
	const x = sessionExport(full(), NOW);
	assert.equal(x.kind, "session");
	assert.match(x.sensitivity, /PRIVATE/);
	assert.equal(x.session.event.joinUrl, JOIN);
	assert.equal(x.handoff.occurrenceId, "public-title@2026-12-01T19:00:00.000Z");
});

test("markdown handoff is private-labelled and neutralises table and heading injection", () => {
	const s = full();
	s.tasks[0].title = "x|y\n# injected heading";
	s.tasks[0].evidence = "line1\nline2 | pipe";
	const md = markdownHandoff(s, NOW);
	assert.ok(md.includes(PRIVATE_BANNER));
	assert.ok(md.includes(JOIN));
	assert.ok(md.includes("x\\|y # injected heading"));
	assert.ok(!/^# injected heading$/m.test(md));
	assert.ok(md.includes("line1 line2 \\| pipe"));
	assert.ok(md.includes("Registration webhook"));
});

test("export filenames are safe", () => {
	const s = full();
	assert.equal(safeFilename(s, ".json"), "public-title.json");
	s.event.slug = "../../etc/passwd";
	assert.ok(!safeFilename(s, ".json").includes("/"));
});

test("canvas graph is well-formed and covers the required formats and channels", () => {
	const ids = new Set(NODES.map((n) => n.id));
	assert.equal(ids.size, NODES.length, "unique node ids");
	for (const e of EDGES) assert.ok(ids.has(e.a) && ids.has(e.b), `${e.a} -> ${e.b}`);
	for (const n of NODES) {
		assert.ok(n.details.length > 0 && n.summary, n.id);
		assert.ok(n.x >= 0 && n.y >= 0 && n.x + n.w <= CANVAS.width && n.y + n.h <= CANVAS.height, `${n.id} inside canvas`);
		assert.ok(EDGES.some((e) => e.a === n.id || e.b === n.id), `${n.id} is connected`);
	}
	const labels = NODES.map((n) => n.label.toLowerCase()).join("|");
	for (const word of ["live", "on-demand", "feature release", "power user", "interview", "panel", "freeform", "workshop", "onboarding", "before", "during", "after", "social", "founder", "paid ads", "seo", "youtube", "lead magnet", "lifecycle", "email", "customer success", "in-app", "support"]) assert.ok(labels.includes(word), word);
});

test("vendor guidance keeps author preferences and unverified labels, with no pricing claims", () => {
	const by = Object.fromEntries(VENDORS.map((v) => [v.name, v]));
	assert.equal(by.Riverside.tier, "crawl");
	assert.match(by.Riverside.status, /Author/);
	assert.equal(by.Sequel.tier, "run");
	for (const n of ["Zoom", "Wispr", "Livefront"]) assert.equal(by[n].status, "Unverified");
	assert.ok(!VENDORS.some((v) => /\$|per month|cheap|best|free plan/i.test(v.note)));
	assert.ok(!VENDORS.some((v) => v.tier === "walk"), "walk stays vendor-neutral");
	assert.ok(CAPABILITIES.some((c) => c.tier === "walk") && CAPABILITIES.some((c) => c.tier === "run") && CAPABILITIES.some((c) => c.tier === "crawl"));
});
