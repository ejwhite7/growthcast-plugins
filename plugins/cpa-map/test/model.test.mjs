import { test } from "node:test";
import assert from "node:assert/strict";
import { actionCount, actionRows, analyse, buildGoogle, buildMeta, compareGroups, mergeRows, rollup, rowsOf, tagFormat, tagGoogleFormat, tagStage, toCsv } from "../studio/model.mjs";
import { actionPlanMarkdown, auditMarkdown, narrative } from "../studio/narrative.mjs";
import { renderChart } from "../studio/chart.mjs";
import { renderReport } from "../studio/report.mjs";
import { renderSlides } from "../studio/slides.mjs";

const row = (id, name, spend, purchases, atc = 0, extra = {}) => ({ ad_id: id, ad_name: name, adset_id: "as1", adset_name: "Broad", campaign_id: "c1", campaign_name: "[US] ACQ | Prospecting", spend: String(spend), impressions: "1000", clicks: "50", actions: [{ action_type: "purchase", value: String(purchases) }, { action_type: "offsite_conversion.fb_pixel_purchase", value: String(purchases) }, { action_type: "add_to_cart", value: String(atc) }], action_values: [{ action_type: "purchase", value: String(purchases * 80) }], date_start: "2024-01-01", date_stop: "2026-10-27", ...extra });

test("rowsOf finds rows in any MCP result shape and actionCount prefers the rolled-up type", () => {
	const r = row("1", "x", 10, 2);
	assert.equal(rowsOf({ result: [r] }).length, 1);
	assert.equal(rowsOf({ results: [{ tool_id: "t", result: { result: [r] } }] }).length, 1);
	assert.equal(rowsOf({ results: [{ campaign: { id: "1" }, ad_group_ad: { ad: { id: "9" } }, metrics: {} }], row_count: 1 }).length, 1, "GAQL shape");
	assert.equal(actionCount(r, "purchase"), 2, "exact type, not the sum with the pixel part");
	assert.equal(actionCount({ actions: [{ action_type: "offsite_conversion.fb_pixel_purchase", value: "3" }] }, "purchase"), 3, "falls back to the dotted part");
});

test("tags: format and stage from names, ad name beats campaign; Google types", () => {
	assert.equal(tagFormat("TOF - Founder Video Cut 2 9x16"), "video");
	assert.equal(tagFormat("@creator_handle 2", "", "Cinematic UGC"), "video");
	assert.equal(tagFormat("BOF-Feed-Social-Proof-Static"), "static");
	assert.equal(tagFormat("Spring Carousel v3"), "carousel");
	assert.equal(tagFormat("Noelle Skeptic"), "unknown");
	assert.equal(tagStage("BOF - jan 20 - James", "Winner / Control", "[US] ACQ | Primary"), "bof");
	assert.equal(tagStage("@creator", "Broad | Business Owners", "ACQ"), "tof");
	assert.equal(tagStage("@creator", "Site visitors 30d", "RT | Subscriptions"), "bof");
	assert.equal(tagStage("Responsive search ad", "Navigational", "Brand | BlueAlpha | Search"), "bof");
	assert.equal(tagStage("Responsive search ad", "Main", "Search_Nonbrand_Anglosphere"), "tof");
	assert.equal(tagStage("x", "Competitor | Lifesight", "Conquest | Phrase"), "mof");
	assert.equal(tagStage("plain", "plain", "plain"), "unknown");
	assert.equal(tagGoogleFormat("RESPONSIVE_SEARCH_AD", "SEARCH"), "search");
	assert.equal(tagGoogleFormat("VIDEO_RESPONSIVE_AD", "VIDEO"), "video");
	assert.equal(tagGoogleFormat("", "DEMAND_GEN"), "demand_gen");
});

test("mergeRows sums split windows per ad", () => {
	const merged = mergeRows([[row("1", "a", 100, 1)], [row("1", "a", 50, 2), row("2", "b", 10, 0)]]);
	assert.equal(merged.length, 2);
	const a = merged.find((r) => r.ad_id === "1");
	assert.equal(Number(a.spend), 150);
	assert.equal(actionCount(a, "purchase"), 3);
});

