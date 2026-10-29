# Changelog

## 0.3.0 — 2026-10-29

- Campaign, ad set (ad group) and ad filters are multi-select, with a type-to-find box in each; deep links take
  comma-separated ids. Ads are a new filter.
- Goals by stage: each of TOF / MOF / BOF can be graded on CPA or the secondary conversion and given its own target;
  kill and scale lines multiply it. The chart draws the stage's lines when one stage is filtered; the readout names them.
- Campaign stages: a table in Settings shows each campaign's tagged stage and lets you set it; per-ad overrides still win.
- The target can be a fixed CPA instead of a % under the account CPA.
- `?settings` opens the Settings drawer from a link.

## 0.2.3 — 2026-10-29

- Web mode: DELETE calls (disconnect a platform, dismiss a request) carry the JSON content type the portal proxy requires.

## 0.2.2 — 2026-10-29

- Google Ads: GAQL rows in camelCase (the REST JSON Composio returns) are read the same as snake_case rows. Before, hosted pulls through Composio built every ad with zero spend.

## 0.2.1 — 2026-10-29

- Web mode: when a connection can't list its ad accounts (for example a Meta system-user token without `ads_read`), the picker shows the platform's refusal and lets staff enter an account id directly.

## 0.2.0 — 2026-10-27
- GrowthCast studio: planner-style top bar, filter rail, inspector; Manrope and DM Mono; light and dark.
- Google Ads accounts (`gads_<customer id>`) next to Meta (`act_<id>`): GAQL pulls through BlueAlpha, ad types as formats, conversion categories as buckets.
- Filter by campaign and ad set (ad group), hide ads outside the filters, find box.
- Actions and Readout views; Export menu: HTML report, GrowthCast slides, slides PDF, report PDF, action plan and account readout (Markdown), actions CSV.
- Ask Claude: action memo, account readout, creative brief, tag check, explain an ad, refresh.

## 0.1.0 — 2026-10-27
- First build: Meta only, scatter with the four lines, kill / scale / revive calls, CSV.
