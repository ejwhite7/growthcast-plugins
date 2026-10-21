import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ENTRY_TYPE = "positioning-workshop-state";
const SKILLS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "skills");

const STAGES = ["jtbd", "positioning", "pmm", "copy", "done"] as const;
type Stage = (typeof STAGES)[number];

const STAGE_LABELS: Record<Stage, string> = {
  jtbd: "Jobs-to-be-Done analysis",
  positioning: "Positioning statement exercise",
  pmm: "ICP product marketing guidance",
  copy: "Ad or website copy",
  done: "Done",
};

interface CopyRequest {
  kind: "website" | "ad";
  format: string;
  funnelStage: string;
  angle: string;
  conversionAction: string;
  variations?: string;
  constraints: string;
}

interface RunState {
  product: string;
  feature: string;
  sources: string;
  segments: string;
  dir: string;
  stage: Stage;
  stageStartedAt: number;
  icp?: string;
  icpSummary?: string;
  copyCount: number;
  copy?: CopyRequest;
}

interface IcpCandidate {
  name: string;
  summary?: string;
  confidence?: string;
}

const WEBSITE_FORMATS = [
  "Homepage hero",
  "Full landing page",
  "Feature page",
  "Pricing page",
  "Navigation and microcopy",
  "Section rewrite",
];
const AD_PLATFORMS = [
  "Google Search (responsive search ads)",
  "Meta (Facebook and Instagram)",
  "LinkedIn",
  "X",
  "Reddit",
  "Other platform",
];
const FUNNEL_STAGES = [
  "Problem aware (knows the pain, not the solutions)",
  "Solution aware (comparing approaches)",
  "Product aware (comparing vendors)",
  "Ready to act (retargeting or bottom of funnel)",
];
const ANGLES = [
  "Let the strategy map decide",
  "Push-led (name the current frustration)",
  "Pull-led (lead with the outcome)",
  "Anxiety-reducing (answer the switching risk)",
  "Social job (how they want to be seen)",
  "One variation per angle",
];

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "run"
  );
}

function skillPath(name: string): string {
  return join(SKILLS_DIR, name, "SKILL.md");
}

function stagePath(state: RunState, stage: Stage): string {
  switch (stage) {
    case "jtbd":
      return join(state.dir, "01-jtbd-analysis.md");
    case "positioning":
      return join(state.dir, "02-positioning.md");
    case "pmm":
      return join(state.dir, `03-${slugify(state.icp ?? "icp")}-pmm-guidance.md`);
    case "copy":
      return join(state.dir, `04-copy-${state.copyCount}-${slugify(state.copy?.format ?? "copy")}.md`);
    default:
      return state.dir;
  }
}

function scope(state: RunState): string {
  return state.feature ? `the "${state.feature}" feature of ${state.product}` : state.product;
}

function icpLabel(state: RunState): string {
  return state.icpSummary ? `${state.icp} (${state.icpSummary})` : state.icp ?? "";
}

function skillPreamble(skill: string): string {
  return `Read the skill file at \`${skillPath(skill)}\` in full and follow its instructions exactly for this task. It overrides any other copy of the \`${skill}\` skill.`;
}

function closing(stage: Stage): string {
  return `When the ${STAGE_LABELS[stage].toLowerCase()} is saved and I have reviewed it, I will continue with /gtm-positioning next. Do not start the next stage yourself.`;
}

