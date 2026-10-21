// The GTM Positioning studio: a local web app with one screen per module (JTBD, positioning, ICP guidance, copy).
// It reads runs from <project>/output/positioning-workshop/<slug>/, and queues a request that hooks/studio-context.mjs
// hands to Claude with the user's next message. Local only: it listens on 127.0.0.1 and answers only requests
// addressed to it.
// Usage: node studio/server.mjs [--port 4710] [--project <dir>] [--open]   |   node studio/server.mjs add <dir>
import { createServer } from "node:http";
import { pipeline } from "node:stream/promises";
import { createWriteStream, unlinkSync } from "node:fs";
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = (name, d) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : d;
};
const port = Number(flag("--port", 4710));
const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "public");
const home = join(homedir(), ".positioning-workshop");
mkdirSync(home, { recursive: true });
const regPath = join(home, "projects.json");
const reqPath = join(home, "request.json");
const RUNS = join("output", "positioning-workshop");
const CONTEXT_FILE = join(".claude", "product-marketing-context.md");
const workspacesDir = join(home, "workspaces");
const UPLOAD_TYPES = new Set([".pdf", ".docx", ".doc", ".pptx", ".xlsx", ".csv", ".txt", ".md", ".json", ".html", ".rtf", ".vtt", ".srt"]);
const UPLOAD_LIMIT = 50 * 1024 * 1024;
const URL_TYPES = ["Customer review", "Community thread", "Competitor page", "Interview or transcript", "Article or report", "Our own page", "Other"];

const readJson = (p, d = null) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return d;
  }
};
const writeJson = (p, v) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
const slugify = (v) =>
  String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "run";
const fail = (status, message) => Object.assign(new Error(message), { status });

// --- Projects ---
const addProject = (dir) => {
  const abs = resolve(dir);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) throw fail(400, `${abs} is not a folder`);
  writeJson(regPath, [...new Set([...readJson(regPath, []), abs])]);
  return abs;
};
if (args[0] === "add") {
  console.log(JSON.stringify({ added: addProject(args[1] ?? ".") }));
  process.exit(0);
}
if (flag("--project")) addProject(flag("--project"));

const projects = () => readJson(regPath, []).filter((d) => existsSync(d));
const known = (dir) => {
  if (!dir || !projects().includes(dir)) throw fail(404, "Unknown project");
  return dir;
};
// Resolve a path inside a project, refusing anything outside the runs folder or the shared context file.
const inside = (project, rel) => {
  const abs = resolve(project, rel);
  const runsRoot = resolve(project, RUNS) + sep;
  if (!(abs.startsWith(runsRoot) || abs === resolve(project, CONTEXT_FILE))) throw fail(403, "Path not allowed");
  if (existsSync(abs) && !realpathSync(abs).startsWith(realpathSync(project) + sep)) throw fail(403, "Path not allowed");
  return abs;
};

// Native macOS folder picker. Browsers never reveal a picked folder's real path, but the server runs on the same Mac.
const pickFolder = () =>
  new Promise((ok, bad) => {
    if (process.platform !== "darwin") return bad(fail(501, "The folder picker needs macOS. Type the path instead."));
    const start = [join(homedir(), "Code"), homedir()].find(existsSync);
    const script = [
      "activate",
      `set picked to choose folder with prompt "Choose the project folder for GTM Positioning outputs" default location (POSIX file ${JSON.stringify(start)})`,
      "POSIX path of picked",
    ];
    execFile("osascript", script.flatMap((line) => ["-e", line]), { timeout: 10 * 60e3 }, (err, stdout, stderr) => {
      if (!err) return ok(stdout.trim().replace(/\/$/, ""));
      if (/-128|User canceled/i.test(stderr)) return ok(null);
      bad(fail(500, `Folder picker failed: ${stderr.trim() || err.message}`));
    });
  });

// --- Runs ---
const STAGES = ["jtbd", "positioning", "pmm", "copy", "done"];
const stageOf = (name) =>
  name.startsWith("01-") ? "jtbd" : name.startsWith("02-") ? "positioning" : name.startsWith("03-") ? "pmm" : name.startsWith("04-") ? "copy" : null;

