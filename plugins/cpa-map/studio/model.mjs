// Shared model for the CPA map: turns raw Meta or Google Ads rows into one record per ad, tags format and funnel
// stage, draws the four lines (account CPA, target, kill, scale) and decides kill / scale / revive / test / hold for
// every ad. Used by the CLI and server (Node), by the studio (browser) and by the hosted service, so it imports nothing.

export const SCHEMA = 2;
export const PLATFORMS = {
	meta: { label: "Meta", short: "Meta", prefix: "act_", formats: ["video", "static", "carousel", "unknown"], level: ["Campaign", "Ad set", "Ad"] },
	google: { label: "Google Ads", short: "Google", prefix: "gads_", formats: ["search", "display", "video", "shopping", "demand_gen", "app", "unknown"], level: ["Campaign", "Ad group", "Ad"] },
};
export const FORMAT_LABEL = { video: "Video", static: "Static", carousel: "Carousel", search: "Search", display: "Display", shopping: "Shopping", demand_gen: "Demand Gen", app: "App", unknown: "Unknown" };
export const STAGES = ["tof", "mof", "bof", "unknown"];
export const STAGE_LABEL = { tof: "TOF", mof: "MOF", bof: "BOF", unknown: "Untagged" };
export const ACTIONS = ["kill", "scale", "revive", "test", "hold", "off"];
export const ACTION_LABEL = { kill: "Kill", scale: "Scale", revive: "Revive", test: "Testing", hold: "Hold", off: "Not live" };
// Conversions the map understands. "conversion" is Google's primary-conversion total (every action marked primary).
export const CONVERSIONS = ["purchase", "add_to_cart", "initiate_checkout", "complete_registration", "lead", "conversion"];
export const CONVERSION_LABEL = { purchase: "purchase", add_to_cart: "add-to-cart", initiate_checkout: "checkout", complete_registration: "sign-up", lead: "lead", conversion: "conversion" };
export const platformOf = (id) => (String(id ?? "").startsWith("gads_") ? "google" : "meta");
export const okAccountId = (id) => (/^act_\d{3,20}$/.test(id ?? "") || /^gads_\d{6,12}$/.test(id ?? "") ? id : null);

export const DEFAULT_SETTINGS = Object.freeze({
	targetPct: 0.15, // target CPA this far under the current blended account CPA
	killMult: 1.5, // kill line = killMult × target
	scaleMult: 0.7, // scale line = scaleMult × target
	capMult: 5, // ads with CPA above capMult × target are drawn off the chart
	minSpend: 100, // lifetime spend needed to be on the map at all
	liveDays: 30, // "live" = spent anything in this many days
	cpaBasis: "live", // "live": blended CPA over the live window; "lifetime": over everything pulled
	primary: "", // the conversion CPA is measured on; "" = purchase on Meta, Google's primary conversions on Google
	secondary: "", // the cheaper, earlier conversion (add-to-cart) for TOF grading; "" = pick the best available
	testBudget: 0, // spend under which a live ad is still testing; 0 = 3 × target CPA
	aov: 0, // average order value; 0 = conversion value ÷ conversions across the account
	minRevivePurchases: 3,
	gradeTofBySecondary: false, // step 8: judge TOF ads on cost per secondary conversion
	overrides: {}, // adId -> { format, stage, oneOff }
	decisions: {}, // adId -> kill | scale | revive | keep (manual calls that beat the rules)
	notes: "", // free text the exports carry (context for whoever reads the readout)
});

const num = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? 0 : Number(v));
const lower = (s) => String(s ?? "").toLowerCase();
const zero = () => Object.fromEntries(CONVERSIONS.map((t) => [t, 0]));

// Find the array of rows inside whatever shape an MCP result arrived in (Meta insights rows or GAQL rows).
export function rowsOf(raw) {
	const seen = new Set();
	const isRow = (x) => x && typeof x === "object" && !Array.isArray(x) && ("ad_id" in x || "spend" in x || "ad_group_ad" in x || "campaign" in x || "customer" in x || "id" in x);
	const walk = (v) => {
		if (!v || typeof v !== "object" || seen.has(v)) return null;
		seen.add(v);
		if (Array.isArray(v)) {
			if (v.length && v.every((x) => x && typeof x === "object" && !Array.isArray(x)) && v.some(isRow)) return v;
			for (const x of v) {
				const r = walk(x);
				if (r) return r;
			}
			return null;
		}
		for (const k of ["results", "result", "data", "rows"]) if (k in v) {
			const r = walk(v[k]);
			if (r) return r;
		}
		for (const x of Object.values(v)) {
			const r = walk(x);
			if (r) return r;
		}
		return null;
	};
	return walk(raw) ?? [];
}

