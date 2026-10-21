// Product Release Checklist studio: a local web app for running product launches (brief and tier, dated checklist,
// message house, assets, measurement, readiness, retro) and asking Claude to do the work behind each step.
// Launches live in ~/.product-release-checklist/launches/<id>.json. Requests from the studio go to Claude with the user's
// next message (tools/studio-context.mjs is the hook that reads them). Local only: listens on 127.0.0.1, answers only
// requests addressed to it.
//
// Usage: node tools/studio.mjs [--port 4730] [--open]
//        node tools/studio.mjs list | new <name> [--t0 yyyy-mm-dd] | path <id> | validate <id|file> | export <id> [--out dir]
//        node tools/studio.mjs sync-plan <id>          (the Linear project/milestones/issues payload, as JSON)
//        node tools/studio.mjs link <id> <result.json>  (write Linear ids, assignees and pulled states back)
//        Every form takes --home <dir> to keep launches somewhere other than ~/.product-release-checklist.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { ASSETS, checks, newLaunch, normalize, readiness, summary, tierOf, VERDICT, validDate } from "../studio/model.mjs";
import { renderMarkdownPack, renderReport, REPORT_CSS } from "../studio/report.mjs";
import { applyLinearResult, CHECK_SCRIPT, linearPayload, renderTasksCsv, renderTeamPlan, renderTeamPlanMarkdown, TEAM_PLAN_CSS } from "../studio/teamplan.mjs";

const tools = dirname(fileURLToPath(import.meta.url));
const studio = resolve(tools, "../studio");
const plugin = resolve(tools, "..");
const args = process.argv.slice(2);
const flag = (name, d) => (args.includes(name) ? args[args.indexOf(name) + 1] : d);
const positional = args.filter((a, i) => !a.startsWith("--") && !(args[i - 1]?.startsWith("--") && args[i - 1] !== "--open"));
let port = Number(flag("--port", 4730));
let home, launchesDir, reqPath, settingsPath;
export function setHome(dir) {
	home = resolve(dir);
	launchesDir = join(home, "launches");
	reqPath = join(home, "request.json");
	settingsPath = join(home, "settings.json");
	mkdirSync(launchesDir, { recursive: true });
}
setHome(flag("--home", join(homedir(), ".product-release-checklist")));

const readJson = (p, d = null) => {
	try {
		return JSON.parse(readFileSync(p, "utf8"));
	} catch {
		return d;
	}
};
const fail = (status, message) => Object.assign(new Error(message), { status });
const okId = (id) => (/^[a-z0-9_-]{3,64}$/i.test(id ?? "") ? id : null);
const launchPath = (id) => join(launchesDir, `${okId(id) ?? "_"}.json`);
const versionOf = (id) => {
	try {
		return String(statSync(launchPath(id)).mtimeMs);
	} catch {
		return null;
	}
};
const writeAtomic = (p, body) => {
	writeFileSync(`${p}.tmp`, body);
	renameSync(`${p}.tmp`, p);
};
function loadLaunch(id) {
	if (!okId(id) || !existsSync(launchPath(id))) throw fail(404, `No launch "${id}"`);
	const raw = readJson(launchPath(id));
	if (!raw) throw fail(422, `${launchPath(id)} isn't valid JSON`);
	const { launch, errors } = normalize(raw);
	return { launch: { ...launch, id }, errors, version: versionOf(id) };
}
function saveLaunch(l) {
	const { launch, errors } = normalize(l);
	if (errors.length) throw fail(422, errors.join("\n"));
	launch.updatedAt = new Date().toISOString();
	writeAtomic(launchPath(launch.id), JSON.stringify(launch, null, "\t"));
	return { launch, version: versionOf(launch.id) };
}
const allLaunches = () =>
	readdirSync(launchesDir)
		.filter((f) => f.endsWith(".json"))
		.map((f) => {
			const { launch } = normalize(readJson(join(launchesDir, f), {}));
			return launch ? { ...launch, id: f.slice(0, -5) } : null;
		})
		.filter(Boolean);
const listLaunches = () => allLaunches().map(summary).sort((a, b) => a.t0.localeCompare(b.t0));

