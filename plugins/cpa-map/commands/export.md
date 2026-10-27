---
description: Export an account's CPA Map as a GrowthCast report, slide deck (HTML and PDF), action plan, account readout and actions CSV
argument-hint: "[account name or id] [--out dir]"
---

Export a CPA Map account.

1. Pick the account as in `/cpa-map:refresh`.
2. Run `node "${CLAUDE_PLUGIN_ROOT}/tools/cpamap.mjs" export <account id>` (add `--out <dir>` when the user names a
   place; the default is `~/.cpa-map/exports/<account id>/`). It writes `report.html`, `slides.html`, `slides.pdf`
   (printed with a local Chrome-family browser, skipped with a note if there isn't one: offer to run
   `npx -y playwright@1.56.1 install chromium-headless-shell` and export again, or print `slides.html` to PDF from any
   browser), `plan.md`, `readout.md` and `actions.csv`.
3. If the user wants the memo or the readout written with judgement rather than generated, follow the cpa-map skill's
   "Write the action list" / "Write the account readout" steps and save the result next to the pack.
4. Read `report.html`, then publish it as a private claude.ai Artifact when the user wants a link to share (load the
   artifact guide first; keep the page as exported). List the file paths.
