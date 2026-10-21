// Model, CLI, server and hook tests. Run with: node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { request } from "node:http";
import { join, resolve } from "node:path";
import { ITEMS, ASSETS, addDays, checks, itemsFor, newLaunch, normalize, progress, readiness, tierOf, weekday } from "../studio/model.mjs";

const root = resolve(import.meta.dirname, "..");
const studio = join(root, "tools/studio.mjs");
const run = (home, ...a) => JSON.parse(execFileSync("node", [studio, ...a, "--home", home], { encoding: "utf8" }));

test("tier is computed from the five scores and filters the checklist", () => {
	const l = newLaunch("X", "2026-11-17");
	assert.equal(tierOf(l), null);
	assert.equal(itemsFor(l).length, ITEMS.length, "unscored shows the T1 superset");
	Object.assign(l.tier.scores, { reach: 1, acquisition: 1, revenue: 1, behavior: 1, narrative: 1 });
	assert.equal(tierOf(l), 3);
	assert.ok(itemsFor(l).every((i) => i.tiers.includes(3)));
	l.tier.scores.reach = 3; l.tier.scores.narrative = 3;
	assert.equal(tierOf(l), 2);
	l.tier.override = 1;
	assert.equal(tierOf(l), 1);
});

test("due dates count back from T-0 and avoid weekends", () => {
	const l = newLaunch("X", "2026-11-17");
	for (const i of itemsFor(l)) assert.ok(![0, 6].includes(new Date(`${i.due}T00:00:00Z`).getUTCDay()), `${i.id} lands on a weekend`);
	assert.equal(weekday("2026-11-14", false), "2026-11-13");
	assert.equal(weekday("2026-11-14", true), "2026-11-16");
	assert.equal(itemsFor(l).find((i) => i.id === "readiness").due, "2026-11-13");
});

test("done counts without evidence", () => {
	const l = newLaunch("X", "2026-11-17");
	const before = progress(l).done;
	l.items.tier = { status: "done", evidence: "" };
	assert.equal(progress(l).done, before + 1);
	assert.ok(!checks(l).some((c) => c.item === "tier"));
});

test("default items can be reworded, moved and removed; gates can't be removed", () => {
	const { launch: l } = normalize({ id: "l_edit", name: "X", t0: "2026-11-17", tier: { override: 1 }, items: { tier: { text: "Agree the tier", role: "PM", phase: "build", status: "todo" }, "war-room": { removed: true }, "message-house": { removed: true }, kb: { removed: "yes", role: "NOPE" } } });
	const by = Object.fromEntries(itemsFor(l).map((i) => [i.id, i]));
	assert.deepEqual([by.tier.text, by.tier.role, by.tier.phase, by.tier.edited], ["Agree the tier", "PM", "build", true]);
	assert.equal(by.tier.def.text, ITEMS.find((i) => i.id === "tier").text, "the default is kept");
	assert.ok(!by["war-room"], "removed");
	const gate = ITEMS.find((i) => i.gate === true || i.gate === 1);
	l.items[gate.id] = { status: "todo", owner: "", due: "", evidence: "", note: "", removed: true };
	assert.ok(itemsFor(l).some((i) => i.id === gate.id), "a gate stays even when marked removed");
	assert.ok(by.kb && by.kb.role === ITEMS.find((i) => i.id === "kb").role, "invalid edits are ignored");
	assert.equal(progress(l).total, itemsFor(l).filter((i) => i.status !== "na").length);
});

test("readiness gates: NO-GO until gates, items and red-team blockers clear", () => {
	const { launch: l } = normalize({ id: "l_test", name: "X", t0: "2026-11-17", tier: { override: 3 }, rollout: { full: true } });
	assert.equal(readiness(l).verdict, "no-go");
	for (const i of itemsFor(l)) l.items[i.id] = { status: "done", evidence: "x" };
	l.message.status = "approved";
	l.measure.events.forEach((e) => (e.prod = true));
	assert.equal(readiness(l).verdict, "go");
	l.feedback.items.push({ severity: "blocker", text: "x" });
	assert.equal(normalize(l).launch && readiness(normalize(l).launch).verdict, "no-go");
});

test("checks flag vanity metrics, missing DRI and unconfirmed rollout", () => {
	const l = newLaunch("X", addDays(new Date().toISOString().slice(0, 10), 30));
	l.measure.primary = "Video views";
	const c = checks(l).map((x) => x.text).join("\n");
	assert.match(c, /vanity/);
	assert.match(c, /No launch DRI/);
	assert.match(c, /100%/);
});

