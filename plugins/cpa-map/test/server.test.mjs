// The server, run in this process against a temporary home folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, exportPack, serve, setHome, summary } from "../tools/cpamap.mjs";

const row = (id, name, spend, purchases) => ({ ad_id: id, ad_name: name, adset_id: "as1", adset_name: "Broad", campaign_id: "c1", campaign_name: "ACQ", spend: String(spend), impressions: "1", clicks: "1", actions: [{ action_type: "purchase", value: String(purchases) }], action_values: [{ action_type: "purchase", value: String(purchases * 50) }], date_start: "2024-01-01", date_stop: "2026-10-27" });

test("server: build from raw files, read, save settings, exports, queue a request", async () => {
	const home = mkdtempSync(join(tmpdir(), "cpamap-"));
	setHome(home);
	const raw = join(home, "raw", "act_123");
	mkdirSync(raw, { recursive: true });
	writeFileSync(join(raw, "lifetime.json"), JSON.stringify({ result: [row("a", "Video A", 3000, 5), row("b", "Static B", 2000, 40), row("c", "Static C", 400, 0)] }));
	writeFileSync(join(raw, "last30.json"), JSON.stringify({ result: [row("a", "Video A", 500, 2), row("b", "Static B", 500, 3)] }));
	writeFileSync(join(raw, "campaigns.json"), JSON.stringify({ result: [{ id: "c1", name: "ACQ", effective_status: "ACTIVE", objective: "OUTCOME_SALES" }] }));
	const b = build("act_123", { name: "Test Co", currency: "CAD" });
	assert.equal(b.data.ads.length, 3);
	assert.equal(b.data.ads[0].campaignStatus, "ACTIVE");
	assert.match(summary("act_123"), /Account: Test Co \(act_123, Meta\), CAD/);
	const pack = await exportPack("act_123", { pdf: false });
	for (const f of ["report.html", "slides.html", "plan.md", "readout.md", "actions.csv"]) assert.ok(existsSync(join(pack.dir, f)), f);
	assert.ok(existsSync(join(pack.dir, "fonts", "manrope-400.ttf")));

	// Google raw files, GAQL shape.
	const graw = join(home, "raw", "gads_555555");
	mkdirSync(graw, { recursive: true });
	const g = (id, cost, conv) => ({ campaign: { id: "c9", name: "Brand | Search", status: "ENABLED", advertising_channel_type: "SEARCH" }, ad_group: { id: "g9", name: "Nav" }, ad_group_ad: { status: "ENABLED", ad: { id, type_: "RESPONSIVE_SEARCH_AD" } }, metrics: { cost_micros: String(cost * 1e6), impressions: "9", clicks: "9", conversions: conv, conversions_value: conv * 10 } });
	writeFileSync(join(graw, "lifetime.json"), JSON.stringify({ results: [g("x1", 900, 3), g("x2", 300, 0)], row_count: 2 }));
	writeFileSync(join(graw, "last30.json"), JSON.stringify({ results: [g("x1", 100, 1)], row_count: 1 }));
	writeFileSync(join(graw, "account.json"), JSON.stringify({ results: [{ customer: { id: "555555", descriptive_name: "Goog Co", currency_code: "EUR", time_zone: "Europe/Paris" }, metrics: {} }] }));
	const gb = build("gads_555555");
	assert.equal(gb.data.account.name, "Goog Co");
	assert.equal(gb.data.account.currency, "EUR");
	assert.equal(gb.data.platform, "google");
	assert.match(summary("gads_555555"), /Google Ads\), EUR/);

	const server = serve(0);
	await new Promise((ok) => server.once("listening", ok));
	const base = `http://127.0.0.1:${server.address().port}`;
	const j = (r) => r.json();
	try {
		assert.equal((await fetch(`${base}/`)).status, 200);
		assert.equal((await fetch(`${base}/model.mjs`)).headers.get("content-type"), "text/javascript");
		assert.equal((await fetch(`${base}/fonts/manrope-400.ttf`)).headers.get("content-type"), "font/ttf");
		assert.equal((await fetch(`${base}/../tools/cpamap.mjs`)).status, 404);
		assert.equal((await fetch(`${base}/api/settings`).then(j)).mode, "local");
		const accounts = await fetch(`${base}/api/accounts`).then(j);
		assert.deepEqual(accounts.map((a) => a.id).sort(), ["act_123", "gads_555555"]);
		const { data, settings, version } = await fetch(`${base}/api/accounts/act_123`).then(j);
		assert.equal(data.account.currency, "CAD");
		assert.equal(settings.targetPct, 0.15);
		const put = await fetch(`${base}/api/accounts/act_123/settings`, { method: "PUT", body: JSON.stringify({ ...settings, targetPct: 0.2, decisions: { a: "keep" }, notes: "promo week" }) }).then(j);
		assert.equal(put.settings.targetPct, 0.2);
		assert.equal(put.settings.notes, "promo week");
		assert.notEqual(put.version, version);
		const csv = await fetch(`${base}/api/accounts/act_123/actions.csv`).then((r) => r.text());
		assert.match(csv, /^action,ad_id/);
		for (const [name, type, probe] of [["report.html", "text/html", /Action plan/], ["slides.html", "text/html", /class="slide cover"/], ["plan.md", "text/markdown", /^# Test Co/], ["readout.md", "text/markdown", /## The lines/]]) {
			const r = await fetch(`${base}/api/accounts/act_123/${name}`);
			assert.equal(r.status, 200, name);
			assert.match(r.headers.get("content-type"), new RegExp(type), name);
			assert.match(await r.text(), probe, name);
		}
		assert.match((await fetch(`${base}/api/accounts/act_123/report.html`).then((r) => r.text())), /url\("\/fonts\//, "fonts served from the root when previewed");
		const q = await fetch(`${base}/api/request`, { method: "POST", body: JSON.stringify({ kind: "explain", accountId: "act_123", adIds: ["a"], note: "why", filters: { live: "live", campaign: "c1" } }) }).then(j);
		assert.match(q.context, /CPA map request: Explain this ad/);
		assert.match(q.context, /Video A \[a\]/);
		assert.match(q.context, /Note from the user: why/);
		assert.match(q.context, /live=live, campaign=c1/);
		assert.equal((await fetch(`${base}/api/request`, { method: "POST", body: JSON.stringify({ kind: "nope", accountId: "act_123" }) })).status, 400);
		assert.equal((await fetch(`${base}/api/accounts`, { headers: { origin: "http://evil.example" } })).status, 403);
		assert.equal((await fetch(`${base}/api/accounts/act_999`)).status, 404);
	} finally {
		server.close();
		rmSync(home, { recursive: true, force: true });
	}
});
