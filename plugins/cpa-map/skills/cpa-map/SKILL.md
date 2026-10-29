---
name: cpa-map
description: Build and work the CPA Map, a local GrowthCast studio that plots every Meta or Google ad (log lifetime spend × CPA) with account, target, kill and scale lines and calls each ad kill / scale / turn back on / testing / hold, with exports (report, slides, PDF, action plan, account readout). Use when a message carries a [CPA map request] block, when the user asks to map, audit, kill, scale or revive ads by CPA, to drop an account's CPA, to write a paid-media action plan or account readout, or to pull Meta or Google Ads ad-level data from BlueAlpha into the map.
---

# CPA Map

The studio (`tools/cpamap.mjs`, http://127.0.0.1:4731) shows **accounts**: `~/.cpa-map/accounts/<account id>/ads.json`
(one record per ad, built from raw BlueAlpha results) plus `settings.json` (lines, thresholds, the user's tag overrides,
manual calls and notes). Account ids are `act_<id>` for Meta and `gads_<customer id>` for Google Ads. The open studio
polls both files and reloads within three seconds, so the user watches your changes land. `<tools>` below is the
plugin's `tools/` folder; a request block gives its absolute path.

## The playbook the map implements

From "if I had to drop CPA 15% in a week": every ad with $100+ lifetime spend on one graph, log spend across, CPA up,
paused ads included. Four lines: current blended account CPA; target 15–20% under it; kill line 1.5× target; scale line
0.7× target. Filters: live / not live (live = spent anything in the last 30 days), format, funnel stage (TOF / MOF /
BOF from campaign tags and ad names), campaign, ad set, Y axis CPA or cost per add-to-cart. Then:

- **Step 5, not live:** paused ads under the scale line with 3+ purchases that aren't one-offs (promos, launches) go back on.
- **Step 6, live:** above the kill line and past the test budget: kill. More than half an AOV spent with zero purchases:
  kill. Under the scale line: raise budget 20% at a time, add variants and placements, stop when CPA crosses target.
- **Step 7, format:** compare video with video, static with static (search with search on Google); kill the worst of
  each format, scale the best, and brief new content from what separates them.
- **Step 8, stage:** grade TOF on cost per add-to-cart (or sign-up / lead), BOF on CPA.

The rules live in `studio/model.mjs` (`analyse`). Manual calls in `settings.decisions` beat the rules; `settings.overrides`
fix an ad's `format`, `stage` or `oneOff`; `settings.campaignStages` (campaign id → tof / mof / bof) sets a whole campaign's
stage over the name tags; `settings.targetMode` ("pct" | "cpa") with `targetCpa` fixes the target; `settings.stages.<tof|mof|bof>`
holds `{ basis: "" | "primary" | "secondary", target }` so each stage can be graded on its own conversion and target
(`result.stageLines` carries the lines in force); `settings.notes` is free text the exports carry.

## Pull: get an account's ads from BlueAlpha

All data comes through the BlueAlpha MCP (`mcp__bluealpha__search` → `mcp__bluealpha__execute`). Every call takes
`user_message` (the user's own words). Results for a big account are large: the harness saves them to a file and gives
you its path; copy that file with `cp`, don't read it into context. Save each result exactly as returned; the build
finds the rows wherever they sit in the JSON.

### Meta (`act_<id>`)

1. Find the account: `facebook_ads.list_facebook_ad_accounts`. Match the user's name to an `act_<id>`; note `name`,
   `currency` and `timezone_name`. If nothing matches, show the list and ask.
2. Create `~/.cpa-map/raw/<act_id>/` and save, one call each (not batched; each result may exceed the inline limit):
   - `lifetime.json`: `facebook_ads.get_facebook_insights` with `{"object_id":"<act_id>","date_preset":"maximum","level":"ad","action_types":["purchase","add_to_cart","initiate_checkout","complete_registration","lead"]}`.
     Meta's `maximum` preset reaches back about 37 months (`lifetime` is not a valid preset). Big accounts time out or
     fail on page two: pull yearly windows instead with `time_range: {"since","until"}` and save them as
     `lifetime-2024.json`, `lifetime-2025.json`, … (the build merges every `lifetime*.json` by ad id). Check the sum
     of `spend` against a `level: "account"` call saved as `account.json`.
   - `last30.json`: the same call with `"date_preset":"last_30d"` (this decides live / not live).
   - `last7.json`: the same with `"date_preset":"last_7d"` (shown in the inspector).
   - `campaigns.json`: `facebook_ads.list_facebook_campaigns` with `{"ad_account_id":"<act_id>","effective_status":["ACTIVE","PAUSED","ARCHIVED","WITH_ISSUES"]}`.
3. Build: `node "<tools>/cpamap.mjs" build <act_id> --name "<account name>" --currency <USD|CAD|…> --timezone "<tz>"`.

### Google Ads (`gads_<customer id>`)

1. Find the account: `google_ads.list_accessible_customers`, then for each id `google_ads.execute_query` with
   `SELECT customer.id, customer.descriptive_name, customer.manager, customer.currency_code FROM customer`; expand a
   manager (MCC) with `SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.status FROM customer_client WHERE customer_client.level <= 1`.
   A `USER_PERMISSION_DENIED` on an id means the connection can't read it; say so rather than retrying.
2. Create `~/.cpa-map/raw/gads_<customer id>/` and save these `google_ads.execute_query` results (they can go in one
   batched execute; `customer_id` is the child account, digits only):
   - `lifetime.json`: `SELECT campaign.id, campaign.name, campaign.advertising_channel_type, campaign.status, ad_group.id, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ad_group_ad.status, ad_group_ad.ad.final_urls, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, metrics.all_conversions FROM ad_group_ad WHERE metrics.cost_micros > 0 ORDER BY metrics.cost_micros DESC`
     (no date clause = all time; the tool returns up to 10,000 rows and sets `truncated` when more exist: then split by
     `campaign.status` or by yearly `segments.date BETWEEN` windows and save as `lifetime-<n>.json`).
   - `last30.json`: `SELECT ad_group_ad.ad.id, campaign.id, ad_group.id, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM ad_group_ad WHERE metrics.cost_micros > 0 AND segments.date DURING LAST_30_DAYS`
   - `last7.json`: the same with `LAST_7_DAYS`.
   - `conversions.json`: `SELECT ad_group_ad.ad.id, segments.conversion_action_category, segments.conversion_action_name, metrics.conversions, metrics.conversions_value, metrics.all_conversions FROM ad_group_ad WHERE metrics.all_conversions > 0`
     (categories become the map's buckets: PURCHASE → purchase, ADD_TO_CART, BEGIN_CHECKOUT → checkout, SIGNUP →
     sign-up, lead-type categories → lead).
   - `campaigns.json`: `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign_budget.amount_micros FROM campaign`
   - `account.json`: `SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM customer`
3. Build: `node "<tools>/cpamap.mjs" build gads_<customer id>` (name, currency and timezone come from `account.json`).
   Performance Max and asset-group ads have no ad-level rows and aren't on the map; say so when the account runs them.

### After any build

`build` prints the summary. If `ads` is 0, `node "<tools>/cpamap.mjs" raw <id>` shows which files it found. Sanity-check
before handing over: the live count should match what the user expects to be running, and the account CPA should be
in a range they recognise. CPA is on purchases when the account records them; otherwise on Google's primary conversions,
sign-ups or leads (the summary says which); set `primary` in settings.json to change it and say so.

Ad format and funnel stage are **guessed** (`tagFormat`, `tagStage` in `studio/model.mjs`; Google ad types map to
formats directly). Expect some wrong tags: the user fixes them in the studio and you fix them in `settings.json` under
`overrides.<ad id>` when asked ("Check the tags"). Note the account's naming convention in your answer so the next
retag is faster.

## Answering a request

A `[CPA map request]` block names the account, the lines, the counts, the studio filters and any selected ads. Always
start with `node "<tools>/cpamap.mjs" summary <id>` (add `--top 40` for the whole list) and, for the memo and readout,
`node "<tools>/cpamap.mjs" export <id>`, which writes the generated `plan.md` and `readout.md` to start from. Then:

- **Write the action list:** a one-page memo (chat, or a Markdown file under the user's output folder if long): kills
  with the number that condemns each, scale candidates with the next budget step (+20%, and where to add placements or
  variants), paused winners to turn back on with their last daily budget if `campaigns.json` has it. Group by campaign so
  the buyer can work through Ads Manager or Google Ads top to bottom. Fix rule misfires (one-offs, wrong tags) in
  `settings.json` rather than arguing with them in prose. Save it as `plan-claude.md` next to the export.
- **Write the account readout:** the audit as a document the client can read: what the account does now versus its
  history, where the spend sits, what the lines say, the spread inside each format and stage, paused winners, risks,
  the plan for the next two weeks. Add context from campaign names and, for cross-channel claims, what BlueAlpha's MMM
  or incrementality tests say. Save it as `readout-claude.md` next to the export; offer to publish the HTML report as a
  private Artifact.
- **Brief new creative:** per format, best vs worst on the map and what separates them (hook, angle, offer, length,
  stage). Then three concepts per format worth making, each with the ad it descends from.
- **Check the tags:** go through the listed ads (or every ad on the map when none are listed), decide `format`, `stage`
  and `oneOff` from the names, write `overrides` into `settings.json`, and report how many changed. Leave an ad
  `unknown` rather than guessing when the name says nothing.
- **Explain this ad:** its position versus the lines and versus its format and stage peers; pull `last_7d` / `last_30d`
  for that ad through BlueAlpha when the trend matters; end with one recommendation.
- **Refresh the data:** the Pull steps again, then what moved.

Never change `ads.json` by hand (the build owns it). Edit `settings.json` with the JSON intact and the keys you don't
mean to change left alone. End every request with a short chat summary.

## Numbers and their caveats

Everything on the map is platform-attributed (Meta's or Google's own attribution), not incremental: say so when a
decision rides on it, and point to BlueAlpha's MMM or incrementality tests for cross-channel questions. The account CPA
line uses the live window by default (settings `cpaBasis`), so "target" tracks what the account does now, not its
three-year average; an account running far above its history produces a long revive list, which is information, not an
error. Meta insights stop at about 37 months back. Google's `conversions` are the actions marked primary in the account.
