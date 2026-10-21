# GTM Positioning by GrowthCast

A guided product marketing workshop for Claude Code (and pi). It takes you from customer evidence to positioning and copy, saving one reviewable document per stage:

0. **Evidence and research** (optional): parse your documents, read the links you submit, and search the web for customer language, competitor claims, and market signals.
1. **Jobs-to-be-Done analysis** (`jobs-to-be-done-analysis` skill): core jobs, functional, emotional and social dimensions, forces of progress, true competition, and opportunities.
2. **Positioning statement exercise** (`positioning-statement` skill): competitive alternatives, unique attributes, value, ICP candidates, market category, and a positioning statement per ICP.
3. **ICP product marketing guidance** (`product-marketing-context` skill) for the feature and ICP you choose.
4. **Ad or website copy** (`website-and-ad-copywriter` skill) from a guided brief: copy type, page or platform, funnel stage, angle, conversion action, and constraints.

Every claim traces back to evidence. The skills never invent customers, quotes, metrics, or proof, and they label hypotheses. Every stage document ends with a confidence check that flags weak claims and names the sources that would close each gap, so you can add them and update the stage.

GrowthCast clients can also use the hosted version, the Positioning Wizard, in the [GrowthCast client portal](https://clients.growthcast.app).

## Install in Claude Code

```text
/plugin marketplace add ejwhite7/gtm-positioning
/plugin install gtm-positioning@growthcast
```

## Use

| Command | What it does |
|---|---|
| `/gtm-positioning:workshop` | Run the workshop in the terminal. Add a product and feature, or `next`, `status`, `copy`, or `gaps`. |
| `/gtm-positioning:studio` | Open the local studio: a GrowthCast-branded screen for each stage. |

Outputs land in `output/positioning-workshop/<product-feature>/`, plus a shared `.claude/product-marketing-context.md`. Run state lives in `state.json` in the run folder, so you can resume later.

For web research the workshop uses the Firecrawl skills when they are installed, and Claude Code's WebSearch and WebFetch otherwise.

## Confidence and evidence gaps

Each skill ends its document with a `json evidence-gaps` block: an overall confidence (high, medium, or low) and up to six weakly supported claims, each with why it is weak, the source that would fix it, suggested web searches, and a question your team can answer directly. The same format powers the hosted Positioning Wizard.

- **In the terminal**, the workshop reports confidence and the open gaps after every stage and offers to close them (or run `/gtm-positioning:workshop gaps`). Share documents, add links, answer the gap's question, or let Claude search the web. Claude keeps the previous version in `versions/`, rewrites only what the new evidence changes, and reassesses every gap.
- **In the studio**, a confidence panel sits above each document, and the stepper shows each stage's confidence. Each gap has **Add a link**, **Upload a file**, and **Answer it**, then **Queue update** hands the work to Claude.

Sources added for a gap are recorded in `evidence/gap-sources.json`, and answers are saved under `evidence/answers/`, labeled as the team's first-hand knowledge rather than customer evidence. Confidence never goes up without a source that supports the claim.

## Studio

The studio is a local web app at http://127.0.0.1:4710.

- **Projects:** a **workspace** works for any company or product, with no codebase needed; the studio keeps its files in `~/.positioning-workshop/workspaces/`. Or **use a folder** (macOS shows a folder picker).
- **00 Evidence:** upload documents (PDF, DOCX, PPTX, XLSX, CSV, TXT, MD, VTT, up to 50 MB each), add links tagged by type, and write a research brief (review sites, communities, competitors, trends, searches, standard or deep).
- **01 to 04:** fill in each brief and press **Queue for Claude**. Your next message in Claude Code, even just "go", carries the request; the document appears in the studio as soon as Claude saves it.
- **Confidence and gaps:** add sources to the flagged gaps above each document and queue an update.
- **Revisions:** queue revision notes against any saved document.

A `UserPromptSubmit` hook (`hooks/studio-context.mjs`) hands a queued request to Claude once. The server listens on 127.0.0.1 only and reads files only inside each registered project's `output/positioning-workshop/` folder and `.claude/product-marketing-context.md`.

## pi

```bash
pi install git:github.com/ejwhite7/gtm-positioning
```

Then run `/gtm-positioning` (`next`, `copy`, `status`, `cancel`). pi asks to continue when each stage's file is saved, shows progress in the status bar, and writes `state.json` so pi runs also appear in the studio.

## What it runs and connects to

- **Skills and commands** run inside Claude Code. When you ask for research, Claude uses the Firecrawl skills if you have installed them, otherwise Claude Code's WebSearch and WebFetch tools, under your normal Claude Code permissions. The plugin itself sends no data anywhere.
- **Studio server** (`/gtm-positioning:studio` runs `studio/server.mjs`): a local Node server bound to 127.0.0.1:4710. It answers only requests addressed to localhost, reads and writes files only inside the project folders you register plus `~/.positioning-workshop/`, and makes no outbound network requests. On macOS, **Use a folder** runs `osascript` to show the system folder picker.
- **Hook** (`hooks/studio-context.mjs`, on `UserPromptSubmit`): reads `~/.positioning-workshop/request.json`. When the studio has queued a request, it adds that request to your next message once and marks it delivered. It never blocks a message and makes no network requests.
- **No analytics, telemetry, or credentials.** The plugin asks for no API keys and reads no environment secrets.

## Layout

```text
.claude-plugin/   Claude Code plugin and marketplace manifests
commands/         workshop and studio commands
hooks/            hands queued studio requests to Claude
skills/           the four skills
studio/           local studio server and UI
extensions/       pi extension
package.json      pi package manifest
```

## License

Proprietary. Free to install and use for your own work; see [LICENSE](LICENSE). The bundled fonts are under the SIL Open Font License 1.1.

## Credits

Built by [GrowthCast](https://growthcast.app), GTM Engineering for growth. The studio bundles the Manrope and DM Mono typefaces, both licensed under the SIL Open Font License 1.1.