test("normalize keeps unknown item ids out and fills defaults", () => {
	const { launch } = normalize({ id: "l_x", name: "A", items: { bogus: { status: "done" }, tier: { status: "weird" } }, assets: { nope: {} } });
	assert.equal(launch.items.bogus, undefined);
	assert.equal(launch.items.tier.status, "todo");
	assert.deepEqual(launch.assets, {});
	assert.ok(launch.measure.events.some((e) => e.props.includes("entry_point")));
	assert.equal(ASSETS.every((a) => !a.item || ITEMS.some((i) => i.id === a.item)), true, "every asset links to a real item");
});

test("CLI: new, list, validate, export", () => {
	const home = mkdtempSync(join(tmpdir(), "prc-"));
	const { id } = run(home, "new", "Smart invoices", "--t0", "2026-12-01");
	assert.equal(run(home, "list")[0].name, "Smart invoices");
	assert.equal(run(home, "validate", id).ok, true);
	const { files } = run(home, "export", id, "--out", join(home, "out"));
	assert.ok(files.some((f) => f.endsWith("report.html")));
	assert.match(readFileSync(join(home, "out", "checklist.md"), "utf8"), /Decide/);
});

test("server: save with version check, request queue, and hook delivers once", async () => {
	const home = mkdtempSync(join(tmpdir(), "prc-"));
	const { id } = run(home, "new", "Srv", "--t0", "2026-12-01");
	const port = 4790 + Math.floor(Math.random() * 100);
	const srv = spawn("node", [studio, "--port", String(port), "--home", home], { stdio: "pipe" });
	await new Promise((r) => srv.stdout.once("data", r));
	const base = `http://127.0.0.1:${port}`;
	try {
		const got = await (await fetch(`${base}/api/launches/${id}`)).json();
		got.launch.dri = "Sam";
		const put = await fetch(`${base}/api/launches/${id}`, { method: "PUT", headers: { "x-base-version": got.version }, body: JSON.stringify(got.launch) });
		assert.equal(put.status, 200);
		const stale = await fetch(`${base}/api/launches/${id}`, { method: "PUT", headers: { "x-base-version": got.version }, body: JSON.stringify(got.launch) });
		assert.equal(stale.status, 409, "stale version is rejected");
		const q = await fetch(`${base}/api/request`, { method: "POST", body: JSON.stringify({ kind: "review", launchId: id, note: "hi" }) });
		assert.equal(q.status, 201);
		const hook = (s) => execFileSync("node", [join(root, "tools/studio-context.mjs"), "--home", home], { input: JSON.stringify({ session_id: s }), encoding: "utf8" });
		assert.match(JSON.parse(hook("a")).hookSpecificOutput.additionalContext, /Red-team review/);
		assert.equal(hook("b"), "", "delivered only once");
		const foreign = await new Promise((ok) => request({ port, path: "/api/launches", headers: { host: "evil.com" } }, (r) => ok(r.statusCode)).end());
		assert.equal(foreign, 403, "requests addressed to another host are refused");
	} finally {
		srv.kill();
	}
});

import { workload, ownerOf } from "../studio/model.mjs";
import { applyLinearResult, linearPayload, renderTasksCsv, renderTeamPlan } from "../studio/teamplan.mjs";

const staffed = () => {
	const { launch } = normalize({
		id: "l_staff", name: "Smart invoices", t0: "2026-11-17", tier: { override: 2 },
		people: [{ id: "p1", name: "Sam Lee", email: "SAM@x.com" }, { id: "p2", name: "Ana", email: "ana@x.com" }],
		staffing: { DRI: "p1", PMM: "p1", ENG: "p2", BOGUS: "p1", DATA: "nobody" },
		items: { events: { status: "todo", owner: "Sam Lee" } },
	});
	return launch;
};

test("staffing: roles resolve owners, explicit owners win, unknown roles and people are dropped", () => {
	const l = staffed();
	assert.equal(l.people[0].email, "sam@x.com");
	assert.deepEqual(Object.keys(l.staffing).sort(), ["DRI", "ENG", "PMM"]);
	assert.equal(ownerOf(l, "ENG").name, "Ana");
	assert.equal(itemsFor(l).find((i) => i.id === "events").person.name, "Sam Lee", "explicit owner beats ENG staffing");
	const w = workload(l);
	assert.ok(w.roles.find((r) => r.role === "DATA" && !r.person));
	assert.ok(w.unassigned.every((i) => !i.person));
	assert.equal(w.people.find((p) => p.id === "p1").roles.join(), "DRI,PMM");
	assert.match(checks(l).map((c) => c.text).join("\n"), /Nobody staffed for .*DATA/);
});

test("linear payload: one issue per open item, assignee emails, milestones per phase, idempotent keys", () => {
	const l = staffed();
	const p = linearPayload(l);
	assert.equal(p.issues.length, itemsFor(l).filter((i) => i.open).length);
	assert.equal(p.project.lead_email, "sam@x.com");
	assert.ok(p.project.description.length <= 255);
	assert.equal(p.issues.find((i) => i.key === "events").assignee_email, "sam@x.com");
	assert.ok(p.milestones.every((m) => m.target_date && m.name));
	assert.ok(p.issues.find((i) => i.key === "kb").priority === 2, "gates are high priority");
});

