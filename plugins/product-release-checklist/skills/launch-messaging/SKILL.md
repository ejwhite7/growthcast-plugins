---
name: launch-messaging
description: Write a launch's message house (feature name, one-liner, job-to-be-done, pillars with proof, objections, limits, CTAs per audience) in the release checklist studio. It's the single source every launch asset is written from. Use for "Write message house" requests, or when someone asks for positioning or "how do we talk about this feature".
argument-hint: "[launch id or name]"
---

# Launch Messaging

Fills `message` in the launch JSON. Every asset is generated from it, so make it sharp before anything else.

## Inputs
- The launch `brief`, and the company context file (ICP, voice, words to avoid)
- The project's `.claude/product-marketing-context.md`, if it exists
- The PRD or spec, beta feedback, support tickets, feature requests (from links in `brief.links`, or ask)
- How competitors name and pitch the same capability (use web search if it's available)

## Method
1. **Job first.** Write the job in the customer's words, not the product's. "Get paid faster without chasing clients", not "invoicing automation".
2. **The real competitor** is what users do today (`brief.alternative`). Write `before` and `after` against it.
3. **One-liner.** Draft 5 candidates of 12 words or fewer, outcome-first. Put the best in `oneLiner` and list the other four in chat.
4. **Pillars.** No more than 3. Each pillar needs `proof`: a number, a quote or a 5-second demo moment. If you don't have proof, leave `proof` empty. The studio flags it; don't invent it.
5. **Objections.** The top 5, including the company-specific ones (price, AI trust, "will it break what I have?", switching cost).
6. **Feature name.** It should be plain-language, searchable and translatable. If the current name fails, put alternatives in chat.
7. **CTAs.** Write separate CTAs for prospects, eligible customers, ineligible-plan users and churned users.
8. **Limits.** What it doesn't do yet, said honestly. Support needs this more than marketing does.

Leave `status: "draft"`. The user approves in the Messaging tab, and approving completes the `message-house` item.
If the message house was already approved and you change it, say in chat which assets need redrafting.
