---
name: launch-readiness
description: Run a go/no-go red-team review of a launch in the release checklist studio and write the findings it shows on the Readiness tab. Also gives a status summary across all launches. Use for "Red-team review" requests, at T-3, or for "are we ready to launch", "launch status", or "what's blocking the launch".
argument-hint: "[launch | all]"
---

# Launch Readiness

The studio already computes the verdict from three things: hard gates, open Phase 0–3 items, and unresolved red-team
blockers (`readiness()` in `studio/model.mjs`). Your job is the part the model can't compute: judgment.

## Status across launches (`all`)
Run `studio.mjs list`, then validate each active launch. Reply with one table:
`Launch | Tier | T-0 | Days out | % done | Overdue | Verdict | Top risk`. Then flag any date collisions.

## Red-team one launch
1. If the `launch-red-team` agent is available, delegate to it with the launch file path and the context file path. Otherwise do the review yourself, using that agent's failure-mode list (plugin `agents/launch-red-team.md`).
2. Check the launch content as well as the checkbox state:
   - assets that contradict the message house
   - lifecycle with no exit on activation
   - announcing to users who can't access the feature
   - paid audiences with no consent or suppression
   - KB and support pack missing
   - no T+14 second wave
   - banners with no expiry date
3. Replace `feedback` with `{ at, summary, items }`:
   - Severity is `blocker` only when launching as planned would cause real harm, such as users who can't access the feature, broken measurement, or a legal exposure. Unresolved blockers force NO-GO.
   - Link each finding to its checklist `item` id where one fits, so the studio can jump to it.
   - `summary` is the single biggest risk, in one sentence.
4. Don't change checklist statuses. The DRI resolves or waives items in the studio.
