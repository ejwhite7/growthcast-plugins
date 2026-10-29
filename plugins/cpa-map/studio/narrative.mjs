// The words around the map: an action plan the buyer works through, and an account readout (audit) that explains the
// lines, the spread inside each format and stage, the paused winners and the risks. Written from the numbers alone, so
// the exports work without a model; Ask Claude enriches them when asked. Used by the studio, the exports and the CLI.
import { ACTION_LABEL, ACTION_ORDER, CONVERSION_LABEL, FORMAT_LABEL, PLATFORMS, STAGE_LABEL, compareGroups, fmtInt, fmtMoney, fmtPct } from "./model.mjs";

const plural = (n, one, many = `${one}s`) => `${fmtInt(n)} ${n === 1 ? one : many}`;
const share = (part, whole) => (whole ? part / whole : 0);

export function narrative(result, data) {
	const cur = data.account?.currency ?? "USD", m = (v, d) => fmtMoney(v, cur, d);
	const P = CONVERSION_LABEL[result.primary], S = result.secondary ? CONVERSION_LABEL[result.secondary] : "";
	const platform = PLATFORMS[result.platform] ?? PLATFORMS.meta;
	const [, adsetWord] = platform.level.map((x) => x.toLowerCase());
	const ads = result.ads, live = ads.filter((a) => a.live), off = ads.filter((a) => !a.live);
	const by = (k) => ads.filter((a) => a.action === k).sort((a, b) => b.spend - a.spend);
	const kills = by("kill"), scales = by("scale").sort((a, b) => (a.cpa ?? Infinity) - (b.cpa ?? Infinity)), revives = by("revive").sort((a, b) => (a.cpa ?? Infinity) - (b.cpa ?? Infinity)), tests = by("test"), holds = by("hold");
	const sum = (list, f) => list.reduce((t, a) => t + f(a), 0);
	const spendAll = sum(data.ads, (a) => a.spend), convAll = sum(data.ads, (a) => a.conversions[result.primary]);
	const spendLive = sum(live, (a) => a.spendLive), convLive = sum(live, (a) => a.conversionsLive?.[result.primary] ?? 0);
	const L = result.lines;
	const bands = { aboveKill: live.filter((a) => a.cpa != null && a.cpa > L.kill), between: live.filter((a) => a.cpa != null && a.cpa <= L.kill && a.cpa > L.scale), underScale: live.filter((a) => a.cpa != null && a.cpa <= L.scale), none: live.filter((a) => a.cpa == null) };
	const killSpendLive = sum(kills, (a) => a.spendLive), scaleSpendLive = sum(scales, (a) => a.spendLive);
	const top5 = [...live].sort((a, b) => b.spendLive - a.spendLive).slice(0, 5);
	const formats = compareGroups(result, "format"), stages = compareGroups(result, "stage");
	const untaggedF = ads.filter((a) => a.format === "unknown").length, untaggedS = ads.filter((a) => a.stage === "unknown").length;
	const campaigns = result.campaigns.map((c) => {
		const list = ads.filter((a) => a.campaignId === c.id);
		const sp = sum(list, (a) => a.spend), cv = sum(list, (a) => a.conv), spl = sum(list, (a) => a.spendLive), cvl = sum(list, (a) => a.conversionsLive?.[result.primary] ?? 0);
		return { ...c, spend: sp, conv: cv, cpa: cv ? sp / cv : null, spendLive: spl, cpaLive: cvl ? spl / cvl : null, kills: list.filter((a) => a.action === "kill").length, scales: list.filter((a) => a.action === "scale").length, revives: list.filter((a) => a.action === "revive").length };
	});
	const line = (a) => `${a.name} (${a.campaignName}${a.adsetName ? ` / ${a.adsetName}` : ""})`;
	const nums = (a) => `${m(a.spend)} lifetime · ${fmtInt(a.conv)} ${P}${a.conv === 1 ? "" : "s"} · CPA ${a.cpa == null ? "—" : m(a.cpa)}${a.live ? ` · ${m(a.spendLive)} in the last ${data.live.days} days` : " · not live"}${S && a.sec ? ` · ${fmtInt(a.sec)} ${S}s at ${m(a.cps)}` : ""}`;
	const where = result.platform === "google" ? "Google Ads" : "Ads Manager";

	const headline = `${data.account.name}: ${plural(kills.length, "kill")}, ${plural(scales.length, "ad to scale", "ads to scale")}, ${plural(revives.length, "paused winner")} to turn back on. Account CPA ${m(L.account)} against a target of ${m(L.target)}.`;
	const kpis = [
		{ label: "account CPA", value: m(L.account), note: result.basis === "live" ? `last ${data.live.days} days` : "lifetime" },
		{ label: "target", value: m(L.target), note: `${Math.round(result.settings.targetPct * 100)}% under` },
		{ label: "kill line", value: m(L.kill), note: `${result.settings.killMult}× target` },
		{ label: "scale line", value: m(L.scale), note: `${result.settings.scaleMult}× target` },
		{ label: "live ads", value: fmtInt(live.length), note: `${fmtInt(ads.length)} on the map` },
		{ label: `live ${data.live.days}d spend`, value: m(spendLive), note: `${fmtInt(convLive)} ${P}s` },
	];

	// --- Action plan ---
	const groupByCampaign = (list) => {
		const g = new Map();
		for (const a of list) (g.get(a.campaignName) ?? g.set(a.campaignName, []).get(a.campaignName)).push(a);
		return [...g.entries()];
	};
	const plan = {
		title: "Action plan: this week",
		intro: `${plural(kills.length, "kill")} free up ${m(killSpendLive)} of the last ${data.live.days} days' spend. ${plural(scales.length, "ad")} under the scale line get 20% more budget at a time (${m(scaleSpendLive)} of recent spend today). ${plural(revives.length, "paused ad")} beat the scale line historically with ${result.settings.minRevivePurchases}+ ${P}s and aren't one-offs. Work top to bottom in ${where}; each campaign is one screen.`,
		sections: [
			{ key: "kill", title: `1. Kill (${kills.length})`, how: `Pause the ad (not the ${adsetWord}). Move its budget to the scale list below, not to new tests.`, groups: groupByCampaign(kills).map(([c, list]) => ({ campaign: c, items: list.map((a) => ({ ad: a, what: "Pause", numbers: nums(a), why: a.reason })) })) },
			{ key: "scale", title: `2. Scale (${scales.length})`, how: "Raise the budget 20%, wait 48–72 hours, check CPA, repeat. Add placements and 2–3 variants of the hook. Stop raising when CPA crosses target.", groups: groupByCampaign(scales).map(([c, list]) => ({ campaign: c, items: list.map((a) => ({ ad: a, what: "+20% budget", numbers: nums(a), why: `CPA ${m(a.cpa)} is ${fmtPct(1 - a.cpa / L.target)} under target; headroom to ${m(L.target)}` })) })) },
			{ key: "revive", title: `3. Turn back on (${revives.length})`, how: `Re-enable at the ${adsetWord}'s last daily budget, or inside the best live ${adsetWord} as a new ad with the same creative. Treat as a test for the first ${m(result.testBudget)} of spend.`, groups: groupByCampaign(revives.slice(0, 40)).map(([c, list]) => ({ campaign: c, items: list.map((a) => ({ ad: a, what: "Re-enable", numbers: nums(a), why: `Historic CPA ${m(a.cpa)} on ${fmtInt(a.conv)} ${P}s` })) })), more: Math.max(0, revives.length - 40) },
			{ key: "watch", title: `4. Leave alone (${tests.length + holds.length})`, how: `${plural(tests.length, "ad")} still inside the test budget of ${m(result.testBudget)}; ${plural(holds.length, "ad")} between the scale and kill lines. Re-run the map in 7 days.`, groups: [] },
		],
		closing: `Expected effect: removing ${m(killSpendLive)} of kill spend from ${m(spendLive)} of live spend and moving it to ads averaging ${scales.length ? m(sum(scales, (a) => a.spend) / Math.max(1, sum(scales, (a) => a.conv))) : "the scale list"} brings blended CPA toward ${m(L.target)}. Re-check after one budget cycle; the lines move with the account.`,
	};

	// --- Audit / readout ---
	const audit = {
		title: `${data.account.name}: account readout`,
		sections: [
			{ title: "At a glance", paragraphs: [
				`${plural(data.ads.length, "ad")} have spent ${m(spendAll)} since ${data.window.since ?? "the start of the window"} and produced ${fmtInt(convAll)} ${P}s, a lifetime CPA of ${convAll ? m(spendAll / convAll) : "—"}. ${plural(ads.length, "ad")} have the ${m(result.settings.minSpend)} needed to be on the map${result.hidden ? ` (${fmtInt(result.hidden)} smaller ads are hidden)` : ""}. ${plural(live.length, "ad is", "ads are")} live, meaning they spent in the last ${data.live.days} days: ${m(spendLive)} for ${fmtInt(convLive)} ${P}s, a current CPA of ${convLive ? m(spendLive / convLive) : "—"}.`,
				convAll && convLive ? `The account is running ${spendLive / convLive > spendAll / convAll ? "worse" : "better"} than its own history: current CPA ${m(spendLive / convLive)} against a lifetime ${m(spendAll / convAll)}.` : "",
			].filter(Boolean) },
			{ title: "The lines", paragraphs: [
				...Object.entries(result.stageLines ?? {}).filter(([, SL]) => SL.custom).map(([st, SL]) => `${STAGE_LABEL[st]} is graded on ${SL.basis === "secondary" ? `cost per ${S}` : "CPA"}: target ${m(SL.target)}, kill line ${m(SL.kill)}, scale line ${m(SL.scale)}.`),
				`Account CPA ${m(L.account)} (${result.basis === "live" ? `blended over the last ${data.live.days} days` : "lifetime"}). Target ${m(L.target)}, ${Math.round(result.settings.targetPct * 100)}% under. Kill line ${m(L.kill)} (${result.settings.killMult}× target). Scale line ${m(L.scale)} (${result.settings.scaleMult}× target). AOV ${m(result.aov)}; test budget ${m(result.testBudget)}.${S ? ` Secondary metric: ${S}s, account cost ${m(result.linesSecondary.account)} each.` : ""}`,
				`Of the ${live.length} live ads: ${bands.aboveKill.length} sit above the kill line, ${bands.between.length} between the lines, ${bands.underScale.length} under the scale line, and ${bands.none.length} have no ${P} yet. The five biggest live ads carry ${fmtPct(share(sum(top5, (a) => a.spendLive), spendLive))} of recent spend${top5[0] ? `; the largest, ${top5[0].name}, has a CPA of ${top5[0].cpa == null ? "—" : m(top5[0].cpa)}` : ""}.`,
			] },
			{ title: "Calls", paragraphs: [`${plural(kills.length, "kill")}, ${plural(scales.length, "scale")}, ${plural(revives.length, "revive")}, ${plural(tests.length, "ad")} testing, ${plural(holds.length, "ad")} on hold, ${plural(off.length - revives.length, "paused ad")} that stay off. Kills account for ${m(killSpendLive)} of the last ${data.live.days} days' spend (${fmtPct(share(killSpendLive, spendLive))}).`],
				table: { cols: ["Call", "Ads", `Spend ${data.live.days}d`, "Lifetime spend", `${P}s`, "CPA"], rows: Object.keys(ACTION_LABEL).map((k) => { const l = ads.filter((a) => a.action === k); const sp = sum(l, (a) => a.spend), cv = sum(l, (a) => a.conv); return [ACTION_LABEL[k], fmtInt(l.length), m(sum(l, (a) => a.spendLive)), m(sp), fmtInt(cv), cv ? m(sp / cv) : "—"]; }) } },
			{ title: "Like with like: formats", paragraphs: [formats.length > 1 ? `The spread inside a format is usually wider than the spread between formats. ${formats.map((f) => `${FORMAT_LABEL[f.key] ?? f.key}: ${f.ads} ads, CPA ${f.cpa == null ? "—" : m(f.cpa)}${f.best && f.worst && f.best !== f.worst ? `, best ${m(f.best.cpa)} to worst ${m(f.worst.cpa)}` : ""}`).join("; ")}.` : "One format carries the account."],
				table: { cols: ["Format", "Ads", "Live", "Spend", `${P}s`, "CPA", "Best", "Worst", "Kill / scale / revive"], rows: formats.map((f) => [FORMAT_LABEL[f.key] ?? f.key, fmtInt(f.ads), fmtInt(f.live), m(f.spend), fmtInt(f.conv), f.cpa == null ? "—" : m(f.cpa), f.best ? `${m(f.best.cpa)} · ${f.best.name}` : "—", f.worst ? `${m(f.worst.cpa)} · ${f.worst.name}` : "—", `${f.kills} / ${f.scales} / ${f.revives}`]) } },
			{ title: "Like with like: stages", paragraphs: [`Grade each stage on its own metric: TOF on cost per ${S || "secondary conversion"}, BOF on CPA. ${stages.map((s) => `${STAGE_LABEL[s.key]}: ${s.ads} ads, CPA ${s.cpa == null ? "—" : m(s.cpa)}`).join("; ")}.${untaggedS ? ` ${fmtInt(untaggedS)} ads have no stage tag yet.` : ""}`],
				table: { cols: ["Stage", "Ads", "Live", "Spend", `${P}s`, "CPA", S ? `${S}s` : "", S ? `Cost / ${S}` : ""].filter(Boolean), rows: stages.map((s) => { const l = ads.filter((a) => a.stage === s.key); const sec = sum(l, (a) => a.sec); return [STAGE_LABEL[s.key], fmtInt(s.ads), fmtInt(s.live), m(s.spend), fmtInt(s.conv), s.cpa == null ? "—" : m(s.cpa), ...(S ? [fmtInt(sec), sec ? m(s.spend / sec) : "—"] : [])]; }) } },
			{ title: "Campaigns", paragraphs: [`Where the live spend sits, with each campaign's calls.`], table: { cols: ["Campaign", "Status", `Spend ${data.live.days}d`, `CPA ${data.live.days}d`, "Lifetime spend", "Lifetime CPA", "Kill / scale / revive"], rows: campaigns.filter((c) => c.spendLive > 0 || c.revives > 0).slice(0, 25).sort((a, b) => b.spendLive - a.spendLive).map((c) => [c.name, (c.status || "").toLowerCase(), m(c.spendLive), c.cpaLive == null ? "—" : m(c.cpaLive), m(c.spend), c.cpa == null ? "—" : m(c.cpa), `${c.kills} / ${c.scales} / ${c.revives}`]) } },
			{ title: "Paused winners", paragraphs: [revives.length ? `${plural(revives.length, "paused ad")} beat the scale line with ${result.settings.minRevivePurchases}+ ${P}s and don't look like one-offs. Together they produced ${fmtInt(sum(revives, (a) => a.conv))} ${P}s on ${m(sum(revives, (a) => a.spend))} (CPA ${m(sum(revives, (a) => a.spend) / Math.max(1, sum(revives, (a) => a.conv)))}). Start with the cheapest: ${revives.slice(0, 3).map((a) => `${a.name} at ${m(a.cpa)}`).join(", ")}.` : "No paused ad clears the bar for turning back on."] },
			{ title: "Caveats", paragraphs: [
				`Every number here is ${platform.label}'s own attribution, not incremental lift. The data window is ${data.window.since ?? "unbounded"} to ${data.window.until}${result.platform === "meta" ? " (Meta caps insights at about 37 months)" : ""}. Format and stage are read from names: ${fmtInt(untaggedF)} ads have no format and ${fmtInt(untaggedS)} no stage; the calls on those ads still hold, the like-with-like comparisons don't include them.`,
				result.platform === "google" ? "Performance Max and asset-group ads don't appear at ad level in Google Ads and aren't on the map." : "",
				result.settings.notes ? `Notes: ${result.settings.notes}` : "",
			].filter(Boolean) },
		],
	};
	return { headline, kpis, plan, audit, kills, scales, revives, formats, stages, campaigns };
}

