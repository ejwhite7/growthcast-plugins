---
name: product-release-checklist
description: Work on product launches in the GrowthCast Product Release Checklist studio. Covers the brief and tier, the dated checklist, message house, assets, measurement, readiness and retro, all stored as launch JSON the studio shows live. Use when a message carries a [Product release checklist request] block, or when the user asks to plan, run, review or measure a product launch or announcement.
---

# Product Release Checklist

The studio (`tools/studio.mjs`, http://127.0.0.1:4730) edits **launches**: JSON files in
`~/.product-release-checklist/launches/<id>.json`. You work on a launch by editing that file. The open studio polls it and
reloads within two seconds, so the user watches your changes land. Always:

- Read the company context file first when one is set (the request names it; it's also `contextFile` in
  `~/.product-release-checklist/settings.json`). It holds the ICP, plans, channels, voice and rules.
- Edit the JSON directly. Never drop fields you don't understand, and never touch fields outside the request's scope.
- After editing, run `node <tools>/studio.mjs validate <id>`. Fix every entry in `errors`. `checks` are the studio's own
  lint: clear the ones your change was meant to clear.
- Never invent customer evidence, proof points or metrics. Leave the field blank and raise it as a finding instead.
- End with a short chat summary (what changed, what the user should decide next). Long reasoning belongs in the launch
  (`feedback`, notes), not in chat.

`<tools>` is the plugin's `tools/` folder. The request block gives its absolute path. The checklist items, tier rubric,
asset specs and readiness gates are defined once in `studio/model.mjs`: read it when you need the exact list.

## Requests from the studio

| Request | Skill to follow | Writes |
|---|---|---|
| Fill brief from note | launch-kickoff (intake + pressure test) | `brief`, `tier.scores/reasons`, `measure.primary/activation`, `feedback` |
| Score tier | launch-kickoff (tier) | `tier.scores`, `tier.reasons` |
| Write message house | launch-messaging | `message` (stays `draft`) |
| Draft assets | launch-assets | `assets.<id>.body/status/updatedBy` |
| Red-team review | launch-readiness (uses the launch-red-team agent) | `feedback` |
| Plan measurement | launch-measure (plan, baseline) | `measure`, notes on items `metric`/`baseline` |
| Write readout | launch-measure (readouts) | `measure.stages.*.a7/a30/a90`, `measure.channels`, `measure.readouts` |
| Run retro | launch-retro | `retro`, optionally `custom` items |
| Write video script / Plan or make the video / Turn notes into revisions | launch-video | `video`, `assets.announcement-video` |
| Sync to Linear | launch-linear-sync (Composio) | `sync.linear` via `studio.mjs link`; item statuses pulled from Linear |
| Publish team launch plan | export, then publish `team-plan.html` as an Artifact | nothing in the launch |
| Publish share link | the share command | nothing in the launch |

## Launch schema

```jsonc
{
  "schema": 1, "id": "l_…", "name": "Invoices from your domain", "slug": "invoices-from-your-domain",
  "status": "planning",            // planning | building | go | launched | measuring | closed
  "t0": "2026-11-17",              // launch date; every checklist due date counts back from it
  "dri": "Sam (PMM)",              // one person, not the founder
  "context": "",                   // overview on every Linear issue; "" = message.oneLiner, else the brief's first line
  "rollout": { "full": true, "note": "flag name, % schedule" },   // full: true | false | null (unconfirmed)
  "brief": { "description": "", "persona": "", "job": "", "alternative": "", "evidence": "", "plans": "", "platforms": "",
             "regions": "", "pricing": "", "pricingDecided": false, "outcome": "", "risks": "", "links": "" },
  "tier": { "scores": { "reach": 0-3|null, "acquisition": …, "revenue": …, "behavior": …, "narrative": … },
            "reasons": { "reach": "one line", … }, "override": null|1|2|3, "overrideReason": "" },
  "items": { "<item id>": { "status": "todo|doing|done|waived|na", "owner": "", "due": "" /* "" = planned date */,
                            "evidence": "link", "note": "" /* waiver reason when waived */,
                            "context": "" /* what this task's owner needs to know; goes on its Linear issue */,
                            /* default items only, all optional: */ "text": "", "phase": "", "role": "", "removed": true,
                            "after": ["<item id>"] /* replaces the default dependencies */,
                            "ctx": ["pillars|audience|words|ctas|objections|limits|eligibility|quotes|metric|video"] /* replaces the role's context blocks */ } },
  "custom": [{ "id": "c_…", "phase": "build", "text": "", "role": "PMM", "due": -5 /* days from T-0 */, "after": [], "ctx": [] /* optional */ }],
  "message": { "status": "draft|approved", "approvedAt": "", "featureName": "", "oneLiner": "", "elevator": "", "promise": "",
               "pillars": [{ "claim": "", "proof": "", "approved": false }], "forWho": "", "notFor": "", "before": "", "after": "",
               "objections": [{ "q": "", "a": "" }], "useWords": "", "avoidWords": "", "limits": "",
               "ctas": { "prospect": "", "customer": "", "ineligible": "", "churned": "" }, "quotes": "" },
  "assets": { "<asset id>": { "status": "todo|draft|review|approved|live", "owner": "", "link": "", "body": "markdown", "updatedBy": "claude" } },
  "measure": { "primary": "", "activation": "", "window": "14 days", "eligibleCount": "", "holdout": "", "utm": "",
               "stages": { "eligible|exposed|discovered|first_use|activated|retained": { "baseline": "", "t7": "", "t30": "", "a7": "", "a30": "", "a90": "" } },
               "events": [{ "name": "", "trigger": "", "props": "", "staging": false, "prod": false }],
               "guardrails": [{ "metric": "", "baseline": "", "threshold": "", "actual": "" }],
               "channels": [{ "channel": "", "exposed": "", "discovered": "", "activated": "", "cost": "" }],
               "readouts": { "7|30|90": { "verdict": "on_track|behind|ahead|", "recommendation": "double_down|iterate|hold|sunset|", "notes": "", "at": "" } } },
  "feedback": { "at": "ISO", "summary": "", "items": [{ "severity": "blocker|high|medium|info", "area": "", "text": "", "fix": "", "owner": "ROLE", "item": "<item id>", "resolved": false }] },
  "video": { "format": "screen-demo|founder|ai-hybrid|animated|ugc|", "length": "", "hook": "", "concept": "", "talent": "", "music": "", "tools": "",
             "rights": { "music": false, "talent": false, "paid": false },
             "approvers": { "PMM|FOUNDER|LEGAL": { "status": "pending|changes|approved", "note": "", "at": "" } },
             "rounds": [{ "at": "yyyy-mm-dd", "link": "", "reviewer": "", "decision": "changes|approved|", "notes": "" }],
             "master": "", "archive": "",
             "deliverables": { "hero|vertical|square|loop|ads|captions": { "status": "todo|editing|review|ready|live", "link": "", "captions": false } },
             "handoff": { "social|employee|paid|web|support|cs|archive": { "sent": false, "link": "" } } },
  "people": [{ "id": "p_…", "name": "Sam Lee", "email": "sam@company.com", "title": "PMM", "capacity": "50%", "linearUserId": "" }],
  "staffing": { "PMM": "p_…", "DRI": "p_…" },     // role → person id; items inherit the owner from their role
  "sync": { "linear": { "teamId": "", "teamName": "", "projectId": "", "projectUrl": "", "syncedAt": "", "pulledAt": "",
                        "milestones": { "<phase>": "<milestone id>" },
                        "issues": { "<item id>": { "id": "", "identifier": "GRO-12", "url": "", "state": "", "syncedAt": "" } },
                        "relations": { "<blocker id>><blocked id>": "<relation id>" } } },
  "retro": { "outcome": "", "worked": "", "didnt": "", "gaps": "", "benchmarks": "" }
}
```

An item's owner is `items.<id>.owner` if it names someone on `people` (by name or email). Otherwise it's the person
`staffing` maps the item's role to. Setting the DRI role also sets `dri`. Don't write `sync.linear` by hand: use
`studio.mjs link` so ids and pulled states merge correctly.

**Dependencies.** Every default item has an `after` list in `AFTER` (studio/model.mjs): the items that must be done
first. `items.<id>.after` replaces it for one launch. Dependencies on items the launch doesn't have (another tier, or
removed) pass through to what those items wait on. Never write a loop; the studio flags one as an error, and it warns
when an open item is due before something it waits on.

