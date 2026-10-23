// Browser smoke test with Playwright, for a managed container where Playwright is already installed (this plugin does
// not depend on it and never installs it). NOT YET RUN.
//   node test/browser-smoke.mjs                     starts the studio on a free loopback port, drives headless Chromium
//   BASE_URL=http://127.0.0.1:4731 node test/browser-smoke.mjs   drives an already-running studio
// Covers: canvas select/zoom/keyboard, create/edit/reload persistence, skip link, tier, workflow, library filters,
// exports and the preview leak block. The browser and server are always closed in `finally`, pass or fail.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createStudioServer } from "../tools/studio.mjs";

let chromium;
try {
	({ chromium } = await import("playwright"));
} catch {
	console.error("Playwright is not available in this environment. Run this inside the managed test container.");
	process.exit(2);
}

let studio;
let browser;
let page;
let tmp;
const problems = [];

class StepFailed extends Error {}
const step = async (name, fn) => {
	try {
		await fn();
		console.log(`ok   ${name}`);
	} catch (err) {
		console.error(`FAIL ${name}\n${err.stack}`);
		await page?.screenshot({ path: `smoke-failure-${name.replace(/\W+/g, "-")}.png` }).catch(() => {});
		throw new StepFailed(name);
	}
};

try {
	let base = process.env.BASE_URL;
	if (!base) {
		studio = createStudioServer({ port: 0 });
		const addr = await studio.listen();
		base = `http://127.0.0.1:${addr.port}`;
	}
	browser = await chromium.launch();
	const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
	page = await context.newPage();
	page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
	page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));

	await step("why-webinars canvas: select, zoom, reset, keyboard", async () => {
		await page.goto(`${base}/#why`);
		await page.waitForSelector('.node[data-id="f-panel"]');
		await page.waitForFunction(() => /Zoom \d+%/.test(document.querySelector("#zoomLabel")?.textContent ?? ""));
		await page.click('.node[data-id="f-panel"]');
		assert.match(await page.textContent("#nodeDetail"), /Panel discussion/);
		await page.click('.node[data-id="ch-youtube"]');
		assert.match(await page.textContent("#nodeDetail"), /YouTube/);
		const before = await page.textContent("#zoomLabel");
		await page.click("#zoomIn");
		assert.notEqual(await page.textContent("#zoomLabel"), before);
		await page.click("#zoomReset");
		assert.equal(await page.textContent("#zoomLabel"), before);
		const t0 = await page.getAttribute("#canvasWorld", "transform");
		await page.focus("#canvasView");
		await page.keyboard.press("ArrowLeft");
		assert.notEqual(await page.getAttribute("#canvasWorld", "transform"), t0);
		await page.keyboard.press("0");
		assert.equal(await page.getAttribute("#canvasWorld", "transform"), t0);
		await page.focus('.node[data-id="sig-live"]');
		await page.keyboard.press("Enter");
		assert.match(await page.textContent("#nodeDetail"), /Live attendance/);
	});

	await step("create a session and edit the brief", async () => {
		await page.click("#newSession");
		await page.fill("#newName", "Smoke webinar");
		await page.click("text=Create session");
		await page.waitForSelector("#f-event-publicTitle");
		await page.fill("#f-event-publicTitle", "Smoke Webinar Public");
		await page.click("text=Generate from title");
		assert.equal(await page.inputValue("#f-event-slug"), "smoke-webinar-public");
		await page.fill("#f-event-aida-attention", "Attention copy");
		await page.fill("#f-event-aida-interest", "Interest copy");
		await page.fill("#f-event-aida-decision", "Decision copy");
		await page.fill("#f-event-aida-action", "Action copy");
		await page.fill("#f-event-shortDescription", "A short description");
		await page.fill("#f-event-outcomes", "Learn one\nLearn two");
		await page.fill("#f-event-date", "2099-01-15");
		await page.fill("#f-event-time", "14:00");
		await page.fill("#f-event-timeZone", "America/New_York");
		await page.fill("#f-event-hosts", "Ana, Bo");
		await page.fill("#f-event-topics", "seo, growth");
		await page.fill("#f-event-joinUrl", "https://rooms.example.com/join/SMOKE-SECRET");
		assert.match(await page.textContent(".sched"), /2099-01-15T19:00:00.000Z/);
		await page.fill("#f-event-joinUrl", "javascript:alert(1)");
		assert.match(await page.textContent("#f-event-joinUrl-err"), /https/);
		await page.fill("#f-event-joinUrl", "https://rooms.example.com/join/SMOKE-SECRET");
		assert.equal(await page.textContent("#f-event-joinUrl-err"), "");
		assert.match(await page.textContent("#saveState"), /Saved/);
	});

	await step("edits persist across reload", async () => {
		await page.reload();
		await page.waitForSelector("#f-event-publicTitle");
		assert.equal(await page.inputValue("#f-event-publicTitle"), "Smoke Webinar Public");
		assert.equal(await page.inputValue("#f-event-hosts"), "Ana, Bo");
		assert.equal(await page.inputValue("#f-event-timeZone"), "America/New_York");
		assert.equal(await page.inputValue("#f-event-outcomes"), "Learn one\nLearn two");
	});

	await step("skip link focuses the content without leaving the session", async () => {
		const hash = await page.evaluate(() => location.hash);
		await page.focus(".skip");
		await page.keyboard.press("Enter");
		assert.equal(await page.evaluate(() => location.hash), hash);
		assert.equal(await page.evaluate(() => document.activeElement?.id), "stage");
		assert.ok(await page.isVisible("#f-event-publicTitle"));
	});

	await step("tier selection persists", async () => {
		await page.click('a:has-text("Tier & tools")');
		await page.click('button:has-text("Choose Walk")');
		await page.reload();
		assert.equal(await page.getAttribute('button:has-text("Walk chosen")', "aria-pressed"), "true");
		assert.match(await page.textContent("body"), /Author's preference: Riverside/);
	});

	await step("workflow task status updates progress", async () => {
		await page.click('a:has-text("Workflow")');
		const sel = page.locator(".task select").first();
		await sel.selectOption("done");
		await page.click('a:has-text("Overview")');
		assert.match(await page.textContent(".stats"), /[1-9]\d*%|[1-9] of/);
	});

	await step("library search and upcoming/recorded toggle", async () => {
		await page.click('a:has-text("Library")');
		await page.waitForSelector("#libGrid");
		assert.match(await page.textContent("#libCount"), /1 of 1/);
		await page.fill("#libQ", "smoke");
		assert.match(await page.textContent("#libGrid"), /Smoke Webinar Public/);
		await page.fill("#libQ", "zzzz-no-match");
		assert.match(await page.textContent("#libGrid"), /No sessions match/);
		await page.fill("#libQ", "");
		await page.selectOption("#libTopic", "seo");
		assert.match(await page.textContent("#libCount"), /1 of 1/);
		await page.selectOption("#libTopic", "");
		await page.click("#view-recorded");
		assert.match(await page.textContent("#libCount"), /0 of 1/);
		await page.click("#view-upcoming");
		assert.match(await page.textContent("#libCount"), /1 of 1/);
	});

	await step("export keeps public and private apart", async () => {
		await page.click(".lib-card");
		await page.click('a:has-text("Export")');
		await page.click("#prev-pub");
		const pub = await page.textContent("#exportPreview");
		assert.ok(pub.includes("Smoke Webinar Public"));
		assert.ok(!pub.includes("SMOKE-SECRET"), "public export has no join link");
		assert.ok(!pub.includes("Smoke webinar\""), "public export has no internal name");
		await page.click("#prev-md");
		assert.ok((await page.textContent("#exportPreview")).includes("SMOKE-SECRET"));
		const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dl-pub")]);
		assert.match(dl.suggestedFilename(), /\.public\.json$/);
	});

	await step("page preview shows no attendance links and an inert form", async () => {
		await page.click('a:has-text("Page preview")');
		const text = await page.textContent("#pagePreview");
		assert.ok(text.includes("DRAFT PREVIEW"));
		assert.ok(!text.includes("SMOKE-SECRET"));
		assert.equal(await page.locator("#pagePreview input:not([disabled])").count(), 0);
	});

	await step("a scheme-less join link pasted into public copy blocks preview and public export", async () => {
		await page.click('a:has-text("Event brief")');
		await page.fill("#f-event-shortDescription", "Join at rooms.example.com/join/SMOKE-SECRET");
		await page.click('a:has-text("Page preview")');
		assert.match(await page.textContent("#previewBlocked"), /join URL/);
		assert.equal(await page.locator("#pagePreview").count(), 0);
		await page.click('a:has-text("Export")');
		assert.ok(await page.isDisabled("#dl-pub"));
		await page.click('a:has-text("Event brief")');
		await page.fill("#f-event-shortDescription", "A short description");
	});

	await step("repeating cadence is a select with four cadences and persists", async () => {
		await page.click('a:has-text("Event brief")');
		assert.equal(await page.evaluate(() => document.querySelector("#f-event-recurrence").tagName), "SELECT");
		assert.deepEqual(await page.$$eval("#f-event-recurrence option", (o) => o.map((x) => x.value)), ["", "weekly", "biweekly", "monthly", "quarterly"]);
		await page.check("#f-event-recurring");
		await page.selectOption("#f-event-recurrence", "biweekly");
		await page.reload();
		await page.waitForSelector("#f-event-recurrence");
		assert.equal(await page.inputValue("#f-event-recurrence"), "biweekly");
	});

	await step("tasks show one role, optional owner, dependencies; cycles are refused; custom tasks work", async () => {
		await page.click('a:has-text("Workflow")');
		// Match rows by their own title only (every row's dependency picker lists the other titles).
		const row = (title) => page.locator(".task").filter({ has: page.locator(".t > b", { hasText: title }) });
		const aida = row("Write AIDA copy");
		assert.equal(await aida.locator('input[aria-label^="Responsible role"]').inputValue(), "Product marketer");
		assert.equal(await aida.locator('input[aria-label^="Named owner"]').inputValue(), "");
		assert.match(await aida.locator(".deps .chip").first().textContent(), /Complete the event brief/);
		const brief = row("Complete the event brief");
		await brief.locator("select.dep-add").selectOption({ label: "Repurpose & readout: Write the readout: attendance, no-shows, top questions, pipeline" });
		assert.match(await brief.locator(".deps .err").textContent(), /cycle/);
		await page.fill("#customTitle", "Smoke custom task");
		await page.fill("#customRole", "Producer");
		await page.click("#addTask");
		const custom = row("Smoke custom task");
		assert.equal(await custom.locator('input[aria-label^="Responsible role"]').inputValue(), "Producer");
		await custom.locator("select.dep-add").selectOption({ label: "Create page: Write AIDA copy: attention, interest, decision, action" });
		assert.match(await custom.locator(".deps .chip").first().textContent(), /Write AIDA copy/);
		assert.match(await custom.locator(".blocked-by").textContent(), /Blocked by 1/);
		await page.reload();
		assert.match(await row("Smoke custom task").locator(".deps .chip").first().textContent(), /Write AIDA copy/);
	});

	await step("share artifact downloads as HTML and works from file:// with no network", async () => {
		tmp = await mkdtemp(join(tmpdir(), "ws-smoke-"));
		await page.click('a:has-text("Export")');
		await page.waitForSelector("#print-share", { state: "visible" });
		const [slides] = await Promise.all([page.waitForEvent("download"), page.click("#dl-share-slides")]);
		assert.match(slides.suggestedFilename(), /\.slides\.html$/);
		await page.evaluate(() => (window.print = () => (window.__printed = !!document.querySelector("#printArea main"))));
		await page.click("#print-share");
		assert.equal(await page.evaluate(() => window.__printed), true);
		await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
		const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dl-share-html")]);
		assert.match(dl.suggestedFilename(), /\.plan\.html$/);
		const file = join(tmp, dl.suggestedFilename());
		await dl.saveAs(file);
		const offline = await browser.newContext({ acceptDownloads: true });
		const network = [];
		await offline.route("**/*", (r) => (r.request().url().startsWith("file:") ? r.continue() : (network.push(r.request().url()), r.abort())));
		const p2 = await offline.newPage();
		const errs = [];
		p2.on("pageerror", (e) => errs.push(e.message));
		await p2.goto(pathToFileURL(file).href);
		const text = await p2.textContent("main");
		assert.ok(text.includes("Smoke Webinar Public") && text.includes("Planning snapshot") && text.includes("Product marketer") && text.includes("Smoke custom task"));
		assert.ok(!(await p2.content()).includes("SMOKE-SECRET"), "no join link in the share file");
		assert.ok(await p2.isVisible("#print"));
		await p2.click("#viewSlides");
		assert.equal(await p2.getAttribute("#viewSlides", "aria-pressed"), "true");
		assert.match(await p2.textContent("#slideStatus"), /Slide 1 of \d+/);
		await p2.click("#next");
		assert.match(await p2.textContent("#slideStatus"), /Slide 2 of/);
		assert.equal(await p2.locator(".slide:visible").count(), 1);
		await p2.click("#viewDoc");
		assert.ok((await p2.locator(".slide:visible").count()) > 3);
		const [md] = await Promise.all([p2.waitForEvent("download"), p2.click("#dlMd")]);
		assert.match(md.suggestedFilename(), /\.plan\.md$/);
		const mdFile = join(tmp, "plan.md");
		await md.saveAs(mdFile);
		assert.match(await readFile(mdFile, "utf8"), /Depends on/);
		assert.deepEqual(network, [], "the share file made no network requests");
		assert.deepEqual(errs, []);
		await offline.close();
	});

	await step("preset tasks support editing, moving, confirmed deletion and dependency cleanup", async () => {
		await page.click('a:has-text("Workflow")');
		const row = (title) => page.locator(".task").filter({ has: page.locator(".t > b", { hasText: title }) });
		const original = row("Write AIDA copy");
		await original.locator("summary").click();
		await original.locator('input[aria-label^="Task title:"]').fill("Edited preset task");
		await original.locator('select[aria-label^="Task stage:"]').selectOption("review");
		await original.getByRole("button", { name: "Save task", exact: true }).click();
		await page.reload();
		await row("Edited preset task").waitFor();
		assert.equal(await row("Edited preset task").locator('select[aria-label^="Task stage:"]').inputValue(), "review");
		await row("Edited preset task").getByRole("button", { name: "Delete task: Edited preset task", exact: true }).click();
		await page.getByRole("button", { name: "Cancel", exact: true }).click();
		assert.equal(await row("Edited preset task").count(), 1);
		await row("Edited preset task").getByRole("button", { name: "Delete task: Edited preset task", exact: true }).click();
		await page.getByRole("button", { name: "Remove task and links", exact: true }).click();
		await page.reload();
		await page.waitForSelector("#addTask");
		assert.equal(await row("Edited preset task").count(), 0);
		assert.equal(await row("Smoke custom task").locator(".deps .chip").count(), 0);
	});

	await step("no script errors", async () => {
		assert.deepEqual(problems, []);
	});
	console.log("browser smoke test finished");
} catch (err) {
	if (!(err instanceof StepFailed)) console.error(err?.stack ?? err);
	process.exitCode = 1;
} finally {
	await browser?.close().catch(() => {});
	await studio?.close().catch(() => {});
	if (tmp) await rm(tmp, { recursive: true, force: true }).catch(() => {});
}