const mdTable = (t) => `| ${t.cols.join(" | ")} |\n| ${t.cols.map(() => "---").join(" | ")} |\n${t.rows.map((r) => `| ${r.map((c) => String(c).replace(/\|/g, "\\|")).join(" | ")} |`).join("\n")}`;
export function actionPlanMarkdown(result, data) {
	const n = narrative(result, data);
	const out = [`# ${data.account.name}: ${n.plan.title}`, "", n.headline, "", n.plan.intro, ""];
	for (const s of n.plan.sections) {
		out.push(`## ${s.title}`, "", `_${s.how}_`, "");
		for (const g of s.groups) {
			out.push(`**${g.campaign}**`, "");
			for (const i of g.items) out.push(`- [ ] **${i.what}** · ${i.ad.name}${i.ad.adsetName ? ` (${i.ad.adsetName})` : ""} · ${i.numbers}  \n  ${i.why}`);
			out.push("");
		}
		if (s.more) out.push(`… and ${s.more} more in the CSV.`, "");
	}
	out.push(n.plan.closing, "", `_CPA Map by GrowthCast · ${new Date().toISOString().slice(0, 10)}_`);
	return out.join("\n");
}
export function auditMarkdown(result, data) {
	const n = narrative(result, data);
	const out = [`# ${n.audit.title}`, "", n.headline, "", n.kpis.map((k) => `**${k.value}** ${k.label} (${k.note})`).join(" · "), ""];
	for (const s of n.audit.sections) {
		out.push(`## ${s.title}`, "");
		for (const p of s.paragraphs) out.push(p, "");
		if (s.table) out.push(mdTable(s.table), "");
	}
	out.push(`_CPA Map by GrowthCast · ${new Date().toISOString().slice(0, 10)}_`);
	return out.join("\n");
}