**Task context.** Each Linear issue carries the launch overview (`context`), the item's own `items.<id>.context`, and the
brief and message-house blocks for its role (`CTX_ROLES`, `CTX_ITEMS` in the model; `items.<id>.ctx` overrides). Write
`context` and per-item notes in plain language a new teammate could act on; never put claims there that the message house
doesn't support.

Stage values are counts ("2100") or percentages ("12%"). Write them as strings.

Rules the studio enforces, so don't fight them:
- **Evidence is optional.** An item counts as done when its status is `done`. Add a link or a pointer ("Messaging tab,
  approved 2026-10-20") in `evidence` when there is one; don't invent one.
- **Only the user approves.** Don't set `message.status` to `approved`. Don't mark gate items done for the user unless the
  request says to.
- **Tier drives scope.** Items and assets are filtered by tier (T1 sees everything). An unscored launch shows the T1 set.

## CLI

```
node <tools>/studio.mjs list                         # every launch: id, name, t0, tier, % done
node <tools>/studio.mjs new "<name>" --t0 2026-11-17 # create a launch
node <tools>/studio.mjs validate <id>                # schema errors, lint checks, readiness verdict
node <tools>/studio.mjs export <id> [--out dir]      # report.html, team-plan.html, tasks.csv + Markdown pack
node <tools>/studio.mjs sync-plan <id>               # Linear payload: project, milestones, issues with assignee emails
node <tools>/studio.mjs link <id> <result.json>      # write Linear ids, user ids and pulled states back
```

## Company context

If the user has no context file yet, copy `reference/launch-context.md` (in this skill's directory) into their project's
`launches/` folder, offer to pre-fill it from the company website, and set `contextFile` and `exportDir` in
`~/.product-release-checklist/settings.json`.
