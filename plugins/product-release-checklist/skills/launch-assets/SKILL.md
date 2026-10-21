---
name: launch-assets
description: Draft launch assets in the release checklist studio from the message house. Covers the founder announcement, video script, social posts, employee kit, creator briefs, in-app copy, banner, landing page, changelog, KB article, YouTube tutorial, webinar, paid ads, lifecycle emails, app store copy, and the support, CS and internal packs. Use for "Draft assets" requests, or when someone asks for launch copy.
argument-hint: "[launch] [asset ids | all]"
---

# Launch Assets

Writes Markdown drafts into `assets.<id>.body`, and sets `status: "draft"` and `updatedBy: "claude"`. Draft only the assets
the request lists, or every asset for the tier that has no body yet. `ASSETS` in `studio/model.mjs` gives each asset's
spec, its tier and the checklist item it completes. Read that spec, then apply the craft notes below.

The `message` is the source. If `message.status` isn't `approved`, draft anyway, but open each body with
`> Based on an unapproved message house.` Never introduce a claim that isn't in the pillars' proof.

If they're installed, use these skills for voice and craft:
- `human-first-writing` for all copy
- `engaging-writing` for the founder post
- `website-and-ad-copywriter` for ads and the landing page
- `ugc-video-script-writing` for creator briefs
- `customerio-in-app-components` when the client's in-app tool is Customer.io

## Craft notes by asset
- **founder-announcement**: the beehiiv product-update format.
  - An outcome-led headline, then a short personal opening: why we built it, what we heard from customers.
  - For each feature: a benefit subhead, 2–4 sentences, a `[VISUAL: …]` placeholder, who it's for, and a deep-link CTA.
  - Close with what's next and a sign-off.
  - Match the founder voice samples in the context file. Put the outcome before the mechanism. No internal names.
- **social-founder / social-company**: one native post per platform the ICP actually uses. The context file says which. If the ICP isn't on X or LinkedIn, say so and weight toward TikTok, IG, YouTube and Facebook.
- **in-app**: include targeting (eligible plans only) and a frequency cap, plus an ineligible-plan upsell variant when the feature is gated.
- **kb-article**: one task per article, eligibility first, written so the AI support bot (often Intercom Fin) can answer from it.
- **paid-ads**: separate hooks per audience. Exclude users who've already activated from the adoption ads.
- **lifecycle**: every non-adopter email exits on the activation event. Exclude the holdout from every send.
- **support-pack / cs-pack**: state the limitations plainly, and include the exact ticket tag.

Add UTMs to every CTA URL using `measure.utm`, with `utm_content` set to the asset id.

## Consistency check (always run it after drafting)
Re-read every draft against `message`. Fix any draft that adds a claim missing from proof, uses an avoid-word, gets
eligibility wrong, or has a CTA without UTMs. Report any you couldn't fix in chat.