const readIcps = (file) => {
  try {
    const m = readFileSync(file, "utf8").match(/```json\s+icp-candidates\s*\n([\s\S]*?)```/);
    const parsed = m ? JSON.parse(m[1]) : [];
    return Array.isArray(parsed) ? parsed.filter((c) => c && typeof c.name === "string") : [];
  } catch {
    return [];
  }
};

// The evidence-gaps block every stage document ends with: overall confidence and the weak claims to fix.
// Same shape as the hosted GrowthCast Positioning Wizard.
const CONFIDENCE = ["high", "medium", "low"];
const GAP_SOURCES = ["Document", "Answer", "Customer review", "Community thread", "Competitor page", "Interview or transcript", "Article or report", "Our own page"];
const clean = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const level = (v, d) => (CONFIDENCE.includes(clean(v, 10).toLowerCase()) ? clean(v, 10).toLowerCase() : d);
function parseGaps(text) {
  const last = [...String(text ?? "").matchAll(/```json\s+evidence-gaps\s*\n([\s\S]*?)```/g)].at(-1);
  if (!last) return null;
  let parsed;
  try {
    parsed = JSON.parse(last[1]);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const seen = new Set();
  const gaps = (Array.isArray(parsed.gaps) ? parsed.gaps : [])
    .filter((g) => g && typeof g === "object" && clean(g.claim, 1))
    .slice(0, 6)
    .map((g, i) => {
      let id = clean(g.id, 24).replace(/[^\w-]/g, "") || `g${i + 1}`;
      if (seen.has(id)) id = `${id}-${i + 1}`;
      seen.add(id);
      return {
        id,
        section: clean(g.section, 120),
        claim: clean(g.claim, 400),
        confidence: level(g.confidence, "low"),
        why: clean(g.why, 400),
        need: clean(g.need, 400),
        sources: [...new Set((Array.isArray(g.sources) ? g.sources : []).map((x) => clean(x, 40)).filter((x) => GAP_SOURCES.includes(x)))],
        searches: (Array.isArray(g.searches) ? g.searches : []).map((x) => clean(x, 160)).filter(Boolean).slice(0, 3),
        question: clean(g.question, 300),
      };
    });
  const worst = gaps.some((g) => g.confidence === "low") ? "low" : gaps.length ? "medium" : "high";
  return { confidence: level(parsed.confidence, worst), gaps };
}
const readGaps = (file) => {
  try {
    return parseGaps(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

const runInfo = (project, slug) => {
  const dir = join(project, RUNS, slug);
  const state = readJson(join(dir, "state.json"), {});
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((name) => {
      const s = statSync(join(dir, name));
      // The newest saved copy in versions/ tells the studio what confidence was before the last gap update.
      const stem = name.replace(/\.md$/, "");
      const older = existsSync(join(dir, "versions"))
        ? readdirSync(join(dir, "versions")).filter((v) => v.startsWith(`${stem}.v`)).sort((a, b) => parseInt(a.slice(stem.length + 2)) - parseInt(b.slice(stem.length + 2)))
        : [];
      const previous = older.length ? readGaps(join(dir, "versions", older.at(-1)))?.confidence ?? null : null;
      return { name, path: join(RUNS, slug, name), stage: stageOf(name), mtime: s.mtimeMs, size: s.size, gaps: readGaps(join(dir, name)), previous };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const positioning = files.find((f) => f.stage === "positioning");
  const ev = join(dir, "evidence");
  const listDir = (d) => (existsSync(d) ? readdirSync(d).filter((f) => !f.startsWith(".")) : []);
  const evidence = {
    uploads: listDir(join(ev, "uploads")).map((name) => ({ name, size: statSync(join(ev, "uploads", name)).size })),
    extracts: listDir(join(ev, "extracts"))
      .filter((f) => f.endsWith(".md"))
      .map((name) => ({ name, path: join(RUNS, slug, "evidence", "extracts", name), mtime: statSync(join(ev, "extracts", name)).mtimeMs })),
    notes: existsSync(join(ev, "research-notes.md"))
      ? { name: "research-notes.md", path: join(RUNS, slug, "evidence", "research-notes.md"), mtime: statSync(join(ev, "research-notes.md")).mtimeMs }
      : null,
    ...readJson(join(ev, "sources.json"), { urls: [], research: null }),
    gapSources: readJson(join(ev, "gap-sources.json"), []),
  };
  return {
    evidence,
    slug,
    dir: join(RUNS, slug),
    state,
    files,
    icps: positioning ? readIcps(join(project, positioning.path)) : [],
    updated: Math.max(
      statSync(dir).mtimeMs,
      ...files.map((f) => f.mtime),
      ...evidence.extracts.map((f) => f.mtime),
      evidence.notes?.mtime ?? 0,
      existsSync(ev) ? statSync(ev).mtimeMs : 0,
      existsSync(join(ev, "uploads")) ? statSync(join(ev, "uploads")).mtimeMs : 0,
      existsSync(join(ev, "sources.json")) ? statSync(join(ev, "sources.json")).mtimeMs : 0,
      existsSync(join(ev, "gap-sources.json")) ? statSync(join(ev, "gap-sources.json")).mtimeMs : 0,
    ),
  };
};

const listRuns = (project) => {
  const root = join(project, RUNS);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((d) => statSync(join(root, d)).isDirectory())
    .map((d) => runInfo(project, d))
    .sort((a, b) => b.updated - a.updated);
};

const runDir = (project, slug) => {
  if (!slug || slug.includes("/") || slug.includes("..")) throw fail(400, "Bad run");
  const dir = join(project, RUNS, slug);
  if (!existsSync(dir)) throw fail(404, "Unknown run");
  return dir;
};

// --- Gap sources: links, uploads and answers added to close a flagged gap in one stage document ---
const gapTarget = (run, b) => {
  const file = run.files.find((f) => f.name === b.file);
  if (!file) throw fail(400, "Unknown document");
  const gap = file.gaps?.gaps.find((g) => g.id === b.gapId);
  if (!gap) throw fail(400, "That gap is no longer open");
  return { file: file.name, module: file.stage, gapId: gap.id, claim: gap.claim };
};
const addGapSource = (project, slug, record) => {
  const path = join(runDir(project, slug), "evidence", "gap-sources.json");
  mkdirSync(dirname(path), { recursive: true });
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  writeJson(path, [...readJson(path, []), { id, ...record, addedAt: Date.now() }]);
};

// --- Requests for Claude ---
const LABELS = {
  research: "Module 00: Evidence and research",
  jtbd: "Module 01: Jobs-to-be-Done analysis",
  positioning: "Module 02: Positioning statement exercise",
  pmm: "Module 03: ICP product marketing guidance",
  copy: "Module 04: Ad or website copy",
  revise: "Revision",
  gaps: "Close evidence gaps",
};

function buildRequest(project, slug, module, brief) {
  const run = runInfo(project, slug);
  const s = run.state;
  // Absolute paths, so Claude Code can be running in any folder.
  const rel = join(project, run.dir);
  const ctxFile = join(project, CONTEXT_FILE);
  const ev = run.evidence;
  const evDir = join(rel, "evidence");
  const hasEvidence = ev.uploads.length || ev.urls?.length || ev.notes || ev.extracts.length;
  const evidenceLine = hasEvidence
    ? `Evidence folder: ${evDir}. ${ev.notes ? `Start from ${ev.notes.name}, which indexes sources and verbatim quotes. ` : ""}Use uploads/, extracts/ and sources.json for proof points and customer language, and cite source IDs.`
    : "Evidence: none gathered in the studio.";
  const scope = s.feature ? `the "${s.feature}" feature of ${s.product}` : s.product;
  const notes = brief.notes?.trim() ? [`Notes from the user: ${brief.notes.trim()}`] : [];
  const head = [
    `Project: ${project}`,
    `Run folder: ${rel} (progress lives in ${rel}/state.json)`,
    "All paths below are absolute. Save exactly there, whatever folder this session runs in.",
    `Module: ${LABELS[module]}`,
    "",
  ];
  const tail = [
    "",
    "For web research use the firecrawl skills when available (firecrawl-search, firecrawl-scrape, firecrawl-parse), otherwise WebSearch and WebFetch. Record URLs and access dates.",
    "Follow the stage rules of the gtm-positioning:workshop command: honor the skill's evidence and quality gates, update state.json, and pause for the user's review after saving. Do not start another module.",
  ];
  let body;
  switch (module) {
    case "research": {
      const r = ev.research ?? {};
      const kinds = r.kinds?.length ? r.kinds.join("; ") : "none selected";
      body = [
        `Gather and organize evidence for ${scope}. Do not run the JTBD analysis yet.`,
        ev.uploads.length
          ? `1. Uploaded documents in ${join(evDir, "uploads")}: ${ev.uploads.map((u) => u.name).join(", ")}. Convert each to Markdown (firecrawl-parse, or Read for PDFs and text) and save to ${join(evDir, "extracts")}/<file name>.md.`
          : "1. No uploaded documents.",
        ev.urls?.length
          ? `2. Submitted URLs:\n${ev.urls.map((u, i) => `   U${i + 1}. [${u.type}] ${u.url}${u.note ? ` (${u.note})` : ""}`).join("\n")}\n   Scrape each (firecrawl-scrape) and save to ${join(evDir, "extracts")}/U<n>-<slug>.md. Note any page that fails to load.`
          : "2. No submitted URLs.",
        r.kinds?.length || r.queries || r.competitors
          ? [
              `3. Web research${r.depth === "deep" ? " (deep: follow leads across many sources)" : ""}. Look for: ${kinds}.`,
              r.competitors ? `   Competitors and alternatives to cover: ${r.competitors}.` : "",
              r.queries ? `   Start from these searches: ${r.queries}.` : "",
              r.audience ? `   Audience or market: ${r.audience}.` : "",
              "   Prefer first-party customer language (reviews, community threads, interviews) and independent sources over vendor claims.",
            ]
              .filter(Boolean)
              .join("\n")
          : "3. No web research requested.",
        `4. Write ${join(evDir, "research-notes.md")} with: a source table (ID, type, title, URL or path, access date); verbatim customer quotes with source IDs, grouped by struggle, trigger, alternative used, desired outcome, and anxiety; competitor positioning claims; themes with evidence strength; and evidence gaps with interview questions to close them.`,
        "Never invent or clean up quotations. Label anything inferred.",
      ];
      break;
    }
    case "jtbd":
      body = [
        `Run the gtm-positioning:jobs-to-be-done-analysis skill for ${scope}.`,
        evidenceLine,
        ...(ev.notes || ev.extracts.length ? ["Treat the gathered evidence as the primary source and say which findings are interview-derived, review-derived, or research-based hypotheses."] : []),
        `Other customer evidence: ${s.sources || (hasEvidence ? "none" : "none provided, so use web research and label findings as hypotheses")}`,
        `Segments or circumstances: ${s.segments || "discover them"}`,
        `Save the report to ${rel}/01-jtbd-analysis.md. Emphasize True Competition and Opportunities, since positioning builds on them.`,
      ];
      break;
    case "positioning":
      body = [
        `Run the gtm-positioning:positioning-statement skill for ${scope}.`,
        `JTBD report: ${rel}/01-jtbd-analysis.md`,
        evidenceLine,
        `Save to ${rel}/02-positioning.md, ending with the \`json icp-candidates\` block the skill defines.`,
      ];
      break;
    case "pmm": {
      const icp = s.icpSummary ? `${s.icp} (${s.icpSummary})` : s.icp;
      if (!icp) throw fail(400, "Choose an ICP first");
      body = [
        `Run the gtm-positioning:product-marketing-context skill for ${scope}, targeting this ICP: ${icp}.`,
        `Use ${rel}/01-jtbd-analysis.md and ${rel}/02-positioning.md as primary evidence. Prefer the auto-draft path and do not re-run JTBD research.`,
        evidenceLine,
        `1. Create or update ${ctxFile}, following the skill's review and confirmation rules before writing.`,
        `2. Write ICP-specific guidance to ${rel}/03-${slugify(s.icp)}-pmm-guidance.md: the ICP's core job and trigger for this feature, the ICP positioning statement, messaging pillars with proof, value framed as progress, dominant switching forces and how messaging acts on each, objections and responses, language to use and avoid, recommended channels and funnel stages, and evidence gaps.`,
      ];
      break;
    }
    case "copy": {
      if (!s.icp) throw fail(400, "Choose an ICP first");
      const n = (s.copyCount ?? run.files.filter((f) => f.stage === "copy").length) + 1;
      const isAd = brief.kind === "ad";
      const pmm = run.files.find((f) => f.stage === "pmm");
      body = [
        `Run the gtm-positioning:website-and-ad-copywriter skill.`,
        `Copy type: ${isAd ? `ad set for ${brief.format}` : brief.format}`,
        `Scope: ${scope}`,
        `Audience: ${s.icpSummary ? `${s.icp} (${s.icpSummary})` : s.icp}`,
        `Funnel stage: ${brief.funnelStage}`,
        `Lead angle: ${brief.angle}`,
        `Conversion action: ${brief.conversionAction || "[ask me]"}`,
        ...(isAd ? [`Variations: ${brief.variations || 3}`] : []),
        `Constraints: ${brief.constraints || "none beyond the skill defaults"}`,
        evidenceLine,
        `Context files: ${ctxFile}, ${pmm ? join(project, pmm.path) : `${rel}/03-*-pmm-guidance.md`}, and ${rel}/02-positioning.md. The user already confirmed the context, so skip the context checkpoint and flag material concerns briefly.`,
        `Save the copy, strategy map, and verification notes to ${rel}/04-copy-${n}-${slugify(brief.format)}.md and set copyCount to ${n} in state.json.`,
      ];
      break;
    }
    case "revise": {
      const file = [...run.files, ...(ev.notes ? [{ ...ev.notes, stage: "research" }] : [])].find((f) => f.name === brief.file);
      if (!file) throw fail(400, "Unknown file to revise");
      if (!brief.notes?.trim()) throw fail(400, "Add revision notes");
      const skill = {
        jtbd: "jobs-to-be-done-analysis",
        positioning: "positioning-statement",
        pmm: "product-marketing-context",
        copy: "website-and-ad-copywriter",
        research: "jobs-to-be-done-analysis",
      }[file.stage];
      body = [`Revise ${join(project, file.path)} using the gtm-positioning:${skill} skill's standards. Show the changes before overwriting.`];
      break;
    }
    case "gaps": {
      const file = run.files.find((f) => f.name === brief.file);
      if (!file?.gaps) throw fail(400, "That document has no confidence check");
      const own = (ev.gapSources ?? []).filter((g) => g.file === file.name);
      if (!own.length && !brief.web) throw fail(400, "Add a source to a gap, or let Claude search the web");
      const skill = { jtbd: "jobs-to-be-done-analysis", positioning: "positioning-statement", pmm: "product-marketing-context", copy: "website-and-ad-copywriter" }[file.stage];
      const versions = join(rel, "versions");
      const stem = file.name.replace(/\.md$/, "");
      const n = (existsSync(versions) ? readdirSync(versions).filter((f) => f.startsWith(`${stem}.v`)).length : 0) + 1;
      const where = (g) =>
        g.kind === "url" ? `${g.url} (${g.type})` : g.kind === "answer" ? `${join(project, g.path)} (first-hand answer from the team, not customer evidence)` : join(evDir, "uploads", g.name);
      body = [
        `Close the open evidence gaps in ${join(project, file.path)} using the gtm-positioning:${skill} skill's standards.`,
        `Open gaps (from the document's json evidence-gaps block):\n${file.gaps.gaps.map((g) => `- ${g.id} (${g.confidence}${g.section ? `, ${g.section}` : ""}): ${g.claim}${g.need ? ` Needed: ${g.need}` : ""}${g.searches.length ? ` Searches: ${g.searches.join("; ")}` : ""}`).join("\n") || "- none listed"}`,
        own.length
          ? `Sources the user added, labeled G1 onward:\n${own.map((g, i) => `   G${i + 1}. For gap ${g.gapId}: ${where(g)}`).join("\n")}\nRead or scrape each one; note any that fail to load.`
          : "The user added no sources.",
        brief.web
          ? "Also search the web for evidence on the open gaps, starting from their searches (firecrawl-search when available, otherwise WebSearch). Prefer first-party customer language and independent sources, and record URLs and access dates."
          : "Do not search the web. Work only from these sources and the document.",
        `First copy the current file to ${join(versions, `${stem}.v${n}.md`)}. Then update ${join(project, file.path)} in place: revise only the claims and sections the new evidence changes, cite the G IDs, change any claim the evidence contradicts, and end with a fresh json evidence-gaps block that reassesses every gap. Never raise confidence without a source that supports it.`,
        "Finish by reporting the change in confidence and which gaps closed.",
      ];
      break;
    }
    default:
      throw fail(400, "Unknown module");
  }
  return {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    setAt: Date.now(),
    delivered: false,
    project,
    run: slug,
    module,
    stage: module === "gaps" ? run.files.find((f) => f.name === brief.file)?.stage : module,
    summary: module === "gaps" ? `${LABELS.gaps} in ${brief.file}` : `${LABELS[module]} for ${scope}`,
    context: [...head, ...body, ...notes, ...tail].join("\n"),
  };
}

// --- HTTP ---
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".ttf": "font/ttf", ".svg": "image/svg+xml", ".jpg": "image/jpeg" };
const send = (res, status, body, type = "application/json") => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
};
const body = (req) =>
  new Promise((ok, bad) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1e6) bad(fail(413, "Too large"));
    });
    req.on("end", () => {
      try {
        ok(data ? JSON.parse(data) : {});
      } catch {
        bad(fail(400, "Bad JSON"));
      }
    });
  });