const metaFixture = () => {
	// Live window: 2,000 spend, 10 purchases -> account CPA 200, target 170, kill 255, scale 119.
	const lifetime = [
		row("kill", "Video A", 3000, 5), // CPA 600, live, past test budget -> kill
		row("scale", "Video B", 2000, 40), // CPA 50 -> scale
		row("hold", "Static C", 2000, 11), // CPA 182 -> hold
		row("test", "Static D", 150, 1), // CPA 150, between the lines, under the test budget -> test
		row("nopurch", "Static E", 900, 0), // live, zero purchases, > half AOV (80/2=40) -> kill
		row("revive", "Carousel F", 1000, 12, 0, { campaign_id: "c2", campaign_name: "[US] RT | Visitors", adset_id: "as2", adset_name: "Visitors 30d" }), // not live, CPA 83 < scale -> revive
		row("promo", "BFCM Promo Video", 1000, 12), // one-off -> off
		row("tiny", "Static G", 50, 1), // under min spend -> hidden
	];
	const live = [row("kill", "Video A", 500, 2), row("scale", "Video B", 500, 3), row("hold", "Static C", 500, 3), row("test", "Static D", 150, 0), row("nopurch", "Static E", 350, 2)];
	return buildMeta({ account: { id: "act_1", name: "T", currency: "USD" }, lifetime, live, campaigns: [{ id: "c1", effective_status: "ACTIVE", objective: "OUTCOME_SALES" }] });
};

test("analyse (Meta) draws the lines and calls kill / scale / revive / test / hold; rollups and overrides", () => {
	const data = metaFixture();
	assert.equal(data.platform, "meta");
	assert.equal(data.ads.length, 8);
	assert.equal(data.ads.find((a) => a.id === "kill").campaignStatus, "ACTIVE");
	const r = analyse(data, {});
	assert.equal(r.primary, "purchase");
	assert.equal(r.secondary, "", "no add-to-carts recorded");
	assert.equal(r.hidden, 1);
	assert.equal(Math.round(r.lines.account), 200);
	assert.equal(Math.round(r.lines.target), 170);
	assert.equal(Math.round(r.lines.kill), 255);
	assert.equal(Math.round(r.lines.scale), 119);
	const by = Object.fromEntries(r.ads.map((a) => [a.id, a.action]));
	assert.deepEqual(by, { kill: "kill", scale: "scale", hold: "hold", test: "test", nopurch: "kill", revive: "revive", promo: "off" });
	assert.equal(r.campaigns.length, 2);
	assert.equal(r.campaigns[0].id, "c1", "campaign with live ads first");
	assert.equal(r.adsets.length, 2);
	const r2 = analyse(data, { decisions: { kill: "keep" }, overrides: { hold: { format: "video" } } });
	assert.equal(r2.ads.find((a) => a.id === "kill").action, "hold");
	assert.equal(r2.ads.find((a) => a.id === "hold").format, "video");
	assert.notEqual(Math.round(analyse(data, { cpaBasis: "lifetime" }).lines.account), 200);
	const csv = toCsv(actionRows(r));
	assert.match(csv.split("\n")[0], /^action,ad_id,ad,campaign/);
	assert.equal(csv.split("\n").length, 8);
	const groups = compareGroups(r, "format");
	assert.ok(groups.find((g) => g.key === "video").best.id === "scale");
});