function buildPrompt(state: RunState): string {
  const out = stagePath(state, state.stage);
  switch (state.stage) {
    case "jtbd":
      return [
        `GTM Positioning, stage 1 of 4: ${STAGE_LABELS.jtbd}.`,
        skillPreamble("jobs-to-be-done-analysis"),
        "",
        `Product: ${state.product}`,
        `Feature in focus: ${state.feature || "(whole product)"}`,
        `Customer evidence: ${state.sources || "none provided, so use project documents and web research and label findings as hypotheses"}`,
        `Segments or circumstances: ${state.segments || "discover them"}`,
        `Save the report to: ${out}`,
        "",
        "Pay particular attention to the True Competition and Opportunities sections, because the next stage builds a positioning statement and ICP candidates from them.",
        closing("jtbd"),
      ].join("\n");
    case "positioning":
      return [
        `GTM Positioning, stage 2 of 4: ${STAGE_LABELS.positioning}.`,
        skillPreamble("positioning-statement"),
        "",
        `Position ${scope(state)}.`,
        `JTBD report: ${stagePath(state, "jtbd")}`,
        `Save the positioning document to: ${out}`,
        "The file must end with the `json icp-candidates` block described in the skill. I will choose an ICP from it in the next stage.",
        closing("positioning"),
      ].join("\n");
    case "pmm":
      return [
        `GTM Positioning, stage 3 of 4: ${STAGE_LABELS.pmm}.`,
        skillPreamble("product-marketing-context"),
        "",
        `Selected ICP: ${icpLabel(state)}`,
        `Feature in focus: ${state.feature || "(whole product)"}`,
        `Inputs: the JTBD report at ${stagePath(state, "jtbd")} and the positioning document at ${stagePath(state, "positioning")}. Treat both as the primary evidence for the JTBD sections. Prefer the auto-draft path and do not re-run the JTBD research.`,
        "",
        "Produce two outputs:",
        "1. Create or update `.claude/product-marketing-context.md` as the skill describes, following its review and confirmation rules before writing.",
        `2. Write ICP-specific product marketing guidance for this feature and ICP to ${out}. Use the same evidence standards. Include: the ICP's core job and trigger for this feature, the positioning statement for this ICP, messaging pillars with proof, the feature's value framed as progress, the dominant switching forces and how messaging should act on each, objections and responses, customer language to use and avoid, recommended channels and funnel stages, and evidence gaps.`,
        closing("pmm"),
      ].join("\n");
    case "copy": {
      const c = state.copy!;
      return [
        `GTM Positioning, stage 4 of 4: ${STAGE_LABELS.copy}.`,
        skillPreamble("website-and-ad-copywriter"),
        "",
        `Copy type: ${c.kind === "ad" ? `ad set for ${c.format}` : c.format}`,
        `Scope: ${scope(state)}`,
        `Audience: ${icpLabel(state)}`,
        `Funnel stage: ${c.funnelStage}`,
        `Lead angle: ${c.angle}`,
        `Conversion action: ${c.conversionAction || "[ask me]"}`,
        ...(c.variations ? [`Variations: ${c.variations}`] : []),
        `Constraints: ${c.constraints || "none beyond the skill defaults"}`,
        "",
        `Context files: .claude/product-marketing-context.md, the ICP guidance at ${stagePath(state, "pmm")}, and the positioning at ${stagePath(state, "positioning")}. I already confirmed the context, so proceed without the context checkpoint and flag material concerns briefly.`,
        `Save the final copy, strategy map, and verification notes to: ${out}`,
        "After presenting, I may iterate on it here or start another piece with /gtm-positioning copy.",
      ].join("\n");
    }
    default:
      return "";
  }
}

async function readIcps(state: RunState, cwd: string): Promise<IcpCandidate[]> {
  try {
    const text = await readFile(join(cwd, stagePath(state, "positioning")), "utf8");
    const match = text.match(/```json\s+icp-candidates\s*\n([\s\S]*?)```/);
    if (!match) return [];
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed) ? parsed.filter((c) => c && typeof c.name === "string") : [];
  } catch {
    return [];
  }
}

function outputReady(state: RunState, cwd: string): boolean {
  const file = join(cwd, stagePath(state, state.stage));
  return existsSync(file) && statSync(file).mtimeMs >= state.stageStartedAt;
}