const DEFAULT_SETTINGS = { company: "", contextFile: "", exportDir: "" };
const loadSettings = () => ({ ...DEFAULT_SETTINGS, ...readJson(settingsPath, {}) });
function saveSettings(s) {
	const clean = Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => [k, String(s?.[k] ?? "").slice(0, 1000)]));
	writeAtomic(settingsPath, JSON.stringify(clean, null, "\t"));
	return clean;
}
const expand = (p) => (p ? resolve(p.replace(/^~(?=\/|$)/, homedir())) : "");

export function exportHtml(l) {
	const tokens = readFileSync(join(studio, "tokens.css"), "utf8");
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${l.name.replace(/[<&]/g, "")}</title><meta name="description" content="Launch plan: tier, readiness, message house, checklist and measurement">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700&display=swap">
<style>${tokens}\n${REPORT_CSS}</style></head>
<body class="export">
<header class="gc-bar"><span class="wordmark">GrowthCast</span><span class="product">Product Release Checklist</span></header>
${renderReport(l)}
<footer class="foot">Planned with Product Release Checklist by <a href="https://growthcast.app">GrowthCast</a> · exported ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</footer>
</body></html>`;
}
const studioUrl = (l) => `http://127.0.0.1:${port}/#${l.id}`;
export function exportTeamPlan(l) {
	const tokens = readFileSync(join(studio, "tokens.css"), "utf8");
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${l.name.replace(/[<&]/g, "")} · launch plan</title><meta name="description" content="Launch plan: milestones, team and roles, and who does what by when">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700&display=swap">
<style>${tokens}\n${TEAM_PLAN_CSS}</style></head>
<body class="export">
<header class="gc-bar"><span class="wordmark">GrowthCast</span><span class="product">Product Release Checklist · Launch plan</span></header>
${renderTeamPlan(l)}
<footer class="foot">Planned with Product Release Checklist by <a href="https://growthcast.app">GrowthCast</a> · exported ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</footer>
<script>${CHECK_SCRIPT(l.id)}</script>
</body></html>`;
}
function exportPack(l, out) {
	mkdirSync(join(out, "assets"), { recursive: true });
	const files = { ...renderMarkdownPack(l), "report.html": exportHtml(l), "team-plan.html": exportTeamPlan(l), "team-plan.md": renderTeamPlanMarkdown(l), "tasks.csv": renderTasksCsv(l) };
	for (const [f, body] of Object.entries(files)) writeFileSync(join(out, f), body);
	return Object.keys(files).map((f) => join(out, f));
}
const defaultOut = (l) => {
	const dir = expand(loadSettings().exportDir);
	return dir ? join(dir, `${l.t0.slice(0, 7)}-${l.slug}`) : join(home, "exports", l.id);
};

// The request the studio queues for Claude: [label, instructions]. SKILLS is the plugin's skills folder.
const KIND = {
	intake: ["Fill brief from note", "Run the launch-kickoff skill's intake on this launch: fill brief.* from the note (read any PRD, Linear or Notion link it gives), propose tier.scores with a one-line tier.reasons each, set measure.primary/activation if the note implies them, and add pressure-test findings to feedback.items (replace feedback). Don't invent customer evidence: leave it blank and add a finding instead."],
	tier: ["Score tier", "Score the five tier factors (tier.scores 0–3, tier.reasons one line each) from the brief and company context, following the launch-kickoff skill's rubric. Don't set tier.override."],
	messaging: ["Write message house", "Write the message house (message.*) with the launch-messaging skill. Leave message.status as draft: the user approves it in the studio. Put proof gaps in pillars as empty proof, not invented numbers."],
	assets: ["Draft assets", "Draft launch assets with the launch-assets skill into assets.<id>.body (Markdown), setting status \"draft\" and updatedBy \"claude\". Draft only the assets listed below (or, if none, every asset for this tier that has no body yet). The message house is the source: if it isn't approved, say so in chat and draft anyway, marking each draft \"based on an unapproved message house\"."],
	review: ["Red-team review", "Run the launch-readiness skill's red-team on this launch (use the launch-red-team agent if available, giving it the launch file). Write feedback = { at, summary, items: [{ severity: blocker|high|medium|info, area, text, fix, owner, item }] }, replacing the previous review. Don't change other fields."],
	measure: ["Plan measurement", "Use the launch-measure skill (plan + baseline) on measure.*: activation definition, events (keep entry_point), targets per stage (t7, t30) with their basis in the note field of item \"metric\", guardrails, holdout. If an analytics MCP (PostHog, Amplitude, Mixpanel, BigQuery, Supabase…) is connected, query baselines into stages.*.baseline; otherwise write the queries into the \"baseline\" item's note."],
	readout: ["Write readout", "Use the launch-measure skill to write the readout for the T+ window named in the note (default: the latest one due). Pull actuals into measure.stages.*.a7/a30/a90 and measure.channels from connected analytics; never invent numbers. Write measure.readouts.<7|30|90> = { verdict, recommendation, notes, at }."],
	retro: ["Run retro", "Run the launch-retro skill: fill retro.* from the checklist history, readiness, feedback and readouts, plus the note. Propose checklist additions as new entries in custom[] only if the note or the user agrees."],
	"video-script": ["Write video script", "Use the launch-video skill (Brief and Script): fill video.format/length/hook/concept from the brief and message house if they're empty, then write the two-column script and shot list into assets.announcement-video.body (status draft, updatedBy claude). Don't approve anything."],
	"video-produce": ["Plan or make the video", "Use the launch-video skill (Production): write the production plan (shots, capture checklist, voiceover, music, tools, schedule) into video.concept and the note on item video-production. If the note asks for an AI or hybrid cut and the video-gen plugin's ai-movie-making skill is available, follow it to produce the cut, then record the file path in video.rounds as a new round for review. Confirm costs with the user before any paid generation."],
	"video-review": ["Turn notes into revisions", "Use the launch-video skill (Review): turn the latest review round's notes (and the user's note) into a numbered, timestamped revision list in that round's notes, flag any notes that contradict the message house or each other, and say which approvers still need to sign off. If the round links a local video file and a video-watching tool is available, watch it and add your own timestamped notes."],
	plan: ["Publish team launch plan", "Export with `node \"TOOLS/studio.mjs\" export ID`, read the team-plan.html it writes, and publish it as a private claude.ai Artifact (load the artifact-design skill first; keep the page as exported apart from what that skill requires; the per-task checkboxes stay per-viewer). Give the user the link, say it's private until they share it, and point out any unstaffed roles or overloaded people listed on the page."],
	sync: ["Sync to Linear", "Follow the launch-linear-sync skill: get the payload with `node \"TOOLS/studio.mjs\" sync-plan ID`, use Composio's Linear tools to create or update the project, phase milestones and one issue per task (assigned by email, with due dates), pull the state of already-linked issues, and write everything back with `node \"TOOLS/studio.mjs\" link ID <result.json>`. Before the first sync of a launch, confirm the Linear team with the user."],
	share: ["Publish share link", "Export the launch with `node \"TOOLS/studio.mjs\" export ID`, read the report.html it writes, and publish it as a private claude.ai Artifact (load the artifact-design skill first; keep the page as exported apart from what that skill requires). Give the user the link and say it's private until they share it. Mention the Markdown pack folder."],
};
function requestContext(r) {
	const { launch } = loadLaunch(r.launchId);
	const s = loadSettings();
	const others = allLaunches().map(summary);
	const c = checks(launch, others);
	const rd = readiness(launch);
	const tier = tierOf(launch);
	const assetIds = (r.assetIds ?? []).filter((a) => ASSETS.some((x) => x.id === a));
	return [
		`Product release checklist request: ${KIND[r.kind][0]}`,
		`Launch: "${launch.name}" (${tier ? `T${tier}` : "tier not scored"}, T-0 ${launch.t0}, status ${launch.status}), file ${launchPath(launch.id)} (open at http://127.0.0.1:${port}/#${launch.id})`,
		`Readiness: ${VERDICT[rd.verdict]}; ${c.length} open checks (${c.filter((x) => x.severity === "error").length} errors).`,
		s.contextFile ? `Company context (read it first): ${expand(s.contextFile)}${s.company ? ` (${s.company})` : ""}` : "No company context file set (Settings in the studio). Ask for it if the request needs company facts.",
		assetIds.length ? `Assets: ${assetIds.join(", ")}` : "",
		r.note ? `The user's note: ${r.note}` : "No note.",
		`What to do: ${KIND[r.kind][1].replace("TOOLS", tools).replace("ID", launch.id)}`,
		`Skills live in ${join(plugin, "skills")}; the launch schema is in the product-release-checklist skill. Edit the launch JSON directly, never dropping fields, then run \`node "${join(tools, "studio.mjs")}" validate ${launch.id}\`. The open studio reloads by itself. Finish with a short summary in chat.`,
	]
		.filter(Boolean)
		.join("\n");
}

