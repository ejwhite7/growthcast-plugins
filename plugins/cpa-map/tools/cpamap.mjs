// CPA map: a local web app that plots every Meta or Google ad (log lifetime spend × CPA), draws the account / target /
// kill / scale lines and sorts the ads into kill, scale, turn-back-on, testing and hold. Data comes through BlueAlpha's
// ad-platform tools: Claude saves the raw results under ~/.cpa-map/raw/<account id>/ and runs `build`, which writes
// ~/.cpa-map/accounts/<account id>/ads.json; the studio reads that and keeps its settings next to it. Requests from the
// studio go to Claude with the user's next message (tools/context.mjs is the hook that reads them).
// Local only: listens on 127.0.0.1 and answers only requests addressed to it.
//
// Usage: node tools/cpamap.mjs [serve] [--port 4731] [--open]
//        node tools/cpamap.mjs accounts | raw <id> | build <id> [--name N] [--currency CAD] [--timezone TZ] [--live-days 30]
//        node tools/cpamap.mjs summary <id> [--top 12] | export <id> [--out dir] [--chrome path] | path <id>
//        Account ids: act_<digits> (Meta) or gads_<digits> (Google Ads). Every form takes --home <dir> to keep data
//        somewhere other than ~/.cpa-map.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { ACTION_LABEL, CONVERSION_LABEL, DEFAULT_SETTINGS, PLATFORMS, actionRows, analyse, buildGoogle, buildMeta, fmtMoney, mergeRows, normalizeSettings, okAccountId, platformOf, rowsOf, toCsv } from "../studio/model.mjs";
import { actionPlanMarkdown, auditMarkdown } from "../studio/narrative.mjs";
import { renderReport } from "../studio/report.mjs";
import { renderSlides } from "../studio/slides.mjs";

const tools = dirname(fileURLToPath(import.meta.url));
const studio = resolve(tools, "../studio");
const args = process.argv.slice(2);
const flag = (name, d) => (args.includes(name) ? args[args.indexOf(name) + 1] : d);
const positional = args.filter((a, i) => !a.startsWith("--") && !(args[i - 1]?.startsWith("--") && args[i - 1] !== "--open"));
let port = Number(flag("--port", 4731));
let home, rawDir, accountsDir, reqPath;
export function setHome(dir) {
	home = resolve(dir);
	rawDir = join(home, "raw");
	accountsDir = join(home, "accounts");
	reqPath = join(home, "request.json");
	mkdirSync(rawDir, { recursive: true });
	mkdirSync(accountsDir, { recursive: true });
}
setHome(flag("--home", join(homedir(), ".cpa-map")));

const readJson = (p, d = null) => {
	try {
		return JSON.parse(readFileSync(p, "utf8"));
	} catch {
		return d;
	}
};
export const fail = (status, message) => Object.assign(new Error(message), { status });
const dataPath = (id) => join(accountsDir, okAccountId(id) ?? "_", "ads.json");
const settingsPath = (id) => join(accountsDir, okAccountId(id) ?? "_", "settings.json");
const versionOf = (id) => {
	try {
		return `${statSync(dataPath(id)).mtimeMs}:${existsSync(settingsPath(id)) ? statSync(settingsPath(id)).mtimeMs : 0}`;
	} catch {
		return null;
	}
};
const writeAtomic = (p, body) => {
	mkdirSync(dirname(p), { recursive: true });
	writeFileSync(`${p}.tmp`, body);
	renameSync(`${p}.tmp`, p);
};
export function loadAccount(id) {
	if (!okAccountId(id) || !existsSync(dataPath(id))) throw fail(404, `No built account "${id}". Run: node tools/cpamap.mjs build ${id}`);
	const data = readJson(dataPath(id));
	if (!data?.ads) throw fail(422, `${dataPath(id)} isn't a valid account file`);
	return { data, settings: normalizeSettings(readJson(settingsPath(id), {})), version: versionOf(id) };
}
export function saveSettings(id, settings) {
	if (!okAccountId(id)) throw fail(404, `No account "${id}"`);
	const clean = normalizeSettings(settings);
	writeAtomic(settingsPath(id), JSON.stringify(clean, null, "\t"));
	return { settings: clean, version: versionOf(id) };
}
export const listAccounts = () =>
	(existsSync(accountsDir) ? readdirSync(accountsDir) : [])
		.filter((d) => okAccountId(d) && existsSync(dataPath(d)))
		.map((d) => {
			const a = readJson(dataPath(d), {});
			return { id: d, platform: a.platform ?? platformOf(d), name: a.account?.name ?? d, currency: a.account?.currency ?? "USD", builtAt: a.builtAt ?? null, ads: a.ads?.length ?? 0 };
		})
		.sort((a, b) => String(b.builtAt).localeCompare(String(a.builtAt)));

