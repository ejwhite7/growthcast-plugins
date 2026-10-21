# Product Release Checklist by GrowthCast

A Claude Code plugin that runs product launches as a tiered system, from kickoff to the T+90 adoption readout. It comes
with a local studio where you work through each launch and ask Claude to do the heavy lifting.

## Install
```
/plugin marketplace add ejwhite7/product-release-checklist
/plugin install product-release-checklist@growthcast
/product-release-checklist:open
```
The studio runs at http://127.0.0.1:4730. It needs Node 20+ and has no npm dependencies.

## The studio
| Tab | What it's for |
|---|---|
| **Overview** | Tier, countdown, % done, overdue items, go/no-go verdict, and a T-30 → T+30 timeline of every item |
| **Brief & tier** | What ships, who it's for, the job, eligibility, pricing, rollout, and the 5-factor tier scorer (T1/T2/T3, with override + reason). Delete the launch from the bottom. |
| **Staffing** | Team roster (name, email, title, capacity), a role → person matrix for the roles this tier needs, per-person workload with peak week, and Linear sync status. Items inherit their owner from the role. |
| **Checklist** | ~73 items in 7 phases, filtered to the tier, with due dates counting back from T-0. Add, edit or delete items (default items can be restored; gates can only be waived). Owner, optional evidence link, waive with a reason. |
| **Video** | The launch video as a workstream: brief → script → UI freeze → production → review → master → cutdowns → hand-off → launch → performance. Concept (format, hook, talent, music, tools), script, review rounds with timestamped notes, PMM/Founder/Legal sign-off, rights, deliverables (hero, vertical, square, in-app loop, paid cuts, captions) and a hand-off packet per team. The approved hero cut is a go/no-go gate for T1/T2. |
| **Messaging** | Message house: one-liner, pillars + proof, objections, limits, CTAs per audience. Approve it to unlock assets. |
| **Assets** | 19 launch assets (founder post → support pack), each with a spec, status, owner and a Markdown draft |
| **Measure** | Activation definition, funnel targets vs actuals, events (verified staging/prod), guardrails, channel cost per activation, T+7/30/90 readouts |
| **Readiness** | Hard gates, open items, red-team findings → GO / GO WITH WAIVERS / NO-GO |
| **Retro** | Outcome, what worked, what didn't, process gaps, benchmarks for the next launch |
| **Portfolio** | Every launch on one calendar, with T1/T2 collisions flagged |

**Ask Claude** (left panel) queues a request: *Write video script*, *Plan or make the video* (uses the video-gen plugin for AI/hybrid cuts), *Turn notes into revisions*, *Sync to Linear*, *Publish team plan*, *Fill brief from note*, *Score tier*, *Write message house*, *Draft
assets*, *Red-team review*, *Plan measurement*, *Write readout*, *Run retro*. Send any message in Claude Code and the
request goes with it (via a `UserPromptSubmit` hook). Claude edits the launch file, and the studio reloads live.

**Team launch plan** (Share → Open the team launch plan) is the page to present: goals, milestones per phase, team and
roles, and a "who does what" section per person with due dates and checkboxes. **Tasks CSV** has the same rows for sheets.

**Sync to Linear** (Staffing tab, or Share) asks Claude to use Composio's Linear tools. It creates a project for the
launch, a milestone per phase, and one issue per open task, assigned by email with its due date. Issue ids are written back
(`studio.mjs link`), so re-syncs update instead of duplicating, and issues closed in Linear tick off the checklist with the
issue as evidence. The studio holds no API keys.

**Share** also opens a one-page report, exports a Markdown pack (brief, checklist, message house, tracking plan, readiness,
assets) to your export folder, or asks Claude to publish a private share link.

## Hosted in the GrowthCast client portal
The same studio runs as the portal's **Release Checklist** tab
([B2B-Saas-Inc/growthcast-release-checklist](https://github.com/B2B-Saas-Inc/growthcast-release-checklist), which copies
`studio/` and the skills from this repo). There, launches belong to client projects, the company context is written per
project, clients on a project can view its launches, and Ask Claude runs on the server. Linear is connected per project
through a Composio Connect link (the person picks the workspace on Composio's page), and the sync runs on the server.
Folder exports and share links stay Claude Code features. Web mode turns on only when the server's `api/settings` says `mode: "web"`.

## Data
- Launches: `~/.product-release-checklist/launches/<id>.json`
- Settings (company context file, export folder): `~/.product-release-checklist/settings.json`
- The checklist, tier rubric, asset specs and gates are defined once in `studio/model.mjs`

## CLI
```
node tools/studio.mjs [--port 4730] [--open]
node tools/studio.mjs list | new "<name>" --t0 yyyy-mm-dd | validate <id> | export <id> [--out dir]
node tools/studio.mjs sync-plan <id> | link <id> <result.json>
npm test
```

## What this plugin runs, stores and sends
- **Local server.** `/product-release-checklist:open` starts `node tools/studio.mjs` on `127.0.0.1:4730`. It binds to
  loopback only and refuses requests whose `Host` header isn't localhost. With `--open` it opens that URL in your default
  browser (`open` / `xdg-open` / `explorer`). It makes no outbound network requests and holds no API keys.
- **Files.** It reads and writes only `~/.product-release-checklist/` (launches, settings, a queued `request.json`) and,
  when you export, the export folder you set in Settings.
- **Hook.** A `UserPromptSubmit` hook runs `node tools/studio-context.mjs`. It reads `~/.product-release-checklist/request.json`
  and, if a studio request is waiting (and under 12 hours old), adds it to your next prompt once, then clears it. It
  sends nothing anywhere.
- **Exported pages** (`report.html`, `team-plan.html`) load the Manrope and DM Mono fonts from Google Fonts when opened.
  The studio itself uses the bundled fonts in `studio/fonts/`.
- **Third-party services, only when you ask.** *Sync to Linear* has Claude call Linear through your own Composio MCP
  connection (project, milestones, issues, assignee emails, due dates). Claude previews and asks before the first write.
  *Publish* asks Claude to publish a private claude.ai Artifact. *Plan or make the video* can use a video-generation plugin
  you have installed, after confirming costs. The plugin bundles no MCP servers and no credentials.
- **Changelog workflow template.** `skills/changelog-automation/reference/changelog-workflow.yml` is a GitHub Actions
  template you copy into your own repo. It is not run by the plugin. Once installed there, it sends release notes to the
  Anthropic API with your `ANTHROPIC_API_KEY` secret and opens a PR on your marketing site repo.
- **No telemetry.** Nothing about you or your launches leaves your machine unless you trigger one of the actions above.

## License
MIT. See [LICENSE](LICENSE).

## Also included
- Skills: `product-release-checklist` (studio + schema), `launch-kickoff`, `launch-messaging`, `launch-assets`, `launch-readiness`, `launch-measure`, `launch-retro`, `launch-video`, `launch-linear-sync` (Composio → Linear), `changelog-automation` (repo releases → curated marketing-site changelog)
- Agent: `launch-red-team`
- Commands: `/product-release-checklist:open`, `/product-release-checklist:share`
