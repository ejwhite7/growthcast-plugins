# CPA Map by GrowthCast

A Claude Code plugin that puts every Meta or Google ad on one map and works the "drop CPA 15% in a week" playbook on it.

- **X** = log of lifetime spend, **Y** = CPA (or cost per add-to-cart / sign-up / lead). Paused ads included: hollow dots.
- **Four lines:** current blended account CPA, target (15% under), kill line (1.5× target), scale line (0.7× target).
- **Filters:** live / not live, format, funnel stage, campaign, ad set (ad group), Y metric, a find box, and a switch to
  hide everything outside the filters instead of fading it.
- **Steps:** turn paused winners back on · kill and scale what's live · compare like with like by format · grade each stage on its own metric.
- Every ad gets a call (kill, scale, revive, testing, hold) with the number behind it; the inspector fixes tags or overrules the rule.
- **Actions** and **Readout** views, generated from the numbers. **Export:** HTML report, GrowthCast slide deck, slides PDF,
  report PDF, action plan and account readout as Markdown, actions CSV.
- **Ask Claude** queues a request (action memo, account readout, creative brief, tag check, explain an ad, refresh) that reaches
  Claude with your next message.

Data comes from the [BlueAlpha](https://bluealpha.ai) MCP server: Meta ad-level insights (`maximum` window, about 37 months)
and Google Ads GAQL. Claude pulls, saves the raw results, and builds the account. Nothing leaves your machine: the studio is a
local server on 127.0.0.1.

## Install

```
/plugin marketplace add ejwhite7/growthcast-plugins
/plugin install cpa-map@growthcast
```

Requires Node 20+ and a BlueAlpha MCP connection with `facebook_ads:read` and/or `google_ads:read`. PDFs need a Chrome-family
browser on the machine (or `npx -y playwright@1.56.1 install chromium-headless-shell`).

## Use

```
/cpa-map:open Durable          # pull the account named Durable through BlueAlpha, build it, open the map
/cpa-map:open gads_5612407843  # a Google Ads customer id
/cpa-map:refresh               # pull again, keep your tags and calls, report what moved
/cpa-map:export                # report.html, slides.html, slides.pdf, plan.md, readout.md, actions.csv
```

The studio runs at http://127.0.0.1:4731. Data lives in `~/.cpa-map/` (`raw/<id>/` as pulled, `accounts/<id>/ads.json`
built, `settings.json` your lines, tags, calls and notes, `exports/<id>/` packs).

## CLI

```
node tools/cpamap.mjs                        # serve (add --open to launch the browser)
node tools/cpamap.mjs accounts               # built accounts
node tools/cpamap.mjs build act_123 --name "Brand" --currency USD
node tools/cpamap.mjs build gads_1234567890  # Google Ads (name and currency from account.json)
node tools/cpamap.mjs summary act_123        # lines, counts, kill / scale / revive lists
node tools/cpamap.mjs export act_123 [--out dir] [--no-pdf]
```

`npm test` runs the model, narrative, server and hook tests.

## Hosted

The same studio runs inside the GrowthCast client portal as the **CPA Map** tab (service repository
`B2B-Saas-Inc/growthcast-cpa-map`), where accounts connect through Composio instead of BlueAlpha. `public/` there is a
copy of `studio/` pinned to a plugin version.

## Caveats

Everything is platform-attributed, not incremental. Format and stage are read from names (Google ad types map directly) and
will need the odd correction. Meta's insights API caps the window at about 37 months; Google Performance Max has no ad-level rows.

Built on the playbook in the post "If my back was against the wall and I HAD to drop CPA 15% in a week", which credits
Curtis Howland.