// Raw files Claude saved for an account. Meta: lifetime*.json (one or several windows), last30.json, last7.json,
// campaigns.json, account.json. Google: lifetime.json, last30.json, last7.json, conversions.json, campaigns.json, account.json.
export function rawFiles(id) {
	const dir = join(rawDir, okAccountId(id) ?? "_");
	const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
	const pick = (re) => files.filter((f) => re.test(f)).map((f) => join(dir, f));
	return { dir, platform: platformOf(id), lifetime: pick(/^lifetime.*\.json$/), live: pick(/^(last30|live)\.json$/), last7: pick(/^last7\.json$/), conversions: pick(/^conversions\.json$/), campaigns: pick(/^campaigns\.json$/), account: pick(/^account\.json$/) };
}
export function build(id, { name, currency, timezone, liveDays } = {}) {
	if (!okAccountId(id)) throw fail(400, `"${id}" isn't an account id (act_<digits> for Meta, gads_<digits> for Google Ads)`);
	const f = rawFiles(id);
	if (!f.lifetime.length) throw fail(404, `No lifetime rows in ${f.dir}: save the ad-level lifetime pull there as lifetime.json first (see the cpa-map skill)`);
	const rows = (p) => rowsOf(readJson(p, {}));
	const prev = existsSync(dataPath(id)) ? readJson(dataPath(id), {}).account : null;
	const acct = f.account.length ? rows(f.account[0])[0] : null;
	const account = {
		id,
		name: name ?? prev?.name ?? acct?.customer?.descriptive_name ?? acct?.account_name ?? id,
		currency: currency ?? prev?.currency ?? acct?.customer?.currency_code ?? "USD",
		timezone: timezone ?? prev?.timezone ?? acct?.customer?.time_zone ?? "",
	};
	const days = Number(liveDays ?? DEFAULT_SETTINGS.liveDays);
	let data, counts;
	if (f.platform === "google") {
		const lifetime = f.lifetime.flatMap(rows), live = f.live.flatMap(rows), last7 = f.last7.flatMap(rows), conversions = f.conversions.flatMap(rows), campaigns = f.campaigns.flatMap(rows);
		data = buildGoogle({ account, lifetime, live, last7, conversions, campaigns, liveDays: days });
		counts = { lifetimeRows: lifetime.length, liveRows: live.length, last7Rows: last7.length, conversionRows: conversions.length, campaigns: campaigns.length };
	} else {
		const lifetime = mergeRows(f.lifetime.map(rows)), live = mergeRows(f.live.map(rows)), last7 = mergeRows(f.last7.map(rows)), campaigns = f.campaigns.length ? rows(f.campaigns[0]) : [];
		data = buildMeta({ account, lifetime, live, last7, campaigns, liveDays: days });
		counts = { lifetimeRows: lifetime.length, liveRows: live.length, last7Rows: last7.length, campaigns: campaigns.length };
	}
	writeAtomic(dataPath(id), JSON.stringify(data, null, "\t"));
	if (!existsSync(settingsPath(id))) writeAtomic(settingsPath(id), JSON.stringify({ ...DEFAULT_SETTINGS, liveDays: data.live.days }, null, "\t"));
	return { data, file: dataPath(id), ...counts };
}