// --- CLI ---
const cli = {
	list: () => console.log(JSON.stringify(listLaunches(), null, 2)),
	new: () => {
		const t0 = flag("--t0");
		if (t0 && !validDate(t0)) throw fail(400, "--t0 must be yyyy-mm-dd");
		const { launch } = saveLaunch(newLaunch(positional.slice(1).join(" ") || "Untitled launch", t0));
		console.log(JSON.stringify({ id: launch.id, path: launchPath(launch.id), url: `http://127.0.0.1:${port}/#${launch.id}` }));
	},
	path: () => console.log(loadLaunch(positional[1]) && launchPath(positional[1])),
	validate: () => {
		const raw = existsSync(positional[1] ?? "") ? readJson(positional[1]) : readJson(launchPath(positional[1]));
		if (!raw) return console.log(JSON.stringify({ ok: false, errors: ["Not found or not valid JSON"] })), process.exit(1);
		const { launch, errors } = normalize(raw);
		const c = launch ? checks(launch, allLaunches().map(summary)) : [];
		console.log(JSON.stringify({ ok: !errors.length, errors, readiness: launch ? VERDICT[readiness(launch).verdict] : null, checks: c.map((x) => `${x.severity} ${x.area}: ${x.text}`) }, null, 2));
		process.exit(errors.length ? 1 : 0);
	},
	"sync-plan": () => {
		const { launch } = loadLaunch(positional[1]);
		console.log(JSON.stringify(linearPayload(launch, { studioUrl: studioUrl(launch) }), null, 2));
	},
	link: () => {
		const { launch } = loadLaunch(positional[1]);
		const res = readJson(positional[2] ?? "");
		if (!res) throw fail(400, "link needs a result JSON file: { teamId, teamName, projectId, projectUrl, milestones, issues, people, pulled }");
		const changed = applyLinearResult(launch, res);
		const { launch: saved } = saveLaunch(launch);
		console.log(JSON.stringify({ ok: true, linked: Object.keys(saved.sync.linear.issues).length, project: saved.sync.linear.projectUrl, changed }, null, 2));
	},
	export: () => {
		const { launch } = loadLaunch(positional[1]);
		const out = resolve(expand(flag("--out")) || defaultOut(launch));
		console.log(JSON.stringify({ dir: out, files: exportPack(launch, out) }, null, 2));
	},
};
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!isMain);
else if (cli[positional[0]]) {
	try {
		cli[positional[0]]();
	} catch (e) {
		console.error(e.message);
		process.exit(1);
	}
} else serve();

