// GTM Positioning studio front end. Plain JS, no build. Polls the local server so files Claude writes appear live.
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const MODULES = [
  {
    id: "evidence",
    num: "00",
    name: "Evidence",
    title: "Bring the evidence, or send Claude to find it.",
    desc: "Upload interviews, reviews, decks and survey exports, add links worth reading, and brief a web research sweep. Claude turns it all into indexed research notes with verbatim quotes.",
  },
  {
    id: "jtbd",
    num: "01",
    name: "Jobs-to-be-Done",
    title: "What progress are customers hiring you for?",
    desc: "Core job statements, functional, emotional and social dimensions, the four forces of progress, true competition, and prioritized opportunities.",
  },
  {
    id: "positioning",
    num: "02",
    name: "Positioning",
    title: "Where you win, and for whom.",
    desc: "Competitive alternatives, unique attributes, a value map, ICP candidates, market category, and a positioning statement per ICP.",
  },
  {
    id: "pmm",
    num: "03",
    name: "ICP guidance",
    title: "Messaging for one ICP and one feature.",
    desc: "Pick an ICP from the positioning work. Claude updates the shared product marketing context and writes feature guidance for that ICP.",
  },
  {
    id: "copy",
    num: "04",
    name: "Copy",
    title: "Turn the strategy into words that convert.",
    desc: "Build a brief for ad or website copy. Every headline traces back to a job, a force, or a proof point.",
  },
];

const WEBSITE_FORMATS = [
  ["Homepage hero", "Headline, subhead, CTAs, proof"],
  ["Full landing page", "Hero to closing CTA"],
  ["Feature page", "Outcome-led feature story"],
  ["Pricing page", "Plans, anxieties, FAQs"],
  ["Navigation and microcopy", "Labels, states, errors"],
  ["Section rewrite", "Rework one existing section"],
];
const AD_PLATFORMS = [
  ["Google Search (responsive search ads)", "Headlines and descriptions"],
  ["Meta (Facebook and Instagram)", "Primary text, headline, CTA"],
  ["LinkedIn", "Intro text, headline, CTA"],
  ["X", "Post copy and card headline"],
  ["Reddit", "Title and body"],
  ["Other platform", "Name it in constraints"],
];
const FUNNEL = ["Problem aware", "Solution aware", "Product aware", "Ready to act"];
const ANGLES = ["Let the strategy map decide", "Push-led", "Pull-led", "Anxiety-reducing", "Social job", "One variation per angle"];
const URL_TYPES = ["Customer review", "Community thread", "Competitor page", "Interview or transcript", "Article or report", "Our own page", "Other"];
const RESEARCH_KINDS = [
  "Customer reviews (G2, Capterra, Trustpilot, app stores)",
  "Community discussions (Reddit, forums, Slack and Discord groups)",
  "Competitor websites, pricing, and positioning",
  "Category trends and market data",
  "Analyst and industry reports",
  "Job posts and hiring signals",
  "Our own site, docs, and changelog",
];
const ACCEPT = ".pdf,.docx,.doc,.pptx,.xlsx,.csv,.txt,.md,.json,.html,.rtf,.vtt,.srt";

const ui = {
  projects: [],
  project: null,
  runs: [],
  contextFile: null,
  slug: null,
  module: null,
  request: null,
  docPath: null,
  docMtime: 0,
  copy: { kind: null, format: null, funnelStage: null, angle: null },
  icpPick: null,
};

// --- Server ---
async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: opts.body ? { "content-type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? res.statusText);
  return data;
}
const qs = (o) => new URLSearchParams(o).toString();

function toast(msg, kind = "info") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = `toast ${kind}`;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 3600);
}
const remember = (k, v) => {
  try {
    localStorage.setItem(`ms.${k}`, v ?? "");
  } catch {}
};
const recall = (k) => {
  try {
    return localStorage.getItem(`ms.${k}`) || null;
  } catch {
    return null;
  }
};

// --- Data ---
const run = () => ui.runs.find((r) => r.slug === ui.slug);
const filesFor = (r, id) =>
  id === "evidence"
    ? [...(r?.evidence?.notes ? [{ ...r.evidence.notes, stage: "evidence" }] : []), ...(r?.evidence?.extracts ?? []).map((f) => ({ ...f, stage: "evidence" }))]
    : (r?.files ?? []).filter((f) => f.stage === id);
const stageDone = (r, id) => (id === "evidence" ? !!r?.evidence?.notes : filesFor(r, id).length > 0);
const evidenceCount = (r) => (r?.evidence?.uploads.length ?? 0) + (r?.evidence?.urls?.length ?? 0);
const queuedFor = (id) =>
  ui.request && !ui.request.delivered && ui.request.project === ui.project && ui.request.run === ui.slug && (ui.request.module === id || ui.request.stage === id || (id === "evidence" && ui.request.module === "research"));

async function loadProjects() {
  ui.projects = await api("/api/projects");
  const sel = $("#projectSelect");
  sel.innerHTML = ui.projects.length
    ? ui.projects.map((p) => `<option value="${esc(p.dir)}">${esc(p.name)}${p.workspace ? " (workspace)" : ""}</option>`).join("")
    : `<option value="">No projects</option>`;
  const saved = recall("project");
  ui.project = ui.projects.find((p) => p.dir === saved)?.dir ?? ui.projects[0]?.dir ?? null;
  if (ui.project) sel.value = ui.project;
}

