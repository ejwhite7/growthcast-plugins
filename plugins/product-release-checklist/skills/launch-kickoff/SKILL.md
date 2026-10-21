---
name: launch-kickoff
description: Start a product launch in the GrowthCast release checklist studio. Runs intake from a note, PRD or conversation, scores the tier (T1/T2/T3), and pressure-tests the plan. Use for "Fill brief from note" or "Score tier" requests, or when someone says "we're launching X", "plan a product announcement", or "kick off a launch".
argument-hint: "[feature name] [target launch date]"
---

# Launch Kickoff

Works on a launch JSON (schema in the product-release-checklist skill). If there's no launch yet, create one:
`node <tools>/studio.mjs new "<name>" --t0 <yyyy-mm-dd>` (ask for the date if it's unknown), and tell the user to open
the studio (`/product-release-checklist:open`).

## 1. Context
Read the company context file. Read `studio.mjs list` to see other launches near this T-0.

## 2. Intake → `brief`
Use the user's note, and any PRD, Linear or Notion link it contains. Fill what you can infer:
- `description`: one plain-language paragraph
- `persona`, `job` ("When I…, I want to…, so I can…"), `alternative` (what they use today)
- `plans`, `platforms`, `regions`, `pricing`, `outcome`
- `rollout.full` and `rollout.note`, only if stated

Ask the user (AskUserQuestion, at most 4 questions per round) only for what you can't infer and what matters most:
T-0 date, rollout at 100% on T-0, plan eligibility and pricing, and customer evidence. Never invent `evidence`.

## 3. Tier → `tier.scores`, `tier.reasons`
Score each factor 0–3 using the rubric in `studio/model.mjs` (`RUBRIC`). Each reason is one line that cites a fact.
11–15 is T1, 6–10 is T2, 0–5 is T3. Don't set `override`; the user does that in the studio, with a reason.

## 4. Pressure-test → `feedback`
Replace `feedback` with findings for every failure mode that applies (severity, area, text, fix, owner role, item id):
- The announcement comes before 100% rollout for the announced audience (`rollout-plan`). Blocker.
- No single DRI, or the DRI is the founder (`dri`).
- The success metric is a vanity metric rather than activation (`metric`).
- No baseline is possible because the events don't exist yet. Instrumentation is the critical path (`events`).
- A T1 with no customer evidence or proof point (`evidence`). Blocker for T1.
- Pricing or packaging undecided under 14 days out (`packaging`).
- The feature name is internal jargon (`name`).
- Another T1/T2 within ±7 days (`calendar`).
- Company-specific risks from the context file. For example: a feature gated to paid plans needs an upgrade path for Free users; supported languages need localized copy.

Set `feedback.at` to now and put the single biggest risk in `feedback.summary`.

## 5. Hand off
Validate. In chat, give: the tier with a one-line reason, the next 5 items due (from the Checklist tab), and the next
step (usually "Write message house").