// --- Server ---
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".ttf": "font/ttf" };
export function serve(listenPort = port) {
	port = listenPort;
	const send = (res, status, body, headers = {}) => {
		const raw = typeof body === "string" || Buffer.isBuffer(body);
		res.writeHead(status, { "content-type": raw ? "text/plain; charset=utf-8" : "application/json", "cache-control": "no-store", ...headers });
		res.end(raw ? body : JSON.stringify(body));
	};
	const json = (req) =>
		new Promise((ok, no) => {
			const chunks = [];
			let size = 0;
			req.on("data", (c) => {
				size += c.length;
				if (size > 4e6) no(fail(413, "Too large")), req.destroy();
				else chunks.push(c);
			});
			req.on("end", () => {
				try {
					ok(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
				} catch {
					no(fail(400, "Body isn't JSON"));
				}
			});
			req.on("error", no);
		});
	const file = (res, path) => {
		if (!existsSync(path) || !statSync(path).isFile()) return send(res, 404, "Not found");
		res.writeHead(200, { "content-type": MIME[extname(path).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-cache" });
		createReadStream(path).pipe(res);
	};

	return createServer(async (req, res) => {
		try {
			const host = (req.headers.host ?? "").split(":")[0];
			if (!["127.0.0.1", "localhost"].includes(host)) return send(res, 403, "Forbidden");
			const url = new URL(req.url, "http://127.0.0.1");
			const parts = url.pathname.split("/").filter(Boolean);
			const route = `${req.method} /${parts.map((p, i) => (parts[0] === "api" && parts[1] === "launches" && i === 2 ? ":id" : p)).join("/")}`;
			const id = parts[2];

			if (req.method === "GET" && !parts.length) return file(res, join(studio, "index.html"));
			if (req.method === "GET" && parts.length === 1 && /^[a-z]+\.(m?js|css|svg|jpg|png)$/.test(parts[0])) return file(res, join(studio, parts[0]));
			if (req.method === "GET" && parts.length === 2 && parts[0] === "fonts" && /^[a-z0-9-]+\.ttf$/.test(parts[1])) return file(res, join(studio, "fonts", parts[1]));

			if (route === "GET /api/launches") return send(res, 200, listLaunches());
			if (route === "POST /api/launches") {
				const { name, t0, from } = await json(req);
				const base = from ? { ...structuredClone(loadLaunch(from).launch), ...newLaunch(name || "Copy", t0), items: {}, assets: {}, feedback: {}, retro: {}, sync: {} } : newLaunch(name || "Untitled launch", validDate(t0) ? t0 : undefined);
				return send(res, 201, saveLaunch(base));
			}
			if (route === "GET /api/launches/:id" && parts.length === 3) return send(res, 200, loadLaunch(id));
			if (route === "GET /api/launches/:id/version") return send(res, 200, { version: versionOf(id) });
			if (route === "PUT /api/launches/:id") {
				const base = req.headers["x-base-version"];
				const current = versionOf(id);
				if (current && base && base !== current) return send(res, 409, loadLaunch(id));
				return send(res, 200, saveLaunch({ ...(await json(req)), id }));
			}
			if (route === "DELETE /api/launches/:id") {
				rmSync(launchPath(id), { force: true });
				return send(res, 200, { ok: true });
			}
			if (route === "GET /api/launches/:id/report.html") return send(res, 200, exportHtml(loadLaunch(id).launch), { "content-type": "text/html; charset=utf-8" });
			if (route === "GET /api/launches/:id/team-plan.html") return send(res, 200, exportTeamPlan(loadLaunch(id).launch), { "content-type": "text/html; charset=utf-8" });
			if (route === "GET /api/launches/:id/tasks.csv") {
				const { launch } = loadLaunch(id);
				return send(res, 200, renderTasksCsv(launch), { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${launch.slug}-tasks.csv"` });
			}
			if (route === "POST /api/launches/:id/export") {
				const { launch } = loadLaunch(id);
				const out = defaultOut(launch);
				return send(res, 200, { dir: out, files: exportPack(launch, out) });
			}
			if (route === "GET /api/settings") return send(res, 200, loadSettings());
			if (route === "PUT /api/settings") return send(res, 200, saveSettings(await json(req)));

			if (route === "GET /api/request") return send(res, 200, readJson(reqPath));
			if (route === "POST /api/request") {
				const r = await json(req);
				if (!KIND[r.kind]) throw fail(400, `kind must be one of ${Object.keys(KIND).join(", ")}`);
				loadLaunch(r.launchId);
				const request = { id: Date.now().toString(36), kind: r.kind, launchId: r.launchId, note: String(r.note ?? "").slice(0, 6000), assetIds: (r.assetIds ?? []).slice(0, 40), at: Date.now(), deliveredAt: null };
				request.context = requestContext(request);
				writeAtomic(reqPath, JSON.stringify(request, null, 2));
				return send(res, 201, request);
			}
			if (route === "DELETE /api/request") {
				rmSync(reqPath, { force: true });
				return send(res, 200, { ok: true });
			}
			send(res, 404, "Not found");
		} catch (e) {
			send(res, e.status ?? 500, { error: e.message });
		}
	})
		.on("error", (e) => {
			if (!isMain) throw e;
			console.error(e.code === "EADDRINUSE" ? `Port ${port} is busy: the studio may already be running at http://127.0.0.1:${port}` : e.message);
			process.exit(1);
		})
		.listen(port, "127.0.0.1", () => {
			console.log(`Product release checklist at http://127.0.0.1:${port}  (launches in ${launchesDir})`);
			if (args.includes("--open")) spawn(process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open", [`http://127.0.0.1:${port}`], { stdio: "ignore", detached: true }).unref();
		});
}
