# GrowthCast plugins for Claude Code

The `growthcast` marketplace: one place to install every GrowthCast plugin.

| Plugin | What it does | Repo |
|---|---|---|
| `gtm-positioning` | GTM Positioning by GrowthCast: evidence research, Jobs-to-be-Done, positioning, ICP guidance and copy | [ejwhite7/gtm-positioning](https://github.com/ejwhite7/gtm-positioning) |
| `paid-media-planner` | Paid Media Campaign Planner by GrowthCast: plan, mock and hand off paid campaigns across eight ad networks | [ejwhite7/paid-media-planner](https://github.com/ejwhite7/paid-media-planner) |
| `product-release-checklist` | Product Release Checklist by GrowthCast: tiered launch system from kickoff to T+90 readout | [ejwhite7/product-release-checklist](https://github.com/ejwhite7/product-release-checklist) |

## Install

```text
/plugin marketplace add ejwhite7/growthcast-plugins
/plugin install gtm-positioning@growthcast
/plugin install paid-media-planner@growthcast
/plugin install product-release-checklist@growthcast
```

## How releases reach the marketplace

Each plugin lives in its own repo. `.claude-plugin/marketplace.json` pins every plugin to a commit `sha` and records its
`version`. The **Sync plugin releases** workflow moves a pin only when the plugin's `plugin.json` on its default branch
carries a new version, so unreleased commits never ship.

The sync runs:
- right away, when a plugin repo's **Notify GrowthCast marketplace** workflow sends a `plugin-release` dispatch
  (needs the `MARKETPLACE_DISPATCH_TOKEN` secret in that repo);
- every 6 hours on a schedule, as a fallback;
- by hand: Actions → Sync plugin releases → Run workflow, or `node scripts/sync.mjs [plugin]` locally.

Each sync commit to `main` is a push, so the directory's webhook on this repo picks up the release.

To release a plugin: bump `version` in its `plugin.json`, add a CHANGELOG entry, run
`claude plugin validate --strict .`, merge to `main`, then `claude plugin tag . --push`.

## Adding a plugin

Add an entry to `plugins` in `.claude-plugin/marketplace.json` with `source: {source: "github", repo, sha}` and a
`version` that matches its `plugin.json`, run `claude plugin validate --strict .`, and copy
`.github/workflows/notify-marketplace.yml` from one of the existing plugin repos into the new one.