const gRow = (id, camp, group, type, cost, conv, value, status = "ENABLED") => ({ campaign: { id: camp[0], name: camp[1], status: "ENABLED", advertising_channel_type: "SEARCH" }, ad_group: { id: group[0], name: group[1] }, ad_group_ad: { status, ad: { id, type_: type } }, metrics: { cost_micros: String(cost * 1e6), impressions: "100", clicks: "10", conversions: conv, conversions_value: value } });
test("buildGoogle: micros to money, ad types to formats, conversion categories to buckets, live from the window", () => {
	const lifetime = [gRow("a1", ["c1", "Brand | Search"], ["g1", "Navigational"], "RESPONSIVE_SEARCH_AD", 1000, 10, 1500), gRow("a2", ["c2", "NB | Generic"], ["g2", "Main"], "RESPONSIVE_SEARCH_AD", 3000, 2, 300), gRow("a3", ["c3", "Video"], ["g3", "YT"], "VIDEO_RESPONSIVE_AD", 500, 0, 0, "PAUSED")];
	const live = [gRow("a1", ["c1"], ["g1"], "", 200, 2, 300), gRow("a2", ["c2"], ["g2"], "", 600, 0, 0)];
	const conversions = [{ ad_group_ad: { ad: { id: "a1" } }, segments: { conversion_action_category: "SUBMIT_LEAD_FORM" }, metrics: { conversions: 4, all_conversions: 4, conversions_value: 0 } }, { ad_group_ad: { ad: { id: "a1" } }, segments: { conversion_action_category: "PURCHASE" }, metrics: { conversions: 6, all_conversions: 6, conversions_value: 1500 } }];
	const data = buildGoogle({ account: { id: "gads_1", name: "G", currency: "USD" }, lifetime, live, conversions, today: "2026-10-27" });
	assert.equal(data.platform, "google");
	assert.equal(data.live.since, "2026-09-27");
	const a1 = data.ads.find((a) => a.id === "a1");
	assert.equal(a1.spend, 1000);
	assert.equal(a1.conversions.conversion, 10);
	assert.equal(a1.conversions.purchase, 6);
	assert.equal(a1.conversions.lead, 4);
	assert.equal(a1.format, "search");
	assert.equal(a1.stage, "bof");
	assert.equal(a1.spendLive, 200);
	assert.equal(data.ads.find((a) => a.id === "a3").format, "video");
	assert.equal(data.ads.find((a) => a.id === "a3").spendLive, 0);
	const r = analyse(data, {});
	assert.equal(r.primary, "purchase", "purchases exist, so CPA is on purchases");
	const r2 = analyse(data, { primary: "conversion" });
	assert.equal(r2.primary, "conversion");
	assert.equal(Math.round(r2.lines.account), 400, "live: 800 spend / 2 conversions");
	assert.deepEqual(r2.formats.slice(0, 2), ["search", "display"]);
});