// Count of one Meta action type on a row. Meta reports "purchase" as the rolled-up total alongside its pixel / onsite
// parts, so the exact type wins; only when it is absent do we take the largest part (never the sum, which double counts).
export function actionCount(row, type, key = "actions") {
	const list = Array.isArray(row?.[key]) ? row[key] : [];
	const exact = list.find((a) => a.action_type === type);
	if (exact) return num(exact.value);
	return Math.max(0, ...list.filter((a) => lower(a.action_type).split(".").pop().endsWith(type)).map((a) => num(a.value)));
}

// Format from the ad name first, then the ad set and campaign names. Patterns are deliberately generous: the user can
// override any ad in the studio, and Claude can retag from the creative itself.
export function tagFormat(name, adsetName = "", campaignName = "") {
	const own = lower(name);
	if (/carousel|\bcrsl?\b|\bcar\b|multi.?card|\bdpa\b|catalog/.test(own)) return "carousel";
	if (/video|\bvid\b|\bvd\b|\bugc\b|reel|9x16|16x9|talking.?head|founder|cinematic|testimonial|\bcut ?\d|\bv\d{1,2}\b|film|motion|anim|voice.?over|\bvo\b|facetime|interview|^@|\s@\w/.test(own)) return "video";
	if (/static|image|\bimg\b|\bst\b|\bstc\b|photo|banner|\bgif\b|screenshot|graphic|design|\bpic\b|illustration|poster|quote|meme|headline/.test(own)) return "static";
	const ctx = lower(`${adsetName} ${campaignName}`);
	if (/carousel/.test(ctx)) return "carousel";
	if (/video|ugc|reel|cinematic|founder/.test(ctx)) return "video";
	if (/static|image/.test(ctx)) return "static";
	return "unknown";
}
// Google ads carry their type; the campaign's channel is the fallback.
const GOOGLE_TYPE = [["search", /SEARCH|TEXT_AD|CALL_ONLY|CALL_AD|DYNAMIC_SEARCH/], ["display", /DISPLAY|IMAGE_AD|HTML5|GMAIL|RESPONSIVE_DISPLAY/], ["video", /VIDEO|BUMPER|IN_STREAM|IN_FEED/], ["shopping", /SHOPPING|PRODUCT/], ["demand_gen", /DEMAND_GEN|DISCOVERY/], ["app", /APP_/]];
const GOOGLE_CHANNEL = { SEARCH: "search", DISPLAY: "display", VIDEO: "video", SHOPPING: "shopping", DEMAND_GEN: "demand_gen", DISCOVERY: "demand_gen", MULTI_CHANNEL: "app", PERFORMANCE_MAX: "shopping", LOCAL: "search", SMART: "search" };
export function tagGoogleFormat(adType, channel) {
	const t = String(adType ?? "").toUpperCase();
	for (const [f, re] of GOOGLE_TYPE) if (re.test(t)) return f;
	return GOOGLE_CHANNEL[String(channel ?? "").toUpperCase()] ?? "unknown";
}
export const GOOGLE_TYPE_LABEL = (t) => String(t ?? "").toLowerCase().replace(/_/g, " ").replace(/\bad\b/, "ad").replace(/^./, (c) => c.toUpperCase());

const STAGE_RULES = [
	["bof", /\bbof\b|bottom|retarget|\brt\b|remarket|rmk|rlsa|\bcart\b|checkout|site.?visit|visitors|engagers|customer|winback|win.?back|subscri|hot\b|closing|last.?click|\bbrand\b|branded|navigational/],
	["mof", /\bmof\b|mid.?funnel|middle|warm|engag|video.?view|viewers|consider|nurtur|conquest|competitor|comparison|\bvs\b/],
	["tof", /\btof\b|top.?of.?funnel|prospect|\bacq\b|acquisition|cold|broad|awareness|discovery|lookalike|\blal\b|interest|new.?audience|reach|scaling|non.?brand|\bnb\b|generic|\bdsa\b/],
];
export function tagStage(name, adsetName = "", campaignName = "") {
	for (const text of [name, adsetName, campaignName]) {
		const t = lower(text);
		for (const [stage, re] of STAGE_RULES) if (re.test(t)) return stage;
	}
	return "unknown";
}