test("link: write-back records ids, matches users and pulls state into the checklist", () => {
	const l = staffed();
	const changed = applyLinearResult(l, {
		teamId: "t1", projectId: "pr1", projectUrl: "https://linear.app/x/project/1",
		issues: { kb: { id: "i1", identifier: "GRO-1", url: "https://linear.app/x/GRO-1" }, events: { id: "i2", identifier: "GRO-2", url: "u2" }, press: { id: "i3", identifier: "GRO-3", url: "u3" } },
		people: { "SAM@x.com": "u-sam" },
		pulled: { kb: { state: "completed" }, events: { state: "started" }, press: { state: "canceled" }, unknown: { state: "completed" } },
	});
	assert.equal(l.people[0].linearUserId, "u-sam");
	assert.equal(l.items.kb.status, "done");
	assert.equal(l.items.kb.evidence, "https://linear.app/x/GRO-1");
	assert.equal(l.items.events.status, "doing");
	assert.equal(l.items.press.status, "na");
	assert.equal(changed.length, 3);
	const again = linearPayload(normalize(l).launch);
	assert.equal(again.project.existingId, "pr1");
	assert.equal(again.issues.find((i) => i.key === "events").existing.id, "i2", "re-sync updates instead of duplicating");
});

test("team plan: per-person sections, unassigned section, CSV rows", () => {
	const l = staffed();
	const html = renderTeamPlan(l);
	assert.match(html, /Sam Lee/);
	assert.match(html, /Unassigned/);
	assert.match(html, /data-check="kb"/);
	const csv = renderTasksCsv(l).trim().split("\n");
	assert.equal(csv.length, itemsFor(l).length + 1);
	assert.match(csv[0], /^Owner,Email,Role/);
});

test("video: workstream items for T1/T2, gate, migration and checks", () => {
	const { launch: l } = normalize({ id: "l_v", name: "V", t0: "2026-11-17", tier: { override: 2 }, items: { video: { status: "done", evidence: "x" } } });
	const ids = itemsFor(l).map((i) => i.id);
	for (const id of ["video-brief", "video-script", "ui-freeze", "video-production", "video-review", "video-final", "video-cutdowns", "video-thumbnail", "video-handoff", "youtube-launch-video", "video-performance"]) assert.ok(ids.includes(id), id);
	assert.equal(l.items["video-final"].status, "done", "old single video item migrates to video-final");
	const gate = readiness(l).gates.find((g) => g.id === "video");
	assert.ok(gate && !gate.ok, "hero cut not ready keeps the video gate closed");
	l.video.deliverables.hero.status = "ready";
	assert.ok(readiness(l).gates.find((g) => g.id === "video").ok);
	l.video.rounds = [{ decision: "changes" }, { decision: "changes" }, { decision: "changes" }];
	assert.match(checks(l).map((c) => c.text).join("\n"), /3 review rounds/);
	const { launch: t3 } = normalize({ id: "l_v3", name: "V", t0: "2026-11-17", tier: { override: 3 } });
	assert.ok(!itemsFor(t3).some((i) => i.id.startsWith("video")), "T3 has no video workstream");
});

import { AFTER, dependencyCycle, itemById } from "../studio/model.mjs";
import { issueDescription } from "../studio/teamplan.mjs";

test("dependencies: every default names real items, has no loop, and is never due after what it unblocks", () => {
	for (const [id, after] of Object.entries(AFTER)) {
		assert.ok(itemById[id], `unknown item ${id}`);
		for (const p of after) {
			assert.ok(itemById[p], `${id} waits on unknown ${p}`);
			assert.ok(itemById[p].due <= itemById[id].due, `${p} (${itemById[p].due}) is due after ${id} (${itemById[id].due})`);
		}
	}
	const { launch } = normalize({ id: "l_d", name: "D", t0: "2026-11-17" });
	assert.equal(dependencyCycle(launch), null);
	assert.ok(!checks(launch).some((c) => c.area === "Checklist"), "default dates respect the dependencies");
	const orphans = ITEMS.filter((i) => !i.after.length && !ITEMS.some((x) => x.after.includes(i.id)));
	assert.deepEqual(orphans.map((i) => i.id), [], "every item is in the graph");
});

test("dependencies: pass through items the tier drops or the launch removes, without redundant links", () => {
	const { launch: t3 } = normalize({ id: "l_d3", name: "D", t0: "2026-11-17", tier: { override: 3 } });
	const by = Object.fromEntries(itemsFor(t3).map((i) => [i.id, i]));
	assert.deepEqual(by["flag-live"].after, ["readiness"], "rollout-ready is T1/T2; its events dependency is already behind readiness");
	assert.deepEqual(by.kb.after, ["message-house"]);
	const { launch: l } = normalize({ id: "l_dr", name: "D", t0: "2026-11-17", tier: { override: 2 }, items: { "teaser-motion": { removed: true } } });
	assert.deepEqual(itemsFor(l).find((i) => i.id === "teaser-post").after, ["message-house", "ui-freeze"]);
});

