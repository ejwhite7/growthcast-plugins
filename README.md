# GrowthCast plugins for Claude Code

The `growthcast` marketplace: one place to install every GrowthCast plugin.

| Plugin | What it does | Files |
|---|---|---|
| `gtm-positioning` | GTM Positioning by GrowthCast: evidence research, Jobs-to-be-Done, positioning, ICP guidance and copy | [`plugins/gtm-positioning`](plugins/gtm-positioning) · [source](https://github.com/ejwhite7/gtm-positioning) |
| `paid-media-planner` | Paid Media Campaign Planner by GrowthCast: plan, mock and hand off paid campaigns across eight ad networks | [`plugins/paid-media-planner`](plugins/paid-media-planner) · [source](https://github.com/ejwhite7/paid-media-planner) |
| `product-release-checklist` | Product Release Checklist by GrowthCast: tiered launch system from kickoff to T+90 readout | [`plugins/product-release-checklist`](plugins/product-release-checklist) · [source](https://github.com/ejwhite7/product-release-checklist) |

## Install

```text
/plugin marketplace add ejwhite7/growthcast-plugins
/plugin install gtm-positioning@growthcast
/plugin install paid-media-planner@growthcast
/plugin install product-release-checklist@growthcast
```

## How releases reach the marketplace

Each plugin's files live in this repo under `plugins/<name>/`, and `.claude-plugin/marketplace.json` points `source`
at that folder (`./plugins/<name>`). Day-to-day development still happens in each plugin's own repo (the GrowthCast
client portals run code from those repos). `sources.json` records which repo, commit and version each folder was copied
from.

The **Sync plugin releases** workflow copies a plugin in only when the `version` in its repo's `plugin.json` changes,
so unreleased commits never ship. It skips `.git`, `.github`, `node_modules` and any old `marketplace.json`. It runs:
- right away, when a plugin repo's **Notify GrowthCast marketplace** workflow sends a `plugin-release` dispatch
  (needs the `MARKETPLACE_DISPATCH_TOKEN` secret in that repo);
- every 6 hours on a schedule, as a fallback;
- by hand: Actions → Sync plugin releases → Run workflow, or `node scripts/sync.mjs [plugin] [--force]` locally.

Each sync commit to `main` is a push, so the directory's webhook on this repo picks up the release. Don't edit files
under `plugins/` here; the next sync overwrites them. Change the plugin's own repo instead.

To release a plugin: bump `version` in its `plugin.json`, add a CHANGELOG entry, run
`claude plugin validate --strict .`, merge to `main`, then `claude plugin tag . --push`.

## Adding a plugin

Add an entry to `plugins` in `.claude-plugin/marketplace.json` with `source: "./plugins/<name>"`, add
`"<name>": {"repo": "<owner>/<repo>", "sha": "", "version": ""}` to `sources.json`, run `node scripts/sync.mjs <name>`
and `claude plugin validate --strict .`, and copy
`.github/workflows/notify-marketplace.yml` from one of the existing plugin repos into the new one.
