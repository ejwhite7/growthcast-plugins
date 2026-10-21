---
description: GTM Positioning by GrowthCast. Guided run: JTBD analysis, positioning, ICP-specific marketing guidance for a feature, then ad or website copy.
argument-hint: "[product and feature] | next | status | copy | gaps"
---

# GTM Positioning by GrowthCast

You are running a four-stage product marketing workflow. Each stage uses one bundled skill and saves one file. The user reviews each stage before the next one starts.

| Stage | Skill | Output |
|---|---|---|
| 0. Evidence and research (optional) | firecrawl skills, or WebSearch and WebFetch | `<run>/evidence/research-notes.md` |
| 1. Jobs-to-be-Done analysis | `gtm-positioning:jobs-to-be-done-analysis` | `<run>/01-jtbd-analysis.md` |
| 2. Positioning statement exercise | `gtm-positioning:positioning-statement` | `<run>/02-positioning.md` |
| 3. ICP product marketing guidance | `gtm-positioning:product-marketing-context` | `.claude/product-marketing-context.md` and `<run>/03-<icp-slug>-pmm-guidance.md` |
| 4. Ad or website copy | `gtm-positioning:website-and-ad-copywriter` | `<run>/04-copy-<n>-<format-slug>.md` |

`<run>` is `output/positioning-workshop/<slug>`, where `<slug>` is the lowercased, hyphenated product and feature name. Record progress in `<run>/state.json` with the fields `product`, `feature`, `sources`, `segments`, `stage`, `icp`, and `copyCount`, so the run can resume in a later session.

User arguments: `$ARGUMENTS`

## Routing

- `status`: Find the most recently modified `output/positioning-workshop/*/state.json`, summarize it, and stop.
- `next`: Load that state and run the next stage.
- `gaps`: Load that state and run the gap check below on the most recently saved stage document.
- `copy`: Load that state and go straight to Stage 4. If no ICP is recorded, run the ICP selection from Stage 3 first.
- Anything else, or empty: If an unfinished run exists, ask with `AskUserQuestion` whether to continue it, re-run the current stage, jump to copywriting, or start a new run. Otherwise start a new run, using the arguments as the product and feature when present.

## Starting a Run

Collect inputs with `AskUserQuestion` and plain questions. Skip anything the arguments or project files already answer.

1. Product to analyze.
2. Feature to position, or the whole product.
3. Customer evidence. Ask with `AskUserQuestion` (multi-select): documents to share (file paths anywhere on disk), links to review (reviews, community threads, competitor pages), research it for me (web search), or none yet.
4. Segments or circumstances that matter most, or discover them.

The product does not need a local codebase. If the current folder is not the product's repo, ask where outputs should live, or use `~/.positioning-workshop/workspaces/<slug>/`.

Create `<run>/` and write `state.json` with `stage: "jtbd"`. Record links in `<run>/evidence/sources.json` as `{ "urls": [{ "url", "type", "note" }], "research": { "kinds", "competitors", "queries", "audience", "depth" } }`, and copy shared documents into `<run>/evidence/uploads/`.

## Stage 0: Evidence and Research (optional)

Run this when the user shared documents or links, or asked for research.

1. Convert each upload to Markdown (the `firecrawl-parse` skill, or Read for PDFs and text) and save it to `<run>/evidence/extracts/`.
2. Scrape each link (the `firecrawl-scrape` skill, otherwise WebFetch) and save it to `<run>/evidence/extracts/U<n>-<slug>.md`.
3. Run the requested web research (the `firecrawl-search` skill, otherwise WebSearch). Prefer first-party customer language and independent sources over vendor claims.
4. Write `<run>/evidence/research-notes.md`: a source table with IDs and access dates, verbatim quotes grouped by struggle, trigger, alternative, outcome and anxiety, competitor positioning, themes with evidence strength, and gaps with interview questions.

Never invent or clean up quotations. Later stages cite these source IDs.

## Stage 1: Jobs-to-be-Done Analysis

Invoke the `gtm-positioning:jobs-to-be-done-analysis` skill with the product, feature, evidence (start from `<run>/evidence/research-notes.md` when it exists), and segments. Tell it to save the report to `<run>/01-jtbd-analysis.md`. Emphasize the True Competition and Opportunities sections, since Stage 2 builds on them.

When the report is saved, summarize the core jobs and strongest forces in a few lines and run the confidence check. Then ask with `AskUserQuestion`: continue to positioning, close evidence gaps (when any are open), or keep refining the JTBD analysis.

## Stage 2: Positioning Statement Exercise

Invoke the `gtm-positioning:positioning-statement` skill. Point it at `<run>/01-jtbd-analysis.md` and the feature in focus, and tell it to save to `<run>/02-positioning.md`. The file must end with the `json icp-candidates` block that the skill defines.

When saved, show the recommended position, run the confidence check, and ask: continue to ICP selection, close evidence gaps (when any are open), or keep refining positioning.

## Stage 3: ICP Product Marketing Guidance