// What Claude reads before answering a request: the lines, the counts, and the ads each action touches.
export function summary(id, { top = 12 } = {}) {
	const { data, settings } = loadAccount(id);
	const r = analyse(data, settings);
	const cur = data.account.currency, m = (v) => fmtMoney(v, cur);
	const line = (a) => `  - ${a.name} [${a.id}] · ${a.campaignName} · ${a.format}/${a.stage}${a.live ? "" : " · not live"} · spend ${m(a.spend)} · ${a.conv} ${CONVERSION_LABEL[r.primary]}s · CPA ${a.cpa == null ? "—" : m(a.cpa)}${r.secondary ? ` · ${a.sec} ${CONVERSION_LABEL[r.secondary]}s` : ""} · ${a.reason}`;
	const group = (k) => {
		const list = r.ads.filter((a) => a.action === k);
		return [`${ACTION_LABEL[k]}: ${list.length}`, ...list.slice(0, top).map(line), ...(list.length > top ? [`  … ${list.length - top} more in the CSV`] : [])];
	};
	return [
		`Account: ${data.account.name} (${id}, ${PLATFORMS[r.platform].label}), ${cur}. Data window ${data.window.since ?? "lifetime"} → ${data.window.until}${r.platform === "meta" ? ' (Meta caps "maximum" at about 37 months)' : ""}. Live window: ${data.live.since ?? "?"} → ${data.live.until ?? "?"} (${data.live.days} days). Built ${data.builtAt}.`,
		`Ads: ${data.ads.length} with any spend; ${r.ads.length} on the map (≥ ${m(settings.minSpend)}); ${r.ads.filter((a) => a.live).length} live. ${r.campaigns.length} campaigns, ${r.adsets.length} ${PLATFORMS[r.platform].level[1].toLowerCase()}s.`,
		`Lines (${r.basis} basis, on ${CONVERSION_LABEL[r.primary]}s): account CPA ${m(r.lines.account)} · target ${m(r.lines.target)} (${Math.round(settings.targetPct * 100)}% under) · kill ${m(r.lines.kill)} (${settings.killMult}× target) · scale ${m(r.lines.scale)} (${settings.scaleMult}× target). AOV ${m(r.aov)}. Test budget ${m(r.testBudget)}.${r.secondary ? ` Secondary: ${CONVERSION_LABEL[r.secondary]} (account cost ${m(r.linesSecondary.account)}).` : ""}`,
		`Counts: ${Object.entries(r.counts).map(([k, v]) => `${v} ${ACTION_LABEL[k].toLowerCase()}`).join(", ")}.`,
		...group("kill"), ...group("scale"), ...group("revive"),
		`Files: data ${dataPath(id)}; settings ${settingsPath(id)} (overrides.<ad id> = {format, stage, oneOff}; decisions.<ad id> = kill|scale|revive|keep; notes). Exports: \`node "${join(tools, "cpamap.mjs")}" export ${id}\` (report.html, slides.html, slides.pdf, plan.md, readout.md, actions.csv).`,
	].join("\n");
}

// The request the studio queues for Claude.
export const KIND = {
	actions: ["Write the action list", "Write the kill / scale / turn-back-on list for this account as a short memo the media buyer can act on today: for each ad, what to do, the numbers behind it, and the budget move (kills now; scale 20% at a time; revived ads at their last daily budget). Start from the generated plan (plan.md in the export) and improve it with judgement: flag anything the rules got wrong (one-offs, mis-tagged formats or stages) and fix the tags in settings.json."],
	brief: ["Brief new creative", "Compare like with like: within each format, name the best and worst ads on the map and what separates them (hook, offer, stage, placement). Turn it into a creative brief for the next batch: which formats to make more of, which angles to retire, three concrete concepts per format worth producing. Keep it to one page."],
	audit: ["Write the account readout", "Write the account audit / readout for this account as a document the client can read: what the account does now versus its history, where the spend sits, what the lines say, the spread inside each format and stage, paused winners, risks, and the plan for the next two weeks. Start from the generated readout (readout.md in the export) and add judgement, context from the campaign names, and anything BlueAlpha's MMM or incrementality tests say about this channel."],
	retag: ["Check the tags", "Review the format and funnel stage tags on the ads listed (or all ads on the map when none are listed), which were guessed from names. Use the ad, ad set and campaign names, and BlueAlpha's platform tools if a creative needs checking. Write corrections into settings.json under overrides.<ad id> = { format, stage, oneOff } and tell the user how many you changed."],
	explain: ["Explain this ad", "Explain this ad's position on the map in plain words: what it has spent, what it has produced, how it compares with the lines and with the other ads in its format and stage, and what you would do with it this week. Pull the last 7 and 30 days from BlueAlpha if the trend matters."],
	refresh: ["Refresh the data", "Pull this account again from BlueAlpha (follow the cpa-map skill's Pull steps for its platform), rebuild it, and tell the user what moved since the last build: new kills, new scale candidates, ads that crossed a line."],
};
function requestContext(r) {
	const id = okAccountId(r.accountId);
	if (!id) throw fail(400, "accountId must be act_<digits> or gads_<digits>");
	const { data, settings } = loadAccount(id);
	const res = analyse(data, settings);
	const picked = (r.adIds ?? []).map((x) => res.ads.find((a) => a.id === x)).filter(Boolean);
	const cur = data.account.currency, m = (v) => fmtMoney(v, cur);
	return [
		`CPA map request: ${KIND[r.kind][0]}`,
		`Account: "${data.account.name}" (${id}, ${PLATFORMS[res.platform].label}). Studio: http://127.0.0.1:${port}/#${id}`,
		`Lines: account CPA ${m(res.lines.account)} · target ${m(res.lines.target)} · kill ${m(res.lines.kill)} · scale ${m(res.lines.scale)} · ${res.ads.length} ads on the map: ${Object.entries(res.counts).map(([k, v]) => `${v} ${ACTION_LABEL[k].toLowerCase()}`).join(", ")}.`,
		...(r.filters ? [`Studio filters when asked: ${Object.entries(r.filters).filter(([, v]) => v !== "all" && v !== "" && v !== false).map(([k, v]) => `${k}=${v}`).join(", ") || "none"}`] : []),
		...(picked.length ? [`Selected ads:`, ...picked.map((a) => `- ${a.name} [${a.id}] · ${a.campaignName} / ${a.adsetName} · ${a.format}/${a.stage} · ${a.live ? "live" : "not live"} · spend ${m(a.spend)} · ${a.conv} ${CONVERSION_LABEL[res.primary]}s · CPA ${a.cpa == null ? "—" : m(a.cpa)} · ${ACTION_LABEL[a.action]}: ${a.reason}`)] : []),
		...(r.note ? [`Note from the user: ${r.note}`] : []),
		`Task: ${KIND[r.kind][1]}`,
		`First run \`node "${join(tools, "cpamap.mjs")}" summary ${id}\` for the full picture (and \`export ${id}\` for the generated plan and readout), and read the cpa-map skill for the rules, the files and how to retag or refresh. Settings file: ${settingsPath(id)} (the open studio reloads when it changes). Finish with a short summary in chat.`,
	].join("\n");
}