async function refresh() {
  ui.request = await api("/api/request").catch(() => null);
  if (ui.project) {
    const data = await api(`/api/runs?${qs({ project: ui.project })}`).catch(() => ({ runs: [], contextFile: null }));
    ui.runs = data.runs;
    ui.contextFile = data.contextFile;
  } else {
    ui.runs = [];
  }
  if (ui.slug && !run()) ui.slug = null;
}

// --- Render: sidebar, request bar ---
function renderRuns() {
  $("#runList").innerHTML = ui.runs
    .map((r) => {
      const done = MODULES.filter((m) => m.id !== "evidence" && stageDone(r, m.id)).length;
      return `<li><button data-run="${esc(r.slug)}" class="${r.slug === ui.slug ? "active" : ""}">
        <b>${esc(r.state.product ?? r.slug)}</b>
        <span class="meta">${esc(r.state.feature || "Whole product")}</span>
        <span class="meta">${done}/4 modules · ${evidenceCount(r)} sources${r.state.icp ? ` · ${esc(r.state.icp)}` : ""}</span>
      </button></li>`;
    })
    .join("");
  $("#noRuns").hidden = ui.runs.length > 0 || !ui.project;
  $("#contextLink").hidden = !ui.contextFile;
}

function renderRequest() {
  const r = ui.request;
  $("#requestBar").hidden = !r;
  if (!r) return;
  const time = new Date(r.deliveredAt ?? r.setAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  $("#requestStatus").textContent = r.delivered ? `Sent to Claude ${time}` : "Queued: send any message in Claude Code";
  $("#requestSummary").textContent = r.summary;
}

// --- Render: run ---
function render() {
  renderRuns();
  renderRequest();
  const r = run();
  $("#welcome").hidden = !!r;
  $("#runView").hidden = !r;
  if (!r) return;

  $("#runEyebrow").textContent = `Run · ${r.dir}`;
  $("#runTitle").textContent = r.state.feature ? `${r.state.product}: ${r.state.feature}` : r.state.product ?? r.slug;
  $("#runSub").textContent = r.state.icp ? `ICP: ${r.state.icp}${r.state.icpSummary ? `. ${r.state.icpSummary}` : ""}` : "No ICP selected yet. Choose one in module 03.";

  $("#stepper").innerHTML = MODULES.map((m) => {
    const n = evidenceCount(r);
    const status = queuedFor(m.id)
      ? ["queued", "Queued"]
      : stageDone(r, m.id)
        ? ["done", m.id === "evidence" ? "Notes saved" : "Saved"]
        : m.id === "evidence" && n
          ? ["current", `${n} source${n === 1 ? "" : "s"} added`]
          : r.state.stage === m.id
            ? ["current", "Up next"]
            : ["", m.id === "evidence" ? "Optional" : "Not started"];
    return `<button data-module="${m.id}" class="${ui.module === m.id ? "active" : ""}">
      <span class="num">${m.num}</span><span class="name">${m.name}</span>
      <small class="status"><i class="dot ${status[0]}"></i>${status[1]}</small>
      ${(() => {
        const conf = m.id === "evidence" ? null : filesFor(r, m.id).at(-1)?.gaps?.confidence;
        return conf ? `<small class="conf ${conf}">${conf[0].toUpperCase() + conf.slice(1)} confidence</small>` : "";
      })()}
    </button>`;
  }).join("");
  renderModule(r);
}

// Keep what the user typed when a click re-renders the module.
function snapshotForm() {
  const key = `${ui.slug}:${ui.module}`;
  if (ui.formKey !== key) return {};
  return Object.fromEntries([...document.querySelectorAll("#module [id]")].filter((el) => "value" in el && el.tagName !== "BUTTON" && el.type !== "file" && el.type !== "checkbox").map((el) => [el.id, el.value]));
}

function renderModule(r) {
  const saved = snapshotForm();
  ui.formKey = `${ui.slug}:${ui.module}`;
  const m = MODULES.find((x) => x.id === ui.module);
  const files = filesFor(r, m.id);
  if (!files.some((f) => f.path === ui.docPath)) ui.docPath = files.at(-1)?.path ?? null;

  $("#module").innerHTML = `
    <div class="moduleHead">
      <div><span class="eyebrow">Module ${m.num}</span><h2 style="margin-top:14px">${m.title}</h2><p>${m.desc}</p></div>
    </div>
    <div class="moduleGrid">
      <div>${briefPanel(m, r)}${(() => {
        const revisable = m.id === "evidence" ? files.filter((f) => f.name === "research-notes.md") : files;
        return revisable.length ? revisePanel(revisable) : "";
      })()}</div>
      <div>
        ${files.length > 1 ? `<div class="docTabs">${files.map((f) => `<button class="choice ${f.path === ui.docPath ? "selected" : ""}" data-doc="${esc(f.path)}">${esc(f.name)}</button>`).join("")}</div>` : ""}
        ${gapsPanel(r, m)}
        <article class="doc" id="doc">${ui.docPath ? "" : emptyDoc(m)}</article>
      </div>
    </div>`;
  for (const [id, v] of Object.entries(saved)) {
    const el = document.getElementById(id);
    if (el && "value" in el) el.value = v;
  }
  bindModule(m, r);
  if (ui.docPath) loadDoc(true);
}

function emptyDoc(m) {
  if (m.id === "evidence")
    return `<div class="docEmpty"><b>00</b><span>No research notes yet. Add documents, links, or a research brief, then queue research.</span><span class="meta">Claude saves extracts and research-notes.md here.</span></div>`;
  return `<div class="docEmpty"><b>${m.num}</b><span>No output yet. Queue this module and send any message in Claude Code.</span><span class="meta">The file appears here as soon as Claude saves it.</span></div>`;
}

const facts = (pairs) => `<dl class="facts">${pairs.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
const choices = (name, items, selected, big = false) =>
  `<div class="choices">${items
    .map((it) => {
      const [label, sub] = Array.isArray(it) ? it : [it];
      return `<button type="button" class="choice ${big ? "big" : ""} ${selected === label ? "selected" : ""}" data-choice="${name}" data-value="${esc(label)}">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ""}</button>`;
    })
    .join("")}</div>`;
const notesField = (placeholder) => `<label><span>Notes for Claude (optional)</span><textarea id="notes" placeholder="${esc(placeholder)}"></textarea></label>`;
const queueButton = (enabled, label = "Queue for Claude") =>
  `<div class="actions"><button class="btn coral" id="queueBtn" ${enabled ? "" : "disabled"}>${label}</button></div>`;

function briefPanel(m, r) {
  const s = r.state;
  const prior = { positioning: "jtbd", pmm: "positioning", copy: "pmm" }[m.id];
  const warn = prior && !stageDone(r, prior) ? `<p class="hint">Module ${MODULES.find((x) => x.id === prior).num} has no saved output yet. Claude will flag missing inputs.</p>` : "";

  if (m.id === "evidence") return evidencePanels(r);
  if (m.id === "jtbd") {
    return `<section class="panel brief"><h3>Brief</h3>
      ${facts([["Product", s.product], ["Feature", s.feature || "Whole product"], ["Evidence", r.evidence.notes ? "research-notes.md + sources" : evidenceCount(r) ? `${evidenceCount(r)} sources, not yet processed` : "none yet (module 00)"]])}
      ${!r.evidence.notes && evidenceCount(r) ? `<p class="hint">Queue research in module 00 first for indexed quotes, or go ahead and Claude will read the raw sources.</p>` : ""}
      <label><span>Other evidence (optional)</span><input id="sources" value="${esc(s.sources)}" placeholder="e.g. a local folder, a shared drive path, or leave empty"></label>
      <label><span>Segments or circumstances</span><input id="segments" value="${esc(s.segments)}" placeholder="leave empty to discover them"></label>
      ${notesField("e.g. focus on teams switching from spreadsheets")}
      ${queueButton(true)}</section>`;
  }
  if (m.id === "positioning") {
    return `<section class="panel brief"><h3>Brief</h3>
      ${facts([["Input", filesFor(r, "jtbd")[0]?.name ?? "01-jtbd-analysis.md (missing)"], ["Output", "02-positioning.md + ICP candidates"]])}
      ${warn}${notesField("e.g. we suspect a subcategory play against legacy tools")}
      ${queueButton(true)}</section>`;
  }
  if (m.id === "pmm") {
    const picked = ui.icpPick ?? s.icp;
    const cards = r.icps.length
      ? `<div class="icpGrid">${r.icps
          .map(
            (c) => `<button type="button" class="icpCard ${picked === c.name ? "selected" : ""}" data-icp="${esc(c.name)}" data-summary="${esc(c.summary ?? "")}">
              <b>${esc(c.name)}</b>${c.summary ? `<p>${esc(c.summary)}</p>` : ""}${c.confidence ? `<span class="pill ${c.confidence === "high" ? "high" : ""}">${esc(c.confidence)} confidence</span>` : ""}
            </button>`,
          )
          .join("")}</div>`
      : `<p class="hint">No ICP candidates found yet. They come from the <code>json icp-candidates</code> block at the end of 02-positioning.md. Describe one below instead.</p>`;
    return `<section class="panel brief"><h3>Choose an ICP</h3>${cards}
      <label><span>Or describe a different ICP</span><input id="customIcp" placeholder="circumstance, job, and traits" value="${esc(picked && !r.icps.some((c) => c.name === picked) ? picked : "")}"></label>
      ${facts([["Feature", s.feature || "Whole product"]])}
      ${warn}${notesField("e.g. emphasize migration risk; legal requires no ROI claims")}
      ${queueButton(!!picked)}</section>`;
  }
  // copy
  const c = ui.copy;
  const formats = c.kind === "ad" ? AD_PLATFORMS : WEBSITE_FORMATS;
  const ready = s.icp && c.kind && c.format && c.funnelStage && c.angle;
  return `<section class="panel brief"><h3>Copy brief</h3>
    ${s.icp ? facts([["Audience", s.icp]]) : `<p class="hint">Choose an ICP in module 03 first.</p>`}
    <div class="choiceGroup"><span class="meta">What are you writing?</span>${choices("kind", [["Website copy", "Pages, sections, microcopy"], ["Ad copy", "Search and social ad sets"]], c.kind === "ad" ? "Ad copy" : c.kind === "website" ? "Website copy" : null, true)}</div>
    ${c.kind ? `<div class="choiceGroup"><span class="meta">${c.kind === "ad" ? "Platform" : "Page or element"}</span>${choices("format", formats, c.format)}</div>` : ""}
    ${c.format ? `<div class="choiceGroup"><span class="meta">Funnel stage</span>${choices("funnelStage", FUNNEL, c.funnelStage)}</div>
      <div class="choiceGroup"><span class="meta">Lead angle</span>${choices("angle", ANGLES, c.angle)}</div>
      <label><span>Conversion action</span><input id="conversionAction" placeholder="e.g. Start a free trial, Book a demo"></label>
      ${c.kind === "ad" ? `<label><span>Variations</span><input id="variations" type="number" min="1" max="12" value="3"></label>` : ""}
      <label><span>Constraints</span><textarea id="constraints" placeholder="character limits, tone, legal disclosures, prohibited claims${c.format === "Section rewrite" ? ", and where the current copy lives" : ""}"></textarea></label>
      ${notesField("anything else Claude should know")}` : ""}
    ${queueButton(ready)}</section>`;
}

function evidencePanels(r) {
  const ev = r.evidence;
  const rs = ev.research ?? {};
  const urls = ev.urls ?? [];
  const fmtSize = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
  const canQueue = ev.uploads.length || urls.length || rs.kinds?.length || rs.queries || rs.competitors;
  return `
    <section class="panel brief"><h3>Documents <span class="meta">${ev.uploads.length}</span></h3>
      <label class="dropzone" id="dropzone">
        <input type="file" id="fileInput" multiple accept="${ACCEPT}" hidden>
        <b>Drop files or click to upload</b>
        <span class="meta">Interview transcripts, reviews, survey exports, decks, call notes. PDF, DOCX, PPTX, XLSX, CSV, TXT, MD, VTT up to 50 MB.</span>
      </label>
      ${ev.uploads.length ? `<ul class="itemList">${ev.uploads.map((u) => `<li><span>${esc(u.name)}</span><span class="meta">${fmtSize(u.size)}</span><button class="linkBtn" data-del-upload="${esc(u.name)}">Remove</button></li>`).join("")}</ul>` : ""}
    </section>
    <section class="panel brief"><h3>Links <span class="meta">${urls.length}</span></h3>
      <label><span>URL</span><input id="urlInput" type="url" placeholder="https://www.g2.com/products/…/reviews"></label>
      <div class="row">
        <select id="urlType">${URL_TYPES.map((t) => `<option>${t}</option>`).join("")}</select>
        <button class="btn ghost" id="addUrlBtn" type="button">Add link</button>
      </div>
      <input id="urlNote" placeholder="Why it matters (optional)">
      ${urls.length ? `<ul class="itemList">${urls.map((u, i) => `<li><span><span class="pill">${esc(u.type)}</span> <a href="${esc(u.url)}" target="_blank" rel="noopener">${esc(u.url.replace(/^https?:\/\//, ""))}</a>${u.note ? `<br><span class="meta">${esc(u.note)}</span>` : ""}</span><button class="linkBtn" data-del-url="${i}">Remove</button></li>`).join("")}</ul>` : ""}
    </section>
    <section class="panel brief"><h3>Research brief</h3>
      <p class="hint">Claude searches the web for these and saves sources with access dates.</p>
      <div class="checks">${RESEARCH_KINDS.map((k) => `<label class="check"><input type="checkbox" data-kind="${esc(k)}" ${rs.kinds?.includes(k) ? "checked" : ""}><span>${esc(k)}</span></label>`).join("")}</div>
      <label><span>Competitors and alternatives</span><input id="rsCompetitors" value="${esc(rs.competitors)}" placeholder="e.g. Causal, Mosaic, spreadsheets, a fractional CFO"></label>
      <label><span>Searches to start from</span><textarea id="rsQueries" placeholder="one per line, e.g. &quot;how do you forecast marketing spend&quot; reddit">${esc(rs.queries)}</textarea></label>
      <label><span>Audience or market</span><input id="rsAudience" value="${esc(rs.audience)}" placeholder="e.g. Series A B2B SaaS in North America"></label>
      <div class="choiceGroup"><span class="meta">Depth</span>${choices("depth", [["standard", "A focused sweep"], ["deep", "Many sources, follow leads"]], rs.depth ?? "standard")}</div>
    </section>
    <section class="panel brief">
      ${notesField("e.g. prioritize churned-customer language; skip vendor blogs")}
      ${queueButton(canQueue, "Queue research for Claude")}
      ${canQueue ? "" : `<p class="hint">Add a document, a link, or a research brief first. Or skip straight to module 01.</p>`}
    </section>`;
}

async function saveSources(patch = {}) {
  const r = run();
  const current = { urls: r.evidence.urls ?? [], research: r.evidence.research ?? {} };
  const research = {
    ...current.research,
    kinds: [...document.querySelectorAll("[data-kind]")].filter((c) => c.checked).map((c) => c.dataset.kind),
    competitors: $("#rsCompetitors")?.value ?? current.research.competitors ?? "",
    queries: $("#rsQueries")?.value ?? current.research.queries ?? "",
    audience: $("#rsAudience")?.value ?? current.research.audience ?? "",
    ...(patch.research ?? {}),
  };
  try {
    const updated = await api("/api/sources", { method: "POST", body: { project: ui.project, run: ui.slug, urls: patch.urls ?? current.urls, research } });
    ui.runs = ui.runs.map((x) => (x.slug === updated.slug ? updated : x));
    return true;
  } catch (e) {
    toast(e.message, "error");
    return false;
  }
}

async function uploadFiles(files, gap = null) {
  for (const file of files) {
    toast(`Uploading ${file.name}…`);
    try {
      const res = await fetch(`/api/upload?${qs({ project: ui.project, run: ui.slug, name: file.name, ...(gap ?? {}) })}`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: file,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? res.statusText);
      ui.runs = ui.runs.map((x) => (x.slug === data.slug ? data : x));
    } catch (e) {
      toast(`${file.name}: ${e.message}`, "error");
      continue;
    }
  }
  toast("Upload finished.");
  render();
}

function bindEvidence() {
  const zone = $("#dropzone");
  if (!zone) return;
  $("#fileInput").addEventListener("change", (e) => uploadFiles([...e.target.files]));
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("over");
    uploadFiles([...e.dataTransfer.files]);
  });
  document.querySelectorAll("[data-del-upload]").forEach((b) =>
    b.addEventListener("click", async () => {
      const updated = await api("/api/upload", { method: "DELETE", body: { project: ui.project, run: ui.slug, name: b.dataset.delUpload } });
      ui.runs = ui.runs.map((x) => (x.slug === updated.slug ? updated : x));
      render();
    }),
  );
  const addUrl = async () => {
    const url = $("#urlInput").value.trim();
    if (!url) return;
    const urls = [...(run().evidence.urls ?? []), { url: /^https?:\/\//i.test(url) ? url : `https://${url}`, type: $("#urlType").value, note: $("#urlNote").value.trim() }];
    if (await saveSources({ urls })) {
      $("#urlInput").value = "";
      $("#urlNote").value = "";
      render();
    }
  };
  $("#addUrlBtn").addEventListener("click", addUrl);
  $("#urlInput").addEventListener("keydown", (e) => e.key === "Enter" && (e.preventDefault(), addUrl()));
  document.querySelectorAll("[data-del-url]").forEach((b) =>
    b.addEventListener("click", async () => {
      const urls = (run().evidence.urls ?? []).filter((_, i) => i !== Number(b.dataset.delUrl));
      if (await saveSources({ urls })) render();
    }),
  );
  document.querySelectorAll("[data-kind]").forEach((c) => c.addEventListener("change", async () => (await saveSources()) && render()));
  ["#rsCompetitors", "#rsQueries", "#rsAudience"].forEach((id) => $(id).addEventListener("change", () => saveSources()));
}

function revisePanel(files) {
  return `<section class="panel brief"><h3>Request a revision</h3>
    <label><span>File</span><select id="reviseFile">${files.map((f) => `<option ${f.path === ui.docPath ? "selected" : ""}>${esc(f.name)}</option>`).join("")}</select></label>
    <label><span>What should change?</span><textarea id="reviseNotes" placeholder="e.g. the second job reads like a feature; reframe it around the trigger"></textarea></label>
    <div class="actions"><button class="btn ghost" id="reviseBtn">Queue revision</button></div></section>`;
}

// --- Confidence and evidence gaps ---
// Each stage document ends with a json evidence-gaps block (parsed by the server). The panel flags weak claims and
// lets people add the source each one needs, then queues an update that Claude carries out.
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const idPart = (s) => String(s).replace(/[^\w-]/g, "_");

function gapsPanel(r, m) {
  if (m.id === "evidence") return "";
  const f = r.files.find((x) => x.path === ui.docPath);
  if (!f) return "";
  const rep = f.gaps;
  if (!rep) return `<p class="hint gapsNone">This document has no confidence check yet. Re-run the module or queue a revision to add one.</p>`;
  const own = (r.evidence.gapSources ?? []).filter((g) => g.file === f.name);
  const fresh = own.filter((g) => g.addedAt > f.mtime);
  const n = rep.gaps.length;
  const web = ui.gapWeb?.[f.name] ?? fresh.length === 0;
  return `<section class="gaps ${rep.confidence}" aria-label="Confidence and evidence gaps">
    <div class="gapsHead"><span class="conf ${rep.confidence}">${cap(rep.confidence)} confidence</span>${f.previous && f.previous !== rep.confidence ? `<span class="meta">was ${esc(f.previous)} before the last update</span>` : ""}</div>
    <h3>${n ? `${n} gap${n === 1 ? "" : "s"} would raise confidence` : "No open evidence gaps"}</h3>
    ${n ? `<p class="hint">Add a source to any gap: a link, a file, or what you know first-hand. Then queue an update. Claude rewrites only what the new evidence changes and keeps the old version in versions/.</p>` : ""}
    ${rep.gaps.map((g) => gapCard(g, f, own.filter((s) => s.gapId === g.id))).join("")}
    ${n ? `<div class="gapUpdate">
      <label class="check"><input type="checkbox" id="gapWeb" data-file="${esc(f.name)}" ${web ? "checked" : ""}><span>Also let Claude search the web for the open gaps</span></label>
      <button class="btn coral" id="gapUpdateBtn" data-file="${esc(f.name)}" ${fresh.length || web ? "" : "disabled"}>${fresh.length ? `Queue update with ${fresh.length} new source${fresh.length === 1 ? "" : "s"}` : web ? "Queue update with a web search" : "Add a source to update"}</button>
    </div>` : ""}
    <input type="file" id="gapFileInput" multiple accept="${ACCEPT}" hidden>
  </section>`;
}

function gapCard(g, f, sources) {
  const key = `${f.name}:${g.id}`;
  const open = ui.gapOpen?.key === key ? ui.gapOpen.form : null;
  const idp = idPart(key);
  const linkTypes = g.sources.filter((s) => URL_TYPES.includes(s));
  const asks = g.sources.filter((s) => s !== "Answer").map((s) => (s === "Document" ? "a document" : s.toLowerCase()));
  const attrs = `data-file="${esc(f.name)}" data-gap-id="${esc(g.id)}" data-idp="${idp}"`;
  return `<article class="gap">
    <div class="gapHead"><span class="conf ${g.confidence}">${cap(g.confidence)}</span>${g.section ? `<span class="meta">${esc(g.section)}</span>` : ""}</div>
    <p class="gapClaim">${esc(g.claim)}</p>
    ${g.why ? `<p class="hint">${esc(g.why)}</p>` : ""}
    ${g.need ? `<p class="gapNeed"><b>What would help:</b> ${esc(g.need)}</p>` : ""}
    ${asks.length ? `<p class="hint">Best sources: ${esc(asks.join(", "))}</p>` : ""}
    ${sources.length ? `<ul class="itemList">${sources
      .map((s) => `<li><span>${esc(s.kind === "url" ? s.url.replace(/^https?:\/\//, "") : s.name)}<br><span class="meta">${s.kind === "answer" ? "Your answer" : s.kind === "url" ? esc(s.type) : "Document"} · ${s.addedAt > f.mtime ? "new" : "used in this version"}</span></span><button class="linkBtn" data-del-gap="${esc(s.id)}">Remove</button></li>`)
      .join("")}</ul>` : ""}
    <div class="gapActions">
      <button type="button" class="btn ghost small" data-gap-open="link" data-key="${esc(key)}" aria-expanded="${open === "link"}">Add a link</button>
      <button type="button" class="btn ghost small" data-gap-upload ${attrs}>Upload a file</button>
      ${g.sources.includes("Answer") || g.question ? `<button type="button" class="btn ghost small" data-gap-open="answer" data-key="${esc(key)}" aria-expanded="${open === "answer"}">Answer it</button>` : ""}
    </div>
    ${open === "link" ? `<div class="gapForm">
      <label><span>URL</span><input id="gapUrl-${idp}" type="url" placeholder="https://"></label>
      <div class="row"><select id="gapType-${idp}" aria-label="Link type">${URL_TYPES.map((t) => `<option ${t === (linkTypes[0] ?? URL_TYPES[0]) ? "selected" : ""}>${t}</option>`).join("")}</select>
      <button type="button" class="btn ghost" data-gap-link ${attrs}>Add link</button></div>
    </div>` : ""}
    ${open === "answer" ? `<div class="gapForm">
      <label><span>${esc(g.question || "What do you know about this?")}</span><textarea id="gapAnswer-${idp}" placeholder="Facts, numbers, or what customers have told you"></textarea></label>
      <p class="hint">Saved as a note. Claude treats it as your first-hand knowledge, not as customer evidence.</p>
      <div class="actions"><button type="button" class="btn ghost" data-gap-answer data-question="${esc(g.question)}" ${attrs}>Save answer</button></div>
    </div>` : ""}
    ${g.searches.length ? `<p class="hint">A web search would start from: ${esc(g.searches.map((q) => `"${q}"`).join(", "))}</p>` : ""}
  </article>`;
}

async function gapSource(body, done) {
  try {
    const updated = await api("/api/gap-source", { method: "POST", body: { project: ui.project, run: ui.slug, ...body } });
    ui.runs = ui.runs.map((x) => (x.slug === updated.slug ? updated : x));
    ui.gapOpen = null;
    toast(done);
    render();
  } catch (e) {
    toast(e.message, "error");
  }
}

function bindGaps() {
  document.querySelectorAll("[data-gap-open]").forEach((b) =>
    b.addEventListener("click", () => {
      const same = ui.gapOpen?.key === b.dataset.key && ui.gapOpen.form === b.dataset.gapOpen;
      ui.gapOpen = same ? null : { key: b.dataset.key, form: b.dataset.gapOpen };
      render();
    }),
  );
  document.querySelectorAll("[data-gap-link]").forEach((b) =>
    b.addEventListener("click", () => {
      const raw = $(`#gapUrl-${b.dataset.idp}`).value.trim();
      if (!raw) return;
      gapSource({ kind: "url", file: b.dataset.file, gapId: b.dataset.gapId, url: /^https?:\/\//i.test(raw) ? raw : `https://${raw}`, type: $(`#gapType-${b.dataset.idp}`).value }, "Link added.");
    }),
  );
  document.querySelectorAll("[data-gap-answer]").forEach((b) =>
    b.addEventListener("click", () => {
      const text = $(`#gapAnswer-${b.dataset.idp}`).value.trim();
      if (!text) return;
      gapSource({ kind: "answer", file: b.dataset.file, gapId: b.dataset.gapId, question: b.dataset.question, text }, "Answer saved.");
    }),
  );
  const input = $("#gapFileInput");
  document.querySelectorAll("[data-gap-upload]").forEach((b) =>
    b.addEventListener("click", () => {
      ui.gapFile = { file: b.dataset.file, gapId: b.dataset.gapId };
      input.click();
    }),
  );
  input?.addEventListener("change", (e) => uploadFiles([...e.target.files], ui.gapFile));
  document.querySelectorAll("[data-del-gap]").forEach((b) =>
    b.addEventListener("click", async () => {
      const updated = await api("/api/gap-source", { method: "DELETE", body: { project: ui.project, run: ui.slug, id: b.dataset.delGap } });
      ui.runs = ui.runs.map((x) => (x.slug === updated.slug ? updated : x));
      render();
    }),
  );
  $("#gapWeb")?.addEventListener("change", (e) => {
    ui.gapWeb = { ...(ui.gapWeb ?? {}), [e.target.dataset.file]: e.target.checked };
    render();
  });
  $("#gapUpdateBtn")?.addEventListener("click", (e) => sendRequest("gaps", { file: e.target.dataset.file, web: !!$("#gapWeb")?.checked }));
}

// --- Behaviour ---
function bindModule(m, r) {
  document.querySelectorAll("[data-doc]").forEach((b) =>
    b.addEventListener("click", () => {
      ui.docPath = b.dataset.doc;
      render();
    }),
  );
  document.querySelectorAll("[data-choice]").forEach((b) =>
    b.addEventListener("click", () => {
      const key = b.dataset.choice;
      const v = b.dataset.value;
      if (key === "depth") return saveSources({ research: { depth: v } }).then((ok) => ok && render());
      if (key === "kind") ui.copy = { kind: v === "Ad copy" ? "ad" : "website", format: null, funnelStage: null, angle: null };
      else ui.copy[key] = v;
      render();
    }),
  );
  document.querySelectorAll("[data-icp]").forEach((b) =>
    b.addEventListener("click", async () => {
      ui.icpPick = b.dataset.icp;
      await saveState({ icp: b.dataset.icp, icpSummary: b.dataset.summary || "" });
    }),
  );
  $("#customIcp")?.addEventListener("change", async (e) => {
    const v = e.target.value.trim();
    if (!v) return;
    ui.icpPick = v;
    await saveState({ icp: v, icpSummary: "" });
  });
  bindEvidence();
  bindGaps();
  $("#queueBtn")?.addEventListener("click", () => queue(m.id, r));
  $("#reviseBtn")?.addEventListener("click", () =>
    sendRequest("revise", { file: $("#reviseFile").value, notes: $("#reviseNotes").value }),
  );
}

async function saveState(patch) {
  try {
    await api("/api/state", { method: "POST", body: { project: ui.project, run: ui.slug, patch } });
    await refresh();
    render();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function queue(id, r) {
  const notes = $("#notes")?.value ?? "";
  if (id === "evidence") {
    if (!(await saveSources())) return;
    return sendRequest("research", { notes });
  }
  if (id === "jtbd") {
    const sources = $("#sources").value.trim();
    const segments = $("#segments").value.trim();
    if (sources !== (r.state.sources ?? "") || segments !== (r.state.segments ?? "")) {
      await api("/api/state", { method: "POST", body: { project: ui.project, run: ui.slug, patch: { sources, segments } } });
    }
  }
  const brief = { notes };
  if (id === "copy") {
    Object.assign(brief, ui.copy, {
      conversionAction: $("#conversionAction")?.value ?? "",
      variations: $("#variations")?.value ?? "",
      constraints: $("#constraints")?.value ?? "",
    });
  }
  await sendRequest(id, brief);
}

async function sendRequest(module, brief) {
  if (ui.request && !ui.request.delivered && !confirm("Replace the request that is already queued?")) return;
  try {
    ui.request = await api("/api/request", { method: "POST", body: { project: ui.project, run: ui.slug, module, brief } });
    toast("Queued. Send any message in Claude Code, even just \"go\".");
    render();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function loadDoc(force = false) {
  const r = run();
  const f = r?.files.find((x) => x.path === ui.docPath);
  const el = $("#doc");
  if (!f || !el) return;
  if (!force && f.mtime === ui.docMtime) return;
  try {
    const data = await api(`/api/file?${qs({ project: ui.project, path: f.path })}`);
    ui.docMtime = data.mtime;
    el.innerHTML = window.renderMarkdown(data.text, { hideFence: /icp-candidates|evidence-gaps/ });
  } catch (e) {
    el.innerHTML = `<p class="hint">${esc(e.message)}</p>`;
  }
}

function selectRun(slug) {
  ui.slug = slug;
  remember("run", slug);
  const r = run();
  const stage = r?.state.stage;
  ui.module = MODULES.some((m) => m.id === stage) ? stage : stage === "done" ? "copy" : "jtbd";
  if (ui.module === "jtbd" && !stageDone(r, "jtbd") && !stageDone(r, "evidence")) ui.module = "evidence";
  ui.icpPick = null;
  ui.docPath = null;
  render();
}

// --- Dialogs ---
function openDialog(title, bodyHtml, okLabel, onOk) {
  const d = $("#dialog");
  $("#dialogTitle").textContent = title;
  $("#dialogBody").innerHTML = bodyHtml;
  $("#dialogOk").textContent = okLabel;
  $("#dialogOk").hidden = !onOk;
  d.onclose = async () => {
    if (d.returnValue === "ok" && onOk) await onOk();
  };
  d.showModal();
}

function newRunDialog() {
  if (!ui.project) return addProject();
  openDialog(
    "New run",
    `<div class="brief">
      <label><span>Product</span><input id="nrProduct" required placeholder="e.g. Acme Billing"></label>
      <label><span>Feature to position</span><input id="nrFeature" placeholder="leave empty for the whole product"></label>
      <label><span>Segments or circumstances</span><input id="nrSegments" placeholder="leave empty to discover them"></label>
      <p class="hint">Next you can upload documents, add links, and brief web research in module 00. No local codebase needed.</p>
    </div>`,
    "Create run",
    async () => {
      try {
        const created = await api("/api/runs", {
          method: "POST",
          body: {
            project: ui.project,
            product: $("#nrProduct").value,
            feature: $("#nrFeature").value,
            segments: $("#nrSegments").value,
          },
        });
        await refresh();
        selectRun(created.slug);
        toast("Run created. Add evidence here, or skip to module 01.");
      } catch (e) {
        toast(e.message, "error");
      }
    },
  );
}

async function useProject(dir) {
  remember("project", dir);
  await loadProjects();
  ui.slug = null;
  await refresh();
  render();
  toast(`Project added: ${dir.split("/").pop()}`);
}

// A project is either a studio workspace (no codebase needed) or a folder on this Mac.
function addProject() {
  openDialog(
    "Add a project",
    `<div class="choices">
       <button type="button" class="choice big" data-add="workspace">New workspace<small>For any company or product. The studio keeps the files.</small></button>
       <button type="button" class="choice big" data-add="folder">Use a folder<small>Save outputs inside an existing project folder.</small></button>
     </div>
     <label id="wsField" hidden><span>Workspace name</span><input id="wsName" placeholder="e.g. Acme Billing"></label>`,
    "Create workspace",
    async () => {
      const name = $("#wsName").value.trim();
      if (!name) return;
      try {
        const { dir } = await api("/api/workspaces", { method: "POST", body: { name } });
        await useProject(dir);
      } catch (e) {
        toast(e.message, "error");
      }
    },
  );
  $("#dialogOk").hidden = true;
  document.querySelector('[data-add="workspace"]').addEventListener("click", (e) => {
    e.currentTarget.classList.add("selected");
    $("#wsField").hidden = false;
    $("#dialogOk").hidden = false;
    $("#wsName").focus();
  });
  document.querySelector('[data-add="folder"]').addEventListener("click", () => {
    $("#dialog").close("cancel");
    pickProjectFolder();
  });
}

// Opens the native folder picker; falls back to typing a path if the picker isn't available.
async function pickProjectFolder() {
  const btn = $("#addProjectBtn");
  btn.disabled = true;
  btn.textContent = "Choose a folder…";
  try {
    const res = await api("/api/pick-folder", { method: "POST", body: {} });
    if (res.dir) await useProject(res.dir);
  } catch (e) {
    toast(e.message, "error");
    addProjectDialog();
    return;
  } finally {
    btn.disabled = false;
    btn.textContent = "Add project";
  }
}

function addProjectDialog() {
  openDialog(
    "Add a project",
    `<p class="hint">The folder where outputs should live. Runs are saved under <code>output/positioning-workshop/</code> inside it.</p>
     <label><span>Folder path</span><input id="apDir" required placeholder="/Users/you/Code/your-product"></label>`,
    "Add",
    async () => {
      try {
        const { dir } = await api("/api/projects", { method: "POST", body: { dir: $("#apDir").value.trim() } });
        await useProject(dir);
      } catch (e) {
        toast(e.message, "error");
      }
    },
  );
}

// --- Wire up ---
$("#projectSelect").addEventListener("change", async (e) => {
  ui.project = e.target.value || null;
  remember("project", ui.project);
  ui.slug = null;
  await refresh();
  render();
});
$("#runList").addEventListener("click", (e) => {
  const b = e.target.closest("[data-run]");
  if (b) selectRun(b.dataset.run);
});
$("#stepper").addEventListener("click", (e) => {
  const b = e.target.closest("[data-module]");
  if (!b) return;
  ui.module = b.dataset.module;
  ui.docPath = null;
  render();
});
$("#newRunBtn").addEventListener("click", newRunDialog);
$("#welcomeNewRun").addEventListener("click", newRunDialog);
$("#addProjectBtn").addEventListener("click", addProject);
$("#clearRequestBtn").addEventListener("click", async () => {
  ui.request = await api("/api/request", { method: "DELETE" });
  render();
});
$("#previewRequestBtn").addEventListener("click", () => openDialog("Request for Claude", `<pre>${esc(ui.request?.context ?? "")}</pre>`, "", null));
$("#openContextBtn").addEventListener("click", async () => {
  try {
    const data = await api(`/api/file?${qs({ project: ui.project, path: ui.contextFile })}`);
    openDialog("Product marketing context", `<div class="doc">${window.renderMarkdown(data.text)}</div>`, "", null);
  } catch (e) {
    toast(e.message, "error");
  }
});

(async () => {
  await loadProjects();
  await refresh();
  const saved = recall("run");
  if (saved && ui.runs.some((r) => r.slug === saved)) selectRun(saved);
  else render();
  // Live updates: re-render only when something changed, so typing in a brief is never interrupted.
  setInterval(async () => {
    const before = JSON.stringify([ui.runs.map((r) => [r.slug, r.updated, r.state]), ui.request, ui.contextFile]);
    await refresh();
    const after = JSON.stringify([ui.runs.map((r) => [r.slug, r.updated, r.state]), ui.request, ui.contextFile]);
    if (before === after) return;
    const typing = document.activeElement?.matches("input, textarea, select") && $("#module").contains(document.activeElement);
    if (typing) {
      renderRuns();
      renderRequest();
      loadDoc();
    } else render();
  }, 3000);
})();