test("dependencies: editable per launch, custom items too, unknown ids dropped, loops flagged", () => {
	const { launch: l } = normalize({
		id: "l_de", name: "D", t0: "2026-11-17", tier: { override: 2 },
		items: { banner: { after: ["c_1", "nope", "banner"] }, "message-house": { status: "done" } },
		custom: [{ id: "c_1", text: "Banner art", phase: "build", role: "DESIGN", due: -6, after: ["message-house"] }],
	});
	assert.deepEqual(l.items.banner.after, ["c_1"]);
	const by = Object.fromEntries(itemsFor(l).map((i) => [i.id, i]));
	assert.deepEqual(by.banner.after, ["c_1"]);
	assert.deepEqual(by.c_1.after, ["message-house"]);
	assert.deepEqual(by.c_1.waitingOn, [], "done dependencies don't hold it up");
	assert.deepEqual(by.banner.waitingOn, ["c_1"]);
	assert.ok(by.c_1.blocks.includes("banner"));
	assert.deepEqual([...new Set(dependencyCycle(l, { c_1: ["banner"] }))].sort(), ["banner", "c_1"]);
	l.custom[0].after = ["banner"];
	assert.match(checks(l).map((c) => c.text).join("\n"), /Dependency loop/);
	l.custom[0].after = [];
	l.items.banner.due = "2026-11-01";
	assert.match(checks(l).map((c) => c.text).join("\n"), /before “Banner art”/);
});

test("task context: overview on every issue, role blocks, per-task note and overrides", () => {
	const { launch: l } = normalize({
		id: "l_c", name: "Smart invoices", t0: "2026-11-17", tier: { override: 2 },
		context: "Invoices send from the customer's own domain.",
		message: { oneLiner: "Get paid faster", limits: "US only for now", pillars: [{ claim: "Lands in the inbox", proof: "98% delivery in beta" }], useWords: "your domain", objections: [{ q: "Is DNS hard?", a: "Two records, guided." }] },
		items: { kb: { context: "Screenshots from the beta workspace.", ctx: ["limits"] } },
	});
	const all = itemsFor(l);
	const kb = issueDescription(l, all.find((i) => i.id === "kb"), { items: all });
	assert.match(kb, /What we're launching:\*\* Invoices send from the customer's own domain/);
	assert.match(kb, /For this task:\*\* Screenshots from the beta workspace/);
	assert.match(kb, /US only for now/);
	assert.doesNotMatch(kb, /Is DNS hard/, "the override replaces the SUPPORT default");
	assert.match(kb, /isn't approved yet/);
	assert.match(kb, /Waits on:\*\*\n- .*Message house/);
	const social = issueDescription(l, all.find((i) => i.id === "social-company"), { items: all });
	assert.match(social, /Lands in the inbox \(proof: 98% delivery in beta\)/);
	assert.match(social, /\*\*Use:\*\* your domain/);
	const tier = issueDescription(l, all.find((i) => i.id === "tier"), { items: all });
	assert.doesNotMatch(tier, /Pillars/, "DRI tasks get the overview only");
	l.context = "";
	assert.match(issueDescription(l, itemsFor(l).find((i) => i.id === "tier")), /What we're launching:\*\* Get paid faster/);
});

test("linear relations: one per dependency with both issues, kept on re-sync, stale ones listed for removal", () => {
	const l = staffed();
	const p = linearPayload(l);
	const keys = new Set(p.issues.map((i) => i.key));
	assert.ok(p.relations.length > 50);
	assert.ok(p.relations.every((r) => keys.has(r.blocker) && keys.has(r.blocked) && r.key === `${r.blocker}>${r.blocked}` && !r.existing));
	assert.ok(p.relations.some((r) => r.key === "message-house>claims"));
	applyLinearResult(l, { projectId: "pr1", issues: { "message-house": { id: "i1" }, claims: { id: "i2" } }, relations: { "message-house>claims": "r1", "old>claims": "r2" } });
	const again = linearPayload(normalize(l).launch);
	assert.equal(again.relations.find((r) => r.key === "message-house>claims").existing, "r1");
	assert.deepEqual(again.remove, [{ key: "old>claims", id: "r2" }]);
	applyLinearResult(l, { relations: { "old>claims": null } });
	assert.deepEqual(Object.keys(l.sync.linear.relations), ["message-house>claims"]);
	assert.match(renderTasksCsv(l).split("\n")[0], /Task id,Waits on$/);
});