1. Read the `json icp-candidates` block from `<run>/02-positioning.md`.
2. Ask with `AskUserQuestion` which ICP to target. Use each candidate's name as the label and its summary and confidence as the description. Offer at most three candidates plus the automatic "Other" option for a custom ICP. If more than three exist, show the three with the highest confidence and mention the rest in the question text.
3. Record the ICP in `state.json`.
4. Invoke the `gtm-positioning:product-marketing-context` skill. Give it the JTBD report and positioning document as primary evidence, prefer the auto-draft path, and do not re-run JTBD research. It must:
   - Create or update `.claude/product-marketing-context.md`, following the skill's review and confirmation rules before writing.
   - Write ICP-specific guidance for the selected feature and ICP to `<run>/03-<icp-slug>-pmm-guidance.md`. Include the ICP's core job and trigger for this feature, the ICP positioning statement, messaging pillars with proof, the feature's value framed as progress, the dominant switching forces and how messaging should act on each, objections and responses, customer language to use and avoid, recommended channels and funnel stages, and evidence gaps.

When saved, run the confidence check on the ICP guidance file and ask: continue to copywriting, close evidence gaps (when any are open), or keep refining the guidance.

## Stage 4: Ad or Website Copy

Guide the user through the brief with `AskUserQuestion`. Ask the first two questions in one call, then the rest in a second call.

1. **Copy type:** Website copy or Ad copy.
2. **Format:**
   - Website: Homepage hero, Full landing page, Feature page, Pricing page. The automatic "Other" option covers navigation, microcopy, and section rewrites. Ask for the current copy location on a rewrite.
   - Ad: Google Search (responsive search ads), Meta (Facebook and Instagram), LinkedIn. "Other" covers X, Reddit, and remaining platforms.
3. **Funnel stage:** Problem aware, Solution aware, Product aware, Ready to act.
4. **Lead angle:** Let the strategy map decide, Push-led, Pull-led, Anxiety-reducing. Mention that "Other" can request a social-job angle or one variation per angle.

Then ask in plain text for the conversion action, the number of variations for ads (default three), and any constraints such as character limits, tone, legal disclosures, or prohibited claims.

Increment `copyCount` in `state.json`. Invoke the `gtm-positioning:website-and-ad-copywriter` skill with the brief, the ICP, and these context files: `.claude/product-marketing-context.md`, `<run>/03-<icp-slug>-pmm-guidance.md`, and `<run>/02-positioning.md`. The user already confirmed the context, so the skill can skip its context checkpoint and flag material concerns briefly. Save the copy, strategy map, and verification notes to `<run>/04-copy-<n>-<format-slug>.md`.

After presenting the copy and running the confidence check, ask: write another piece of copy, close evidence gaps (when any are open), or finish the run. On finish, set `stage: "done"` and list every output file.

## Confidence Check and Closing Evidence Gaps

Every stage document ends with the `json evidence-gaps` block its skill defines. The studio reads the same block.

**Confidence check.** After saving a stage, read the last `json evidence-gaps` block in the file. Report the overall confidence and list each gap in a short table: section, claim, confidence, and what would help. If the block is missing or does not parse, say so and offer to add it.

**Closing gaps.** When the user chooses to close gaps, or runs `gaps`:

1. Ask with `AskUserQuestion` (multi-select) which gaps to work on. Offer up to four, most decision-critical first, using the claim as the label and the need as the description. Mention any others in the question text.
2. For each chosen gap, ask how the user will supply evidence: share documents (file paths), add links, answer the gap's question, or have Claude search the web starting from the gap's searches.
3. Save what they give:
   - Copy documents into `<run>/evidence/uploads/`.
   - Add links to `sources.json` under `urls`.
   - Write each answer to `<run>/evidence/answers/<stage>-<gap id>.md`, headed "First-hand answer from the team" and labeled as the team's own knowledge, not customer evidence.
   - Record every source in `<run>/evidence/gap-sources.json` as `{ "id", "file", "module", "gapId", "claim", "kind": "upload" | "url" | "answer", "name", "url", "type", "path", "addedAt" }`. `file` is the stage document's name and `addedAt` is milliseconds since the epoch. The studio writes the same file.
4. Read or scrape the new sources. Label them G1, G2, and so on.
5. Copy the current document to `<run>/versions/<file stem>.v<n>.md`. Then update the document in place with the stage's skill. Revise only the claims and sections that the new evidence changes, and cite the G IDs. Change any claim the evidence contradicts. Write a fresh `json evidence-gaps` block that reassesses every gap.
6. Report the change in confidence, which gaps closed, and which remain. Then return to the stage's continue question.

Never raise confidence without a source that supports the claim.

## Rules

- Never start the next stage before the user chooses to continue.
- Never claim a stage ran when it did not.
- Follow each skill's evidence, punctuation, and quality gate rules. Do not invent customers, quotes, metrics, or proof.
- If a stage's expected file is missing when moving on, say so and ask whether to continue anyway.