export default function (pi: ExtensionAPI) {
  let state: RunState | undefined;
  let prompting = false;
  let promptedFor: string | undefined;

  function save(ctx: ExtensionContext) {
    pi.appendEntry(ENTRY_TYPE, state ?? null);
    // Mirror progress to state.json so the studio and the Claude Code command see pi runs too.
    if (state) {
      try {
        const dir = join(ctx.cwd, state.dir);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "state.json"), `${JSON.stringify(state, null, 2)}\n`);
      } catch {}
    }
    refreshStatus(ctx);
  }

  function refreshStatus(ctx: ExtensionContext) {
    if (!state || state.stage === "done") {
      ctx.ui.setStatus("positioning-workshop", undefined);
      return;
    }
    const n = STAGES.indexOf(state.stage) + 1;
    ctx.ui.setStatus("positioning-workshop", `gtm-positioning ${n}/4: ${STAGE_LABELS[state.stage]}`);
  }

  async function startStage(ctx: ExtensionContext, stage: Stage) {
    if (!state) return;
    state.stage = stage;
    state.stageStartedAt = Date.now();
    promptedFor = undefined;
    save(ctx);
    if (stage === "done") {
      ctx.ui.notify(`GTM Positioning finished. Outputs are in ${state.dir}`, "info");
      return;
    }
    await mkdir(join(ctx.cwd, state.dir), { recursive: true });
    if (stage === "pmm") await mkdir(join(ctx.cwd, ".claude"), { recursive: true });
    pi.sendUserMessage(buildPrompt(state), ctx.isIdle() ? undefined : { deliverAs: "followUp" });
  }

  async function collectStart(ctx: ExtensionContext, initial: string): Promise<RunState | undefined> {
    const product = (await ctx.ui.input("Product to analyze", initial || "e.g. Acme Billing"))?.trim();
    if (!product) return;
    const feature = (await ctx.ui.input("Feature to position (leave empty for the whole product)", "e.g. usage-based invoicing"))?.trim() ?? "";

    const evidence = await ctx.ui.select("What customer evidence should the analysis use?", [
      "Documents (file paths anywhere on disk)",
      "Links (reviews, community threads, competitor pages)",
      "Research it for me (web search)",
      "None yet (research-based hypotheses)",
    ]);
    if (evidence === undefined) return;
    let sources = "";
    if (evidence.startsWith("Documents")) {
      const paths = (await ctx.ui.input("File or folder paths", "e.g. ~/Downloads/interviews/, ~/Desktop/survey.csv"))?.trim();
      sources = paths ? `Documents to read (parse PDFs and Office files with the firecrawl-parse skill when available): ${paths}` : "";
    } else if (evidence.startsWith("Links")) {
      const links = (await ctx.ui.input("Links, separated by spaces or commas", "https://www.g2.com/products/... https://reddit.com/r/..."))?.trim();
      sources = links ? `Links to scrape and cite (firecrawl-scrape when available): ${links}` : "";
    } else if (evidence.startsWith("Research")) {
      const brief = (await ctx.ui.input("What should the research cover?", "competitors, review sites, communities, searches"))?.trim();
      sources = `Run web research first (firecrawl-search when available) and save indexed notes with verbatim quotes and access dates to the run's evidence/research-notes.md. Focus: ${brief || "customer reviews, community discussions, and competitor positioning"}`;
    }
    const segments = (await ctx.ui.input("Segments or circumstances that matter most (optional)", "leave empty to discover"))?.trim() ?? "";

    const slug = slugify([product, feature].filter(Boolean).join(" "));
    return {
      product,
      feature,
      sources,
      segments,
      dir: join("output", "positioning-workshop", slug),
      stage: "jtbd",
      stageStartedAt: Date.now(),
      copyCount: 0,
    };
  }

  async function chooseIcp(ctx: ExtensionContext): Promise<IcpCandidate | undefined> {
    if (!state) return;
    const icps = await readIcps(state, ctx.cwd);
    const OTHER = "Describe a different ICP";
    if (!icps.length) {
      ctx.ui.notify("No `json icp-candidates` block found in the positioning file. Describe the ICP instead.", "warning");
    }
    const options = [...icps.map((c) => `${c.name}${c.summary ? `: ${c.summary}` : ""}`), OTHER];
    const picked = icps.length ? await ctx.ui.select("Which ICP should the product marketing guidance target?", options) : OTHER;
    if (picked === undefined) return;
    if (picked === OTHER) {
      const name = (await ctx.ui.input("Describe the ICP", "circumstance, job, and traits"))?.trim();
      return name ? { name } : undefined;
    }
    return icps[options.indexOf(picked)];
  }

  async function pickIcp(ctx: ExtensionContext): Promise<boolean> {
    const icp = await chooseIcp(ctx);
    if (!icp || !state) return false;
    state.icp = icp.name;
    state.icpSummary = icp.summary;
    return true;
  }

  async function collectCopy(ctx: ExtensionContext): Promise<CopyRequest | undefined> {
    const kind = await ctx.ui.select("What do you want to write?", ["Website copy", "Ad copy"]);
    if (!kind) return;
    const isAd = kind === "Ad copy";

    let format = isAd
      ? await ctx.ui.select("Which ad platform?", AD_PLATFORMS)
      : await ctx.ui.select("Which page or element?", WEBSITE_FORMATS);
    if (!format) return;
    if (format === "Other platform") format = (await ctx.ui.input("Platform and placement", "e.g. YouTube in-stream"))?.trim();
    if (format === "Section rewrite") {
      const section = (await ctx.ui.input("Which section, and where is the current copy?", "e.g. pricing FAQ at app/pricing/page.tsx"))?.trim();
      format = section ? `Section rewrite: ${section}` : format;
    }
    if (!format) return;

    const funnelStage = await ctx.ui.select("Where is the reader in the funnel?", FUNNEL_STAGES);
    if (!funnelStage) return;
    const angle = await ctx.ui.select("Which angle should lead?", ANGLES);
    if (!angle) return;
    const conversionAction = (await ctx.ui.input("Conversion action", "e.g. Start a free trial, Book a demo"))?.trim() ?? "";
    const variations = isAd ? (await ctx.ui.input("How many variations?", "3"))?.trim() || "3" : undefined;
    const constraints =
      (await ctx.ui.input("Constraints (optional)", "character limits, tone, legal disclosures, prohibited claims"))?.trim() ?? "";

    return { kind: isAd ? "ad" : "website", format, funnelStage, angle, conversionAction, variations, constraints };
  }

  async function startCopy(ctx: ExtensionContext) {
    if (!state) return;
    const copy = await collectCopy(ctx);
    if (!copy) return;
    state.copy = copy;
    state.copyCount += 1;
    await startStage(ctx, "copy");
  }

  async function advance(ctx: ExtensionContext) {
    if (!state) {
      ctx.ui.notify("No GTM Positioning run is active. Run /gtm-positioning to start one.", "warning");
      return;
    }
    if (!outputReady(state, ctx.cwd) && state.stage !== "done") {
      const proceed = await ctx.ui.confirm(
        "Stage output not found",
        `${stagePath(state, state.stage)} has not been written in this stage yet. Continue anyway?`,
      );
      if (!proceed) return;
    }
    switch (state.stage) {
      case "jtbd":
        return startStage(ctx, "positioning");
      case "positioning": {
        if (!(await pickIcp(ctx))) return;
        return startStage(ctx, "pmm");
      }
      case "pmm":
        return startCopy(ctx);
      case "copy": {
        const next = await ctx.ui.select("Copy saved. What next?", ["Write another piece of copy", "Finish the run"]);
        if (next === "Write another piece of copy") return startCopy(ctx);
        if (next === "Finish the run") return startStage(ctx, "done");
        return;
      }
      case "done":
        ctx.ui.notify(`This run is finished. Outputs are in ${state.dir}`, "info");
    }
  }

  function describe(): string {
    if (!state) return "No GTM Positioning run is active.";
    const lines = [
      `Product: ${state.product}${state.feature ? ` / ${state.feature}` : ""}`,
      `Stage: ${STAGE_LABELS[state.stage]}`,
      ...(state.icp ? [`ICP: ${state.icp}`] : []),
      `Outputs: ${state.dir}`,
    ];
    return lines.join("\n");
  }

  pi.on("session_start", async (_event, ctx) => {
    const entry = ctx.sessionManager
      .getBranch()
      .filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === ENTRY_TYPE)
      .pop() as { data?: RunState | null } | undefined;
    state = entry?.data ?? undefined;
    refreshStatus(ctx);
  });

  // When a stage's output file lands, offer to move on instead of making the user remember the command.
  pi.on("agent_settled", async (event, ctx) => {
    if (event.aborted || prompting || !ctx.hasUI || !state || state.stage === "done") return;
    if (!outputReady(state, ctx.cwd)) return;
    const key = `${state.stage}:${state.copyCount}`;
    if (promptedFor === key) return;
    promptedFor = key;

    const nextLabel =
      state.stage === "jtbd"
        ? "Continue to the positioning exercise"
        : state.stage === "positioning"
          ? "Choose an ICP and build product marketing guidance"
          : state.stage === "pmm"
            ? "Continue to ad or website copy"
            : "Write another piece of copy or finish";
    prompting = true;
    try {
      const choice = await ctx.ui.select(`${STAGE_LABELS[state.stage]} saved to ${stagePath(state, state.stage)}`, [
        nextLabel,
        "Keep refining this stage (run /gtm-positioning next when ready)",
      ]);
      if (choice === nextLabel) await advance(ctx);
    } finally {
      prompting = false;
    }
  });

  pi.registerCommand("gtm-positioning", {
    description: "JTBD, positioning, ICP marketing guidance, then ad or website copy",
    getArgumentCompletions: (prefix: string) =>
      ["start", "next", "status", "copy", "cancel"]
        .filter((s) => s.startsWith(prefix))
        .map((s) => ({ value: s, label: s })),
    handler: async (args, ctx) => {
      const [sub = "", ...rest] = args.trim().split(/\s+/);
      if (!ctx.hasUI) {
        ctx.ui.notify("gtm-positioning needs an interactive session.", "error");
        return;
      }

      switch (sub) {
        case "next":
          return advance(ctx);
        case "status":
          ctx.ui.notify(describe(), "info");
          return;
        case "copy":
          if (!state?.icp) {
            ctx.ui.notify("Choose an ICP first. Finish the positioning stage, then run /gtm-positioning next.", "warning");
            return;
          }
          return startCopy(ctx);
        case "cancel":
          state = undefined;
          save(ctx);
          ctx.ui.notify("GTM Positioning run cleared. Output files were kept.", "info");
          return;
      }

      const initial = sub === "start" ? rest.join(" ") : args.trim();
      if (state && state.stage !== "done" && sub !== "start") {
        const choice = await ctx.ui.select(`GTM Positioning run in progress\n${describe()}`, [
          "Continue to the next stage",
          "Re-run the current stage",
          "Jump to copywriting",
          "Start a new run",
          "Cancel",
        ]);
        if (choice === "Continue to the next stage") return advance(ctx);
        if (choice === "Re-run the current stage") {
          if (state.stage === "copy") return startCopy(ctx);
          return startStage(ctx, state.stage);
        }
        if (choice === "Jump to copywriting") {
          if (state.icp || (await pickIcp(ctx))) return startCopy(ctx);
          return;
        }
        if (choice !== "Start a new run") return;
      }

      const next = await collectStart(ctx, initial);
      if (!next) return;
      state = next;
      await startStage(ctx, "jtbd");
    },
  });
}
