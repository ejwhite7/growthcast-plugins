---
name: launch-measure
description: Plan and read feature adoption measurement for a launch in the release checklist studio. Covers the activation definition, events, baselines, targets, guardrails, holdout, and the T+7/T+30/T+90 readouts. Use for "Plan measurement" or "Write readout" requests, or for "set launch goals", "tracking plan", "how is the launch doing", or "feature adoption".
argument-hint: "[launch] [plan | baseline | T+7 | T+30 | T+90]"
---

# Launch Measure

Works on `measure` in the launch JSON. The Measure tab shows the funnel (eligible → exposed → discovered → first use →
activated → retained) with targets and actuals.

## Plan (before T-14)
1. **`activation`.** Define it as the smallest repeatable action that delivers the value, within `window`. Reject "opened the feature". Offer 2–3 options in chat and pick the best.
2. **`primary`.** Phrase it as activated users ÷ eligible users by T+30.
3. **`events`.** Rename the placeholder `<slug>_core_action`. Keep `entry_point` on the feature-open event, because it's how adoption gets attributed to channels.
4. **Targets (`stages.*.t7`, `t30`).**
   - Base them on `launches/benchmarks.md` (in the export folder) from past launches.
   - With no history, start from 20–40% of eligible users discovering the feature by T+30 for a well-promoted T1, and 30–50% of those activating.
   - Write the basis in item `metric`'s `note`, labelled as a benchmark until there's real history.
5. **`guardrails` and `holdout`.** Size the holdout and note in chat that an analyst should check it's big enough for the effect you expect.

## Baseline
If an analytics MCP is connected (PostHog, Amplitude, Mixpanel, BigQuery, Supabase…), query the trailing 4 weeks of
the behaviour this feature replaces, and the eligible-user count, into `stages.*.baseline` and `eligibleCount`. If none
is connected, write the exact queries or insight definitions into item `baseline`'s `note`.

## Readouts (T+7, T+30, T+90)
Pull the actuals into `stages.*.a7` / `a30` / `a90` and `channels`. Never invent a number: leave the cell blank and put
the missing query in the notes. Then write `readouts.<n>`:
- **T+7:** exposure and discovery against target. Name the biggest drop-off stage and the fix for it.
- **T+30:**
  - activation against target
  - holdout lift (treated activation rate minus holdout activation rate, with a confidence interval)
  - cost per activation by channel
  - guardrails and support themes
- **T+90:** retention and revenue of adopters vs matched non-adopters. Say plainly that it's correlational unless it comes from the holdout.

Set `verdict`, `recommendation` and `at`, and keep `notes` to the decisions and the reasons for them.