// One-offs (promos, launches, seasonal) are not candidates for turning back on.
export const ONE_OFF = /promo|launch|bfcm|black.?friday|cyber|boxing|holiday|xmas|christmas|new.?year|valentine|mother|father|easter|halloween|summer.?sale|flash|% ?off|\bsale\b|discount|coupon|giveaway|webinar|event|announcement|boost/i;
export const isOneOff = (...names) => names.some((n) => ONE_OFF.test(String(n ?? "")));

// --- Meta ---
// Lifetime rows may arrive split across several files (yearly windows): merge them per ad.
export function mergeRows(rowSets) {
	const byAd = new Map();
	for (const rows of rowSets) for (const r of rows) {
		if (!r?.ad_id) continue;
		const cur = byAd.get(r.ad_id);
		if (!cur) {
			byAd.set(r.ad_id, { ...r, actions: [...(r.actions ?? [])], action_values: [...(r.action_values ?? [])] });
			continue;
		}
		for (const k of ["spend", "impressions", "clicks", "reach"]) cur[k] = String(num(cur[k]) + num(r[k]));
		for (const key of ["actions", "action_values"]) {
			const list = cur[key];
			for (const a of r[key] ?? []) {
				const hit = list.find((x) => x.action_type === a.action_type);
				if (hit) hit.value = String(num(hit.value) + num(a.value));
				else list.push({ ...a });
			}
		}
		if (r.date_start && (!cur.date_start || r.date_start < cur.date_start)) cur.date_start = r.date_start;
		if (r.date_stop && (!cur.date_stop || r.date_stop > cur.date_stop)) cur.date_stop = r.date_stop;
		if (!cur.ad_name && r.ad_name) Object.assign(cur, { ad_name: r.ad_name, adset_name: r.adset_name, campaign_name: r.campaign_name });
	}
	return [...byAd.values()];
}

// One record per ad from Meta lifetime rows, with the live-window and last-7-day rows joined on.
export function buildMeta({ account, lifetime, live, last7 = [], campaigns = [], liveDays = DEFAULT_SETTINGS.liveDays, builtAt = new Date().toISOString() }) {
	const liveBy = new Map(live.map((r) => [r.ad_id, r]));
	const weekBy = new Map(last7.map((r) => [r.ad_id, r]));
	const campBy = new Map(campaigns.map((c) => [c.id, c]));
	const conv = (r) => Object.fromEntries(CONVERSIONS.map((t) => [t, t === "conversion" ? 0 : actionCount(r, t)]));
	let since = null, until = null;
	const ads = lifetime
		.filter((r) => r.ad_id)
		.map((r) => {
			const l = liveBy.get(r.ad_id), w = weekBy.get(r.ad_id), c = campBy.get(r.campaign_id);
			if (r.date_start && (!since || r.date_start < since)) since = r.date_start;
			if (r.date_stop && (!until || r.date_stop > until)) until = r.date_stop;
			return {
				id: r.ad_id, name: r.ad_name ?? r.ad_id, campaignId: r.campaign_id ?? "", campaignName: r.campaign_name ?? "", adsetId: r.adset_id ?? "", adsetName: r.adset_name ?? "",
				campaignStatus: c?.effective_status ?? "", objective: c?.objective ?? "", channel: "", status: "",
				spend: num(r.spend), impressions: num(r.impressions), clicks: num(r.clicks),
				conversions: conv(r), values: Object.fromEntries(CONVERSIONS.map((t) => [t, t === "conversion" ? 0 : actionCount(r, t, "action_values")])),
				spendLive: num(l?.spend), conversionsLive: l ? conv(l) : zero(), spend7: num(w?.spend),
				format: tagFormat(r.ad_name, r.adset_name, r.campaign_name), stage: tagStage(r.ad_name, r.adset_name, r.campaign_name),
				oneOff: isOneOff(r.ad_name, r.adset_name, r.campaign_name),
			};
		})
		.sort((a, b) => b.spend - a.spend);
	const liveWindow = live.find((r) => r.date_start) ?? {};
	return { schema: SCHEMA, platform: "meta", account, builtAt, window: { since, until }, live: { days: liveDays, since: liveWindow.date_start ?? null, until: liveWindow.date_stop ?? null }, ads };
}

