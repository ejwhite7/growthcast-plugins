---
name: launch-retro
description: Run a launch retrospective in the release checklist studio and feed the lessons back into the system (benchmarks, extra checklist items). Use for "Run retro" requests, 1–2 weeks after T-0, or for "launch retro", "post-mortem", or "what did we learn from this launch".
argument-hint: "[launch]"
---

# Launch Retro

1. **Gather the evidence:**
   - from the checklist: which items slipped (`due` later than planned), were waived (read the reasons in `note`), or ended N/A
   - `feedback` and `measure.readouts`
   - the user's note (Slack threads, meeting notes)
2. **Write `retro`:**
   - `outcome`: one line with numbers against the goal
   - `worked`: the channels or assets that drove activation, with evidence from `measure.channels`
   - `didnt`: specific failures. For example: "KB went live at T+1, and 40% of first-day tickets asked how to enable it."
   - `gaps`: work the checklist was missing, or that sat in the wrong phase
   - `benchmarks`: the actual exposure %, discovery %, activation %, cost per activation and email CTR
3. **Feed the system.** If an export folder is set, append the benchmarks row to `<exportDir>/benchmarks.md`. Future targets will use it.
4. **Propose checklist changes** in chat. Add them to this launch's `custom` only if the user agrees. For changes to every future launch, suggest editing `ITEMS` in the plugin's `studio/model.mjs`.
