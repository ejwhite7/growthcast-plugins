---
description: Export a launch as a one-page report and Markdown pack, and publish a private share link
argument-hint: "[launch id or name]"
---

Share a Product Release Checklist launch.

1. Find it: `node "${CLAUDE_PLUGIN_ROOT}/tools/studio.mjs" list`. Use the one `$ARGUMENTS` names, otherwise the one with
   the nearest upcoming T-0; if several are plausible, ask which.
2. Run `studio.mjs validate <id>` and mention the readiness verdict and any `error` checks.
3. Export: `node "${CLAUDE_PLUGIN_ROOT}/tools/studio.mjs" export <id>`. It writes `report.html` (self-contained) and the
   Markdown pack (brief, checklist, message house, tracking plan, readiness, retro, assets/) to the export folder.
4. Read `report.html`, then publish it as a private claude.ai Artifact (load the artifact-design skill first; keep the page
   as exported apart from what that skill requires). Give the user the link and say it's private until they share it.