// --- Exports ---
const tokens = () => readFileSync(join(studio, "tokens.css"), "utf8");
const CHROMES = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"];
const playwrightChromes = () => {
	const base = process.platform === "darwin" ? join(homedir(), "Library/Caches/ms-playwright") : join(homedir(), ".cache/ms-playwright");
	try {
		return readdirSync(base).filter((d) => d.startsWith("chromium")).map((d) => [join(base, d, "chrome-mac/headless_shell"), join(base, d, "chrome-mac-arm64/headless_shell"), join(base, d, "chrome-linux/headless_shell"), join(base, d, "chrome-linux/chrome")]).flat();
	} catch {
		return [];
	}
};
export const PDF_SETUP = "npx -y playwright@1.56.1 install chromium-headless-shell";
const findChrome = () => [flag("--chrome"), process.env.CPAMAP_CHROME, ...CHROMES, ...playwrightChromes()].find((c) => c && existsSync(c)) ?? null;
// Prints an HTML document (slides: 1280×720 pages; report: letter) to PDF with headless Chrome. Fonts are read from
// the studio folder, so the HTML is written next to a copy of them.
export function printPdf(html, { landscape = false } = {}) {
	const chrome = findChrome();
	if (!chrome) return Promise.reject(fail(501, `No Chrome, Edge, Chromium or Brave found to print the PDF. Install one, or run "${PDF_SETUP}" once, then try again. Until then, open the HTML and print it to PDF from your browser.`));
	const dir = join(tmpdir(), `cpamap-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
	mkdirSync(join(dir, "fonts"), { recursive: true });
	for (const f of readdirSync(join(studio, "fonts"))) writeFileSync(join(dir, "fonts", f), readFileSync(join(studio, "fonts", f)));
	const page = join(dir, "page.html"), pdf = join(dir, "out.pdf");
	writeFileSync(page, html);
	return new Promise((ok, no) => {
		const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${join(dir, "profile")}`, "--no-pdf-header-footer", "--virtual-time-budget=4000", ...(landscape ? ["--landscape"] : []), `--print-to-pdf=${pdf}`, `file://${page}`], { stdio: "ignore" });
		const timer = setTimeout(() => child.kill(), 60e3);
		child.on("error", (e) => no(fail(500, `Couldn't start ${chrome}: ${e.message}`)));
		child.on("exit", () => {
			clearTimeout(timer);
			try {
				ok(readFileSync(pdf));
			} catch {
				no(fail(500, "The browser didn't write a PDF. Open the HTML and print it to PDF instead."));
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		});
	});
}
const fileSafe = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "account";
// Every export for an account: the files the Export menu offers, written to one folder.
export async function exportPack(id, { out, pdf = true } = {}) {
	const { data, settings } = loadAccount(id);
	const r = analyse(data, settings);
	const dir = resolve(out ?? join(home, "exports", id));
	mkdirSync(join(dir, "fonts"), { recursive: true });
	for (const f of readdirSync(join(studio, "fonts"))) writeFileSync(join(dir, "fonts", f), readFileSync(join(studio, "fonts", f)));
	const t = tokens();
	const files = {
		"report.html": renderReport(r, data, { tokens: t }),
		"slides.html": renderSlides(r, data, { tokens: t }),
		"plan.md": actionPlanMarkdown(r, data),
		"readout.md": auditMarkdown(r, data),
		"actions.csv": toCsv(actionRows(r)),
	};
	for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
	const written = Object.keys(files).map((f) => join(dir, f));
	let note = "";
	if (pdf) {
		try {
			writeFileSync(join(dir, "slides.pdf"), await printPdf(renderSlides(r, data, { tokens: t, print: true })));
			written.push(join(dir, "slides.pdf"));
		} catch (e) {
			note = e.message;
		}
	}
	return { dir, files: written, note, stem: fileSafe(data.account.name) };
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".csv": "text/csv; charset=utf-8", ".ttf": "font/ttf", ".md": "text/markdown; charset=utf-8" };
export function serve(listenPort = port) {
	port = listenPort;
	const send = (res, status, body, headers = {}) => {
		const isText = typeof body === "string" || Buffer.isBuffer(body);
		res.writeHead(status, { "content-type": isText ? "text/plain; charset=utf-8" : "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers });
		res.end(isText ? body : JSON.stringify(body));
	};
	const file = (res, p) => {
		if (!p.startsWith(studio) || !existsSync(p) || statSync(p).isDirectory()) return send(res, 404, "Not found");
		res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream", "cache-control": "no-store" });
		createReadStream(p).pipe(res);
	};
	const body = (req) => new Promise((ok, no) => {
		const chunks = [];
		let size = 0;
		req.on("data", (c) => {
			size += c.length;
			if (size > 2e6) no(fail(413, "Too large"));
			else chunks.push(c);
		});
		req.on("end", () => ok(Buffer.concat(chunks)));
		req.on("error", no);
	});
	const json = async (req) => {
		try {
			return JSON.parse((await body(req)).toString("utf8") || "{}");
		} catch (e) {
			throw e.status ? e : fail(400, "Body must be JSON");
		}
	};
	const PAGE = { "content-type": "text/html; charset=utf-8" };
	return createServer(async (req, res) => {
		try {
			const hostOk = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(req.headers.host ?? "");
			const origin = req.headers.origin;
			if (!hostOk || (origin && !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(origin))) return send(res, 403, "Local only");
			if (req.method !== "GET" && req.headers["sec-fetch-site"] && !["same-origin", "none"].includes(req.headers["sec-fetch-site"])) return send(res, 403, "Local only");
			const url = new URL(req.url, "http://127.0.0.1");
			const parts = url.pathname.split("/").filter(Boolean);
			if (req.method === "GET" && parts.length === 0) return file(res, join(studio, "index.html"));
			if (req.method === "GET" && parts[0] !== "api") return file(res, resolve(studio, ...parts));
			const id = parts[2];
			const route = `${req.method} /${parts.slice(0, 2).join("/")}${parts.length > 2 ? "/:id" : ""}${parts.length > 3 ? "/" + parts.slice(3).join("/") : ""}`;
			if (route === "GET /api/settings") return send(res, 200, { mode: "local", canEdit: true, asks: Object.keys(KIND), pdf: !!findChrome(), user: null });
			if (route === "GET /api/accounts") return send(res, 200, listAccounts());
			if (route === "GET /api/accounts/:id") return send(res, 200, loadAccount(id));
			if (route === "GET /api/accounts/:id/version") return send(res, 200, { version: versionOf(id) });
			if (route === "GET /api/accounts/:id/summary") return send(res, 200, summary(id));
			if (route === "PUT /api/accounts/:id/settings") {
				loadAccount(id);
				return send(res, 200, saveSettings(id, await json(req)));
			}
			if (req.method === "GET" && parts[0] === "api" && parts[1] === "accounts" && parts.length === 4) {
				const { data, settings } = loadAccount(id);
				const r = analyse(data, settings), stem = fileSafe(data.account.name), t = tokens(), dl = url.searchParams.has("download");
				const name = parts[3];
				if (name === "actions.csv") return send(res, 200, toCsv(actionRows(r)), { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${stem}-actions.csv"` });
				if (name === "report.html") return send(res, 200, renderReport(r, data, { tokens: t, fontsBase: "/" }), { ...PAGE, ...(dl ? { "content-disposition": `attachment; filename="${stem}-cpa-map.html"` } : {}) });
				if (name === "slides.html") return send(res, 200, renderSlides(r, data, { tokens: t, fontsBase: "/", print: url.searchParams.has("print") }), PAGE);
				if (name === "slides.pdf") return send(res, 200, await printPdf(renderSlides(r, data, { tokens: t, print: true })), { "content-type": "application/pdf", "content-disposition": `attachment; filename="${stem}-cpa-map-slides.pdf"` });
				if (name === "report.pdf") return send(res, 200, await printPdf(renderReport(r, data, { tokens: t })), { "content-type": "application/pdf", "content-disposition": `attachment; filename="${stem}-cpa-map-readout.pdf"` });
				if (name === "plan.md") return send(res, 200, actionPlanMarkdown(r, data), { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${stem}-action-plan.md"` });
				if (name === "readout.md") return send(res, 200, auditMarkdown(r, data), { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${stem}-readout.md"` });
			}
			if (route === "GET /api/request") return send(res, 200, readJson(reqPath));
			if (route === "POST /api/request") {
				const r = await json(req);
				if (!KIND[r.kind]) throw fail(400, `kind must be one of ${Object.keys(KIND).join(", ")}`);
				const queued = { kind: r.kind, accountId: r.accountId, adIds: (r.adIds ?? []).slice(0, 50), filters: r.filters ?? null, note: String(r.note ?? "").slice(0, 2000), at: Date.now(), title: KIND[r.kind][0] };
				queued.context = requestContext(queued);
				writeAtomic(reqPath, JSON.stringify(queued, null, 2));
				return send(res, 200, queued);
			}
			if (route === "DELETE /api/request") {
				if (existsSync(reqPath)) writeAtomic(reqPath, "null");
				return send(res, 200, { ok: true });
			}
			send(res, 404, "Not found");
		} catch (e) {
			send(res, e.status ?? 500, e.message ?? String(e));
		}
	})
		.on("error", (e) => {
			console.error(e.code === "EADDRINUSE" ? `Port ${port} is busy: the map is probably already running at http://127.0.0.1:${port}` : e.message);
			process.exit(1);
		})
		.listen(port, "127.0.0.1", () => {
			console.log(`CPA map: http://127.0.0.1:${port}  (data in ${home})`);
			if (args.includes("--open")) spawn(process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open", [`http://127.0.0.1:${port}`], { stdio: "ignore", detached: true }).unref();
		});
}

const commands = {
	accounts: () => console.log(JSON.stringify(listAccounts(), null, 2)),
	raw: () => {
		const id = positional[1];
		const f = rawFiles(id);
		console.log(JSON.stringify({ ...f, next: `node "${join(tools, "cpamap.mjs")}" build ${id} --name "<account name>" --currency <USD|CAD|…>` }, null, 2));
	},
	build: () => {
		const id = positional[1];
		const b = build(id, { name: flag("--name"), currency: flag("--currency"), timezone: flag("--timezone"), liveDays: flag("--live-days") });
		const { data, file, ...counts } = b;
		console.log(`Built ${file}: ${data.ads.length} ads (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}).`);
		console.log(summary(id, { top: 5 }));
	},
	summary: () => console.log(summary(positional[1], { top: Number(flag("--top", 12)) })),
	export: async () => {
		const r = await exportPack(positional[1], { out: flag("--out"), pdf: !args.includes("--no-pdf") });
		console.log(r.files.join("\n"));
		if (r.note) console.error(`PDF skipped: ${r.note}`);
	},
	path: () => console.log(JSON.stringify({ data: dataPath(positional[1]), settings: settingsPath(positional[1]), raw: rawFiles(positional[1]).dir, request: reqPath, exports: join(home, "exports", positional[1] ?? "") }, null, 2)),
	serve: () => serve(port),
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const cmd = positional[0] ?? "serve";
	if (!commands[cmd]) {
		console.error(`Unknown command "${cmd}". One of: ${Object.keys(commands).join(", ")}`);
		process.exit(2);
	}
	try {
		await commands[cmd]();
	} catch (e) {
		console.error(e.message ?? e);
		process.exit(1);
	}
}