const server = createServer(async (req, res) => {
  try {
    const host = (req.headers.host ?? "").split(":")[0];
    if (!["127.0.0.1", "localhost"].includes(host)) throw fail(403, "Forbidden");
    const url = new URL(req.url, `http://${req.headers.host}`);
    const q = Object.fromEntries(url.searchParams);
    const upload = req.method === "POST" && url.pathname === "/api/upload";
    if (req.method !== "GET" && req.headers["content-type"] !== (upload ? "application/octet-stream" : "application/json")) throw fail(415, "Unsupported content type");

    if (url.pathname.startsWith("/api/")) {
      const route = `${req.method} ${url.pathname}`;
      if (route === "GET /api/projects")
        return send(
          res,
          200,
          projects().map((dir) => {
            const ws = readJson(join(dir, "workspace.json"));
            return { dir, name: ws?.name ?? dir.split(sep).pop(), workspace: !!ws };
          }),
        );
      if (route === "POST /api/pick-folder") {
        const picked = await pickFolder();
        return send(res, 200, picked ? { dir: addProject(picked) } : { cancelled: true });
      }
      if (route === "POST /api/workspaces") {
        const name = String((await body(req)).name ?? "").trim();
        if (!name) throw fail(400, "Name the workspace");
        const dir = join(workspacesDir, slugify(name));
        mkdirSync(dir, { recursive: true });
        writeJson(join(dir, "workspace.json"), { name, createdAt: new Date().toISOString() });
        return send(res, 200, { dir: addProject(dir) });
      }
      if (route === "POST /api/upload") {
        const project = known(q.project);
        const dir = join(runDir(project, q.run), "evidence", "uploads");
        const ext = extname(q.name ?? "").toLowerCase();
        if (!UPLOAD_TYPES.has(ext)) throw fail(400, `${ext || "That file type"} is not supported. Use ${[...UPLOAD_TYPES].join(", ")}.`);
        if (Number(req.headers["content-length"] ?? 0) > UPLOAD_LIMIT) throw fail(413, "Files must be 50 MB or smaller");
        mkdirSync(dir, { recursive: true });
        const stem = basename(q.name, extname(q.name)).replace(/[^\w .()-]+/g, "_").slice(0, 80) || "upload";
        let name = `${stem}${ext}`;
        for (let i = 2; existsSync(join(dir, name)); i++) name = `${stem}-${i}${ext}`;
        let size = 0;
        req.on("data", (c) => {
          size += c.length;
          if (size > UPLOAD_LIMIT) req.destroy(fail(413, "Files must be 50 MB or smaller"));
        });
        try {
          await pipeline(req, createWriteStream(join(dir, name)));
        } catch (err) {
          if (existsSync(join(dir, name))) unlinkSync(join(dir, name));
          throw err.status ? err : fail(400, "Upload failed");
        }
        if (q.gapId) addGapSource(project, q.run, { ...gapTarget(runInfo(project, q.run), q), kind: "upload", name });
        return send(res, 200, runInfo(project, q.run));
      }
      if (route === "POST /api/gap-source") {
        const b = await body(req);
        const project = known(b.project);
        const dir = runDir(project, b.run);
        const target = gapTarget(runInfo(project, b.run), b);
        if (b.kind === "url") {
          let parsed;
          try {
            parsed = new URL(String(b.url ?? "").trim());
          } catch {
            throw fail(400, `Not a valid URL: ${b.url}`);
          }
          if (!["http:", "https:"].includes(parsed.protocol)) throw fail(400, "Only http and https links");
          addGapSource(project, b.run, { ...target, kind: "url", url: parsed.href, type: URL_TYPES.includes(b.type) ? b.type : "Other" });
        } else if (b.kind === "answer") {
          const text = String(b.text ?? "").trim().slice(0, 8000);
          if (!text) throw fail(400, "Write an answer first");
          const answers = join(dir, "evidence", "answers");
          mkdirSync(answers, { recursive: true });
          let name = `${slugify(target.file.replace(/\.md$/, ""))}-${target.gapId}.md`;
          for (let i = 2; existsSync(join(answers, name)); i++) name = `${slugify(target.file.replace(/\.md$/, ""))}-${target.gapId}-${i}.md`;
          const question = String(b.question ?? "").trim().slice(0, 300) || target.claim;
          writeFileSync(join(answers, name), `# First-hand answer from the team\n\nThis is the team's own knowledge, not customer evidence.\n\nQuestion: ${question}\n\n${text}\n`);
          addGapSource(project, b.run, { ...target, kind: "answer", name, path: join(RUNS, b.run, "evidence", "answers", name) });
        } else throw fail(400, "Choose a link or an answer");
        return send(res, 200, runInfo(project, b.run));
      }
      if (route === "DELETE /api/gap-source") {
        const b = await body(req);
        const project = known(b.project);
        const path = join(runDir(project, b.run), "evidence", "gap-sources.json");
        const list = readJson(path, []);
        const gone = list.find((g) => g.id === b.id);
        if (gone?.kind === "answer") {
          const file = join(runDir(project, b.run), "evidence", "answers", basename(gone.name));
          if (existsSync(file)) unlinkSync(file);
        }
        if (gone?.kind === "upload") {
          const file = join(runDir(project, b.run), "evidence", "uploads", basename(gone.name));
          if (existsSync(file)) unlinkSync(file);
        }
        writeJson(path, list.filter((g) => g.id !== b.id));
        return send(res, 200, runInfo(project, b.run));
      }
      if (route === "DELETE /api/upload") {
        const b = await body(req);
        const project = known(b.project);
        const file = join(runDir(project, b.run), "evidence", "uploads", basename(String(b.name ?? "")));
        if (existsSync(file)) unlinkSync(file);
        return send(res, 200, runInfo(project, b.run));
      }
      if (route === "POST /api/sources") {
        const b = await body(req);
        const project = known(b.project);
        const dir = join(runDir(project, b.run), "evidence");
        const urls = (Array.isArray(b.urls) ? b.urls : []).map((u) => {
          let parsed;
          try {
            parsed = new URL(String(u.url).trim());
          } catch {
            throw fail(400, `Not a valid URL: ${u.url}`);
          }
          if (!["http:", "https:"].includes(parsed.protocol)) throw fail(400, `Only http and https links: ${u.url}`);
          return { url: parsed.href, type: URL_TYPES.includes(u.type) ? u.type : "Other", note: String(u.note ?? "").slice(0, 300) };
        });
        const r = b.research ?? {};
        const research = {
          kinds: (Array.isArray(r.kinds) ? r.kinds : []).map(String).slice(0, 12),
          competitors: String(r.competitors ?? "").slice(0, 1000),
          queries: String(r.queries ?? "").slice(0, 2000),
          audience: String(r.audience ?? "").slice(0, 500),
          depth: r.depth === "deep" ? "deep" : "standard",
        };
        mkdirSync(dir, { recursive: true });
        writeJson(join(dir, "sources.json"), { urls, research });
        return send(res, 200, runInfo(project, b.run));
      }
      if (route === "POST /api/projects") return send(res, 200, { dir: addProject((await body(req)).dir ?? "") });
      if (route === "GET /api/runs") {
        const project = known(q.project);
        return send(res, 200, { runs: listRuns(project), contextFile: existsSync(join(project, CONTEXT_FILE)) ? CONTEXT_FILE : null });
      }
      if (route === "GET /api/file") {
        const abs = inside(known(q.project), q.path ?? "");
        if (!existsSync(abs)) throw fail(404, "Not found");
        return send(res, 200, { path: q.path, text: readFileSync(abs, "utf8"), mtime: statSync(abs).mtimeMs });
      }
      if (route === "POST /api/runs") {
        const b = await body(req);
        const project = known(b.project);
        if (!b.product?.trim()) throw fail(400, "Product is required");
        const slug = slugify([b.product, b.feature].filter((v) => v?.trim()).join(" "));
        const dir = join(project, RUNS, slug);
        if (existsSync(join(dir, "state.json"))) throw fail(409, `A run named ${slug} already exists`);
        mkdirSync(dir, { recursive: true });
        const state = {
          product: b.product.trim(),
          feature: b.feature?.trim() ?? "",
          sources: b.sources?.trim() ?? "",
          segments: b.segments?.trim() ?? "",
          dir: join(RUNS, slug),
          stage: "jtbd",
          copyCount: 0,
        };
        writeJson(join(dir, "state.json"), state);
        return send(res, 200, runInfo(project, slug));
      }
      if (route === "POST /api/state") {
        const b = await body(req);
        const project = known(b.project);
        const file = join(runDir(project, b.run), "state.json");
        const allowed = ["icp", "icpSummary", "stage", "sources", "segments"];
        const patch = Object.fromEntries(Object.entries(b.patch ?? {}).filter(([k]) => allowed.includes(k)));
        if (patch.stage && !STAGES.includes(patch.stage)) throw fail(400, "Bad stage");
        writeJson(file, { ...readJson(file, {}), ...patch });
        return send(res, 200, runInfo(project, b.run));
      }
      if (route === "GET /api/request") return send(res, 200, readJson(reqPath, null));
      if (route === "POST /api/request") {
        const b = await body(req);
        const project = known(b.project);
        runDir(project, b.run);
        const request = buildRequest(project, b.run, b.module, b.brief ?? {});
        writeJson(reqPath, request);
        return send(res, 200, request);
      }
      if (route === "DELETE /api/request") {
        writeJson(reqPath, null);
        return send(res, 200, null);
      }
      throw fail(404, "No such route");
    }

    const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const abs = resolve(publicDir, rel);
    if (!abs.startsWith(publicDir + sep) || !existsSync(abs)) throw fail(404, "Not found");
    send(res, 200, readFileSync(abs), MIME[extname(abs)] ?? "application/octet-stream");
  } catch (err) {
    send(res, err.status ?? 500, { error: err.message });
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") console.log(`Port ${port} is busy: the studio is probably already running at http://127.0.0.1:${port}`);
  else console.error(err);
  process.exit(1);
});
server.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`GTM Positioning studio: ${url}`);
  if (args.includes("--open")) spawn("open", [url], { stdio: "ignore", detached: true }).unref();
});