// --- Google Ads ---
// Conversion action categories folded into the map's buckets. Everything else stays in "conversion" only.
const GOOGLE_CATEGORY = { PURCHASE: "purchase", ADD_TO_CART: "add_to_cart", BEGIN_CHECKOUT: "initiate_checkout", SIGNUP: "complete_registration", SUBSCRIBE_PAID: "purchase", LEAD: "lead", SUBMIT_LEAD_FORM: "lead", BOOK_APPOINTMENT: "lead", REQUEST_QUOTE: "lead", CONTACT: "lead", PHONE_CALL_LEAD: "lead", IMPORTED_LEAD: "lead", QUALIFIED_LEAD: "lead", CONVERTED_LEAD: "lead", GET_DIRECTIONS: "lead" };
// GAQL rows come snake_case from the Google Ads client libraries and camelCase from the REST JSON (Composio), so each
// segment is tried both ways: metrics.cost_micros also reads metrics.costMicros.
const camel = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const gid = (r, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k] !== undefined ? o[k] : o[camel(k)]), r);
const adKey = (r) => String(gid(r, "ad_group_ad.ad.id") ?? gid(r, "adGroupAd.ad.id") ?? "");
// One record per ad from GAQL rows: lifetime (no date clause), live window, last 7 days, conversions by action
// category, campaigns, and the customer row. Money is in micros.
export function buildGoogle({ account, lifetime, live = [], last7 = [], conversions = [], campaigns = [], liveDays = DEFAULT_SETTINGS.liveDays, builtAt = new Date().toISOString(), today = new Date().toISOString().slice(0, 10) }) {
	const sumBy = (rows) => {
		const m = new Map();
		for (const r of rows) {
			const k = adKey(r);
			if (!k) continue;
			const cur = m.get(k) ?? { cost: 0, conv: 0, value: 0, impressions: 0, clicks: 0 };
			cur.cost += num(gid(r, "metrics.cost_micros")) / 1e6;
			cur.conv += num(gid(r, "metrics.conversions"));
			cur.value += num(gid(r, "metrics.conversions_value"));
			cur.impressions += num(gid(r, "metrics.impressions"));
			cur.clicks += num(gid(r, "metrics.clicks"));
			m.set(k, cur);
		}
		return m;
	};
	const liveBy = sumBy(live), weekBy = sumBy(last7);
	const campBy = new Map(campaigns.map((c) => [String(gid(c, "campaign.id") ?? c.id ?? ""), c]));
	const buckets = new Map();
	for (const r of conversions) {
		const k = adKey(r), cat = String(gid(r, "segments.conversion_action_category") ?? "").toUpperCase();
		const b = GOOGLE_CATEGORY[cat];
		if (!k || !b) continue;
		const cur = buckets.get(k) ?? { conv: zero(), values: zero() };
		cur.conv[b] += num(gid(r, "metrics.all_conversions") || gid(r, "metrics.conversions"));
		cur.values[b] += num(gid(r, "metrics.conversions_value"));
		buckets.set(k, cur);
	}
	const seen = new Map();
	for (const r of lifetime) {
		const id = adKey(r);
		if (!id) continue;
		const cur = seen.get(id);
		const cost = num(gid(r, "metrics.cost_micros")) / 1e6;
		if (cur) {
			cur.spend += cost;
			cur.impressions += num(gid(r, "metrics.impressions"));
			cur.clicks += num(gid(r, "metrics.clicks"));
			cur.conversions.conversion += num(gid(r, "metrics.conversions"));
			cur.values.conversion += num(gid(r, "metrics.conversions_value"));
			continue;
		}
		const campaignId = String(gid(r, "campaign.id") ?? ""), c = campBy.get(campaignId);
		const type = gid(r, "ad_group_ad.ad.type") ?? gid(r, "ad_group_ad.ad.type_") ?? "";
		const channel = gid(r, "campaign.advertising_channel_type") ?? gid(c, "campaign.advertising_channel_type") ?? "";
		const adsetName = gid(r, "ad_group.name") ?? "", campaignName = gid(r, "campaign.name") ?? "";
		const name = gid(r, "ad_group_ad.ad.name") || `${GOOGLE_TYPE_LABEL(type) || "Ad"} ${id.slice(-6)} · ${adsetName}`;
		const b = buckets.get(id) ?? { conv: zero(), values: zero() };
		const l = liveBy.get(id), w = weekBy.get(id);
		seen.set(id, {
			id, name, campaignId, campaignName, adsetId: String(gid(r, "ad_group.id") ?? ""), adsetName,
			campaignStatus: gid(r, "campaign.status") ?? gid(c, "campaign.status") ?? "", objective: String(channel), channel: String(channel), status: gid(r, "ad_group_ad.status") ?? "",
			spend: cost, impressions: num(gid(r, "metrics.impressions")), clicks: num(gid(r, "metrics.clicks")),
			conversions: { ...b.conv, conversion: num(gid(r, "metrics.conversions")) }, values: { ...b.values, conversion: num(gid(r, "metrics.conversions_value")) },
			spendLive: l?.cost ?? 0, conversionsLive: { ...zero(), conversion: l?.conv ?? 0 }, spend7: w?.cost ?? 0,
			format: tagGoogleFormat(type, channel), stage: tagStage(name, adsetName, campaignName), oneOff: isOneOff(name, adsetName, campaignName),
		});
	}
	const ads = [...seen.values()].sort((a, b) => b.spend - a.spend);
	const d = new Date(today);
	const liveSince = new Date(d.getTime() - liveDays * 864e5).toISOString().slice(0, 10);
	return { schema: SCHEMA, platform: "google", account, builtAt, window: { since: null, until: today }, live: { days: liveDays, since: liveSince, until: today }, ads };
}