test("narrative, report and slides render from the analysis", () => {
	const data = metaFixture();
	const r = analyse(data, {});
	const n = narrative(r, data);
	assert.match(n.headline, /T: 2 kills, 1 ad to scale, 1 paused winner/);
	assert.equal(n.plan.sections[0].groups.length, 1, "kills grouped by campaign");
	const plan = actionPlanMarkdown(r, data);
	assert.match(plan, /## 1\. Kill \(2\)/);
	assert.match(plan, /- \[ \] \*\*Pause\*\* · Video A/);
	const audit = auditMarkdown(r, data);
	assert.match(audit, /## Like with like: formats/);
	assert.match(audit, /\| Video \|/);
	const svg = renderChart(r, "USD", { shown: (a) => a.live, hideOthers: true });
	assert.equal((svg.match(/class="dot/g) || []).length, 5, "hidden ads are not drawn");
	assert.match(svg, /kill line/);
	const html = renderReport(r, data, { tokens: ":root{}" });
	assert.match(html, /<title>T · CPA map<\/title>/);
	assert.match(html, /Action plan: this week/);
	const deck = renderSlides(r, data, { tokens: ":root{}" });
	assert.equal((deck.match(/class="slide[ "]/g) || []).length, 10);
	assert.match(deck, /Turn 1 paused winner back on/);
});

test("buildGoogle: camelCase REST rows (Composio) read the same as snake_case rows", () => {
	const camel = (v) => (Array.isArray(v) ? v.map(camel) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(x)])) : v);
	const lifetime = [{ campaign: { id: "1", name: "Brand", advertising_channel_type: "SEARCH", status: "ENABLED" }, ad_group: { id: "10", name: "Exact" }, ad_group_ad: { ad: { id: "100", name: "", type: "RESPONSIVE_SEARCH_AD" }, status: "ENABLED" }, metrics: { cost_micros: "250000000", impressions: "1000", clicks: "50", conversions: 5, conversions_value: 500, all_conversions: 5 } }];
	const live = [{ ad_group_ad: { ad: { id: "100" } }, campaign: { id: "1" }, ad_group: { id: "10" }, metrics: { cost_micros: "100000000", impressions: "400", clicks: "20", conversions: 2, conversions_value: 200 } }];
	const a = buildGoogle({ account: { id: "gads_1", name: "G", currency: "USD" }, lifetime, live, today: "2026-10-29" }).ads[0];
	const b = buildGoogle({ account: { id: "gads_1", name: "G", currency: "USD" }, lifetime: camel(lifetime), live: camel(live), today: "2026-10-29" }).ads[0];
	assert.equal(a.spend, 250);
	assert.equal(b.spend, 250);
	assert.equal(b.spendLive, 100);
	assert.equal(b.adsetName, "Exact");
	assert.equal(b.format, a.format);
	assert.equal(b.status, "ENABLED");
});

test("stage goals: fixed target CPA, campaign stage assignment, per-stage basis and target", () => {
	const data = metaFixture();
	const fixed = analyse(data, { targetMode: "cpa", targetCpa: 100 });
	assert.equal(fixed.lines.target, 100);
	assert.equal(fixed.lines.kill, 150);
	const r = analyse(data, { campaignStages: { c2: "tof" }, overrides: { revive: { stage: "bof" } } });
	assert.equal(r.campaigns.find((c) => c.id === "c2").stage, "tof", "campaign assignment beats the name tag");
	assert.equal(r.ads.find((a) => a.id === "revive").stage, "bof", "a per-ad override still wins");
	const r2 = analyse(data, { campaignStages: { c1: "bof" }, stages: { bof: { basis: "primary", target: 60 } } });
	assert.equal(r2.stageLines.bof.target, 60);
	assert.equal(r2.stageLines.bof.kill, 90);
	assert.equal(r2.stageLines.bof.custom, true);
	assert.equal(r2.stageLines.tof.custom, false);
	const hold = r2.ads.find((a) => a.id === "hold");
	assert.equal(hold.stage, "bof");
	assert.equal(hold.action, "kill", "CPA 182 is above the stage's own kill line of 90");
	assert.equal(analyse(data, {}).ads.find((a) => a.id === "hold").action, "hold");
});

test("renderChart: a view narrows the axes, clips ads outside it and reports them; Y log scale", () => {
	const r = analyse(metaFixture(), {});
	const dflt = renderChart(r, "USD");
	assert.match(dflt, /data-ymax="[\d.]+"/);
	assert.match(dflt, /data-outside="0"/);
	const narrow = renderChart(r, "USD", { view: { xmin: 1500, xmax: 3000, ymin: 0, ymax: 100 } });
	assert.match(narrow, /data-xmin="1500" data-xmax="3000"/);
	assert.doesNotMatch(narrow, /data-id="revive"/, "a 1000-spend ad is outside the X range");
	assert.match(narrow, /data-id="scale"/);
	assert.match(narrow, /outside this view/);
	const lg = renderChart(r, "USD", { view: { ylog: true } });
	assert.match(lg, /data-ylog="1"/);
	assert.match(lg, /CPA \(log\)/);
});

test("live needs delivery: a paused campaign or ad set takes its ads out of live even when they spent this month", () => {
	const data = metaFixture();
	// Statuses: the kill ad's campaign is paused, the hold ad's ad set is paused, everything else delivers.
	const statuses = data.ads.map((a) => ({ id: a.id, status: "ACTIVE", effective_status: "ACTIVE", adset: { effective_status: a.id === "hold" ? "PAUSED" : "ACTIVE" }, campaign: { effective_status: a.id === "kill" ? "PAUSED" : "ACTIVE" } }));
	const rebuilt = buildMeta({ account: data.account, lifetime: [], live: [], statuses });
	assert.equal(rebuilt.ads.length, 0, "statuses alone add no ads");
	const withStatus = { ...data, ads: data.ads.map((a) => ({ ...a, campaignStatus: a.id === "kill" ? "PAUSED" : "ACTIVE", adsetStatus: a.id === "hold" ? "PAUSED" : "ACTIVE", status: "ACTIVE" })) };
	const r = analyse(withStatus, {});
	const kill = r.ads.find((a) => a.id === "kill"), hold = r.ads.find((a) => a.id === "hold"), scale = r.ads.find((a) => a.id === "scale");
	assert.equal(kill.live, false);
	assert.equal(kill.paused, "campaign");
	assert.notEqual(kill.action, "kill", "a paused campaign's ad is not a live kill");
	assert.match(kill.reason, /campaign paused/);
	assert.equal(hold.live, false);
	assert.equal(hold.paused, "ad set");
	assert.equal(scale.live, true);
	assert.equal(analyse(data, {}).ads.find((a) => a.id === "kill").live, true, "without statuses, spend decides");
});

test("rollup: campaigns and ad sets graded like ads, with their ads' calls counted", () => {
	const r = analyse(metaFixture(), {});
	const camps = rollup(r, "campaign");
	assert.equal(camps.length, 2);
	const c1 = camps.find((c) => c.key === "c1"), c2 = camps.find((c) => c.key === "c2");
	assert.equal(c1.kind, "campaign");
	assert.equal(c1.ads, r.ads.filter((a) => a.campaignId === "c1").length);
	assert.equal(c1.spend, r.ads.filter((a) => a.campaignId === "c1").reduce((t, a) => t + a.spend, 0));
	assert.equal(c1.counts.kill, r.ads.filter((a) => a.campaignId === "c1" && a.action === "kill").length);
	assert.ok(c1.live);
	assert.equal(c2.live, false, "c2's only ad is paused");
	assert.equal(c2.action, "revive", "the paused campaign has 12 purchases under the scale line");
	const sets = rollup(r, "adset", r.ads.filter((a) => a.campaignId === "c2"));
	assert.equal(sets.length, 1);
	assert.equal(sets[0].id, "adset:as2");
	assert.equal(sets[0].campaignName, "[US] RT | Visitors");
});

test("rowsOf: camelCase GAQL rows with only adGroupAd / metrics / segments are rows (conversion categories)", () => {
	const r = { results: [{ adGroupAd: { ad: { id: "545751871624" } }, metrics: { allConversions: 603, conversions: 603, conversionsValue: 0 }, segments: { conversionActionCategory: "PURCHASE", conversionActionName: "Purchase [GA4, PH]" } }], fieldMask: "x" };
	assert.equal(rowsOf(r).length, 1);
	const lifetime = [{ campaign: { id: "1", name: "Brand", advertisingChannelType: "SEARCH", status: "ENABLED" }, adGroup: { id: "10", name: "Exact", status: "ENABLED" }, adGroupAd: { ad: { id: "545751871624", name: "", type: "RESPONSIVE_SEARCH_AD" }, status: "ENABLED" }, metrics: { costMicros: "250000000", impressions: "1000", clicks: "50", conversions: 5, conversionsValue: 500, allConversions: 700 } }];
	const d = buildGoogle({ account: { id: "gads_1", name: "G", currency: "USD" }, lifetime, conversions: rowsOf(r), today: "2026-10-29" });
	assert.equal(d.ads[0].conversions.purchase, 603, "secondary purchase actions count through all_conversions");
	assert.equal(analyse(d, {}).primary, "purchase");
});

test("Google conversion actions: each ad keeps its per-action counts; settings.googleActions picks which count", () => {
	const row = (id, cat, name, n) => ({ adGroupAd: { ad: { id } }, metrics: { allConversions: n, conversions: n, conversionsValue: 0 }, segments: { conversionActionCategory: cat, conversionActionName: name } });
	const conversions = [row("1", "PURCHASE", "Purchase [GA4, PH]", 100), row("1", "PURCHASE", "Purchase (PH click ID)", 7), row("1", "SIGNUP", "Sign-up (PH click ID)", 9), row("1", "SIGNUP", "DurableGA4 (web) sign_up", 500)];
	const lifetime = [{ campaign: { id: "1", name: "NB", advertisingChannelType: "SEARCH", status: "ENABLED" }, adGroup: { id: "10", name: "G", status: "ENABLED" }, adGroupAd: { ad: { id: "1", type: "RESPONSIVE_SEARCH_AD" }, status: "ENABLED" }, metrics: { costMicros: "700000000", impressions: "1", clicks: "1", conversions: 1, conversionsValue: 0, allConversions: 616 } }];
	const d = buildGoogle({ account: { id: "gads_1", name: "G", currency: "USD" }, lifetime, conversions, today: "2026-10-29" });
	assert.equal(d.conversionActions.length, 4);
	assert.equal(d.conversionActions[0].name, "DurableGA4 (web) sign_up");
	assert.equal(d.ads[0].conversions.purchase, 107);
	const all = analyse(d, {});
	assert.equal(all.ads[0].conv, 107);
	const ph = analyse(d, { googleActions: ["Purchase (PH click ID)", "Sign-up (PH click ID)"] });
	assert.equal(ph.ads[0].conversions.purchase, 7);
	assert.equal(ph.ads[0].conversions.complete_registration, 9);
	assert.equal(ph.ads[0].cpa, 100);
	assert.deepEqual(ph.actionsCounted, ["Purchase (PH click ID)", "Sign-up (PH click ID)"]);
});