export const normalizeSettings = (s) => {
	const out = { ...DEFAULT_SETTINGS, ...(s && typeof s === "object" ? s : {}) };
	for (const k of ["targetPct", "killMult", "scaleMult", "capMult", "minSpend", "liveDays", "testBudget", "aov", "minRevivePurchases"]) out[k] = Math.max(0, num(out[k]));
	if (!(out.targetPct > 0 && out.targetPct < 1)) out.targetPct = DEFAULT_SETTINGS.targetPct;
	if (!(out.killMult > 1)) out.killMult = DEFAULT_SETTINGS.killMult;
	if (!(out.scaleMult > 0 && out.scaleMult < 1)) out.scaleMult = DEFAULT_SETTINGS.scaleMult;
	if (!(out.capMult > out.killMult)) out.capMult = Math.max(DEFAULT_SETTINGS.capMult, out.killMult + 1);
	if (out.primary && !CONVERSIONS.includes(out.primary)) out.primary = "";
	if (out.secondary && !CONVERSIONS.includes(out.secondary)) out.secondary = "";
	out.cpaBasis = out.cpaBasis === "lifetime" ? "lifetime" : "live";
	out.overrides = out.overrides && typeof out.overrides === "object" ? out.overrides : {};
	out.decisions = out.decisions && typeof out.decisions === "object" ? out.decisions : {};
	out.notes = String(out.notes ?? "").slice(0, 4000);
	return out;
};

const total = (ads, t) => ads.reduce((s, a) => s + (a.conversions?.[t] ?? 0), 0);
// Primary conversion: purchases when the account records them, else Google's primary conversions, else sign-ups or leads.
export function pickPrimary(ads, platform) {
	if (total(ads, "purchase") > 0) return "purchase";
	if (platform === "google" && total(ads, "conversion") > 0) return "conversion";
	return ["complete_registration", "lead", "conversion", "initiate_checkout", "add_to_cart"].find((t) => total(ads, t) > 0) ?? (platform === "google" ? "conversion" : "purchase");
}
// Secondary: the earliest funnel event the account actually records, other than the primary.
export function pickSecondary(ads, primary) {
	return ["add_to_cart", "initiate_checkout", "complete_registration", "lead", "purchase"].find((t) => t !== primary && total(ads, t) > 0) ?? "";
}

// Everything the chart, the tables and the exports need: lines, per-ad metrics and the action each ad gets.
export function analyse(data, rawSettings) {
	const s = normalizeSettings(rawSettings);
	const platform = data.platform ?? "meta";
	const P = s.primary || pickPrimary(data.ads, platform), S = s.secondary || pickSecondary(data.ads, P);
	const all = data.ads.map((a) => ({ ...a, ...(s.overrides[a.id] ?? {}) }));
	const onMap = all.filter((a) => a.spend >= s.minSpend);
	const sum = (list, f) => list.reduce((t, a) => t + f(a), 0);
	const liveAds = all.filter((a) => a.spendLive > 0);
	const liveConv = (a, t) => (platform === "google" && t !== "conversion" ? 0 : a.conversionsLive?.[t] ?? 0);
	const basisLive = s.cpaBasis === "live" && sum(liveAds, (a) => liveConv(a, P)) > 0;
	const basis = basisLive ? liveAds : all;
	const spendOf = (a) => (basisLive ? a.spendLive : a.spend);
	const convOf = (a, t) => (basisLive ? liveConv(a, t) : a.conversions[t]);
	const accountCpa = sum(basis, (a) => convOf(a, P)) ? sum(basis, spendOf) / sum(basis, (a) => convOf(a, P)) : 0;
	const secBasis = S && sum(all, (a) => a.conversions[S]) ? all : [];
	const accountCps = secBasis.length ? sum(secBasis, (a) => a.spend) / sum(secBasis, (a) => a.conversions[S]) : 0;
	const linesFor = (base) => ({ account: base, target: base * (1 - s.targetPct), kill: base * (1 - s.targetPct) * s.killMult, scale: base * (1 - s.targetPct) * s.scaleMult, cap: base * (1 - s.targetPct) * s.capMult });
	const lines = linesFor(accountCpa), linesSecondary = linesFor(accountCps);
	const pConv = sum(all, (a) => a.conversions[P]), pValue = sum(all, (a) => a.values[P]);
	const aov = s.aov || (pConv ? pValue / pConv : 0);
	const testBudget = s.testBudget || 3 * lines.target;
	const cur = data.account?.currency ?? "USD";

	const ads = onMap.map((a) => {
		const conv = a.conversions[P], cpa = conv ? a.spend / conv : null;
		const sec = S ? a.conversions[S] : 0, cps = sec ? a.spend / sec : null;
		const live = a.spendLive > 0;
		const gradeBySecondary = s.gradeTofBySecondary && a.stage === "tof" && S;
		const metric = gradeBySecondary ? cps : cpa, L = gradeBySecondary ? linesSecondary : lines, n = gradeBySecondary ? sec : conv;
		const unit = CONVERSION_LABEL[gradeBySecondary ? S : P];
		let action, reason;
		const manual = s.decisions[a.id];
		if (manual === "keep") [action, reason] = [live ? "hold" : "off", "Kept by hand"];
		else if (manual && ACTIONS.includes(manual)) [action, reason] = [manual, "Called by hand"];
		else if (live) {
			if (n === 0 && aov && a.spend > 0.5 * aov) [action, reason] = ["kill", `No ${unit}s after ${fmtMoney(a.spend, cur)} (more than half the AOV)`];
			else if (metric != null && metric > L.kill && a.spend > testBudget) [action, reason] = ["kill", `Above the kill line with ${fmtMoney(a.spend, cur)} spent, past the test budget`];
			else if (metric != null && metric <= L.scale) [action, reason] = ["scale", "Under the scale line: raise budget 20% at a time, add variants and placements, stop when it crosses target"];
			else if (a.spend <= testBudget) [action, reason] = ["test", "Inside the test budget: leave it to gather data"];
			else [action, reason] = ["hold", "Between the scale and kill lines"];
		} else if (n >= s.minRevivePurchases && metric != null && metric <= L.scale && !a.oneOff) [action, reason] = ["revive", `Paused winner: ${n} ${unit}s under the scale line`];
		else if (n >= s.minRevivePurchases && metric != null && metric <= L.scale && a.oneOff) [action, reason] = ["off", "Under the scale line but looks like a one-off (promo or launch)"];
		else [action, reason] = ["off", "Not live"];
		return { ...a, conv, cpa, sec, cps, live, action, reason, manual: manual ?? "", gradeBySecondary: !!gradeBySecondary };
	});
	const counts = Object.fromEntries(ACTIONS.map((k) => [k, ads.filter((a) => a.action === k).length]));
	const campaigns = [...new Map(ads.map((a) => [a.campaignId, { id: a.campaignId, name: a.campaignName, status: a.campaignStatus, spend: 0, ads: 0, live: 0 }])).values()];
	for (const a of ads) {
		const c = campaigns.find((x) => x.id === a.campaignId);
		c.spend += a.spend; c.ads++; if (a.live) c.live++;
	}
	campaigns.sort((a, b) => b.live - a.live || b.spend - a.spend);
	const adsets = [...new Map(ads.map((a) => [a.adsetId, { id: a.adsetId, name: a.adsetName, campaignId: a.campaignId, spend: 0, ads: 0 }])).values()];
	for (const a of ads) {
		const g = adsets.find((x) => x.id === a.adsetId);
		g.spend += a.spend; g.ads++;
	}
	adsets.sort((a, b) => b.spend - a.spend);
	return { platform, settings: s, primary: P, secondary: S, lines, linesSecondary, aov, testBudget, basis: basisLive ? "live" : "lifetime", ads, counts, hidden: all.length - onMap.length, campaigns, adsets, formats: PLATFORMS[platform].formats };
}

// Like-with-like: per format and per stage, the best and worst live ads and the spread between them.
export function compareGroups(result, key = "format") {
	const groups = {};
	for (const a of result.ads) (groups[a[key]] ??= []).push(a);
	return Object.entries(groups).map(([k, list]) => {
		const withCpa = list.filter((a) => a.cpa != null).sort((a, b) => a.cpa - b.cpa);
		const spend = list.reduce((s, a) => s + a.spend, 0), conv = list.reduce((s, a) => s + a.conv, 0);
		return { key: k, ads: list.length, live: list.filter((a) => a.live).length, spend, conv, cpa: conv ? spend / conv : null, best: withCpa[0] ?? null, worst: withCpa[withCpa.length - 1] ?? null, kills: list.filter((a) => a.action === "kill").length, scales: list.filter((a) => a.action === "scale").length, revives: list.filter((a) => a.action === "revive").length };
	}).sort((a, b) => b.spend - a.spend);
}

export function fmtMoney(v, currency = "USD", digits) {
	if (v == null || !Number.isFinite(v)) return "—";
	const d = digits ?? (Math.abs(v) >= 1000 ? 0 : 2);
	try {
		return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: d, minimumFractionDigits: d }).format(v);
	} catch {
		return `${currency} ${v.toFixed(d)}`;
	}
}
export const fmtInt = (n) => Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
export const fmtPct = (v) => (v == null || !Number.isFinite(v) ? "—" : `${Math.round(v * 100)}%`);

// Rows for the action CSV and the request Claude receives.
export const ACTION_ORDER = { kill: 0, scale: 1, revive: 2, test: 3, hold: 4, off: 5 };
export function actionRows(result) {
	return [...result.ads].sort((a, b) => ACTION_ORDER[a.action] - ACTION_ORDER[b.action] || b.spend - a.spend).map((a) => ({
		action: a.action, ad_id: a.id, ad: a.name, campaign: a.campaignName, ad_set: a.adsetName, format: a.format, stage: a.stage, live: a.live ? "yes" : "no",
		spend: a.spend.toFixed(2), [result.primary + "s"]: a.conv, cpa: a.cpa == null ? "" : a.cpa.toFixed(2), ...(result.secondary ? { [result.secondary + "s"]: a.sec, ["cost_per_" + result.secondary]: a.cps == null ? "" : a.cps.toFixed(2) } : {}),
		spend_live_window: a.spendLive.toFixed(2), reason: a.reason,
	}));
}
export const toCsv = (rows) => {
	if (!rows.length) return "";
	const cols = Object.keys(rows[0]);
	const cell = (v) => (/[",\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));
	return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
};
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
