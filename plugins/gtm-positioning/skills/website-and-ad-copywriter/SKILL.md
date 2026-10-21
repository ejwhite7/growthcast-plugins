---
name: website-and-ad-copywriter
description: Writes high-converting website copy and ad creative grounded in customer jobs, switching forces, evidence, and verbatim customer language. Use for homepages, landing pages, feature and pricing pages, ads, subject lines, navigation, and microcopy.
---

# Website and Ad Copywriter

Write conversion-focused website copy and ad creative grounded in real customer jobs, switching forces, proof, and customer language. Every substantive claim and message angle must trace to a specific job, force, objection, or verified differentiator.

## Step 1: Load Product Marketing Context

Before writing, check whether `.claude/product-marketing-context.md` exists in the project.

### If It Exists

1. Read it fully.
2. Internalize the core jobs, functional/emotional/social dimensions, switching dynamics, customer language, differentiation, objections, brand voice, proof, anti-persona, and goals.
3. Note evidence gaps, stale information, unsupported claims, and exact customer quotations.
4. Confirm: "I've loaded your product marketing context. Want me to proceed with this, or are there updates to flag first?"

If the user already explicitly asked you to proceed without another checkpoint, continue and mention any material concerns briefly.

### If It Does Not Exist

Tell the user:

> To write copy grounded in your actual customers, I need your product marketing context first. Run the `product-marketing-context` skill to create it, then come back here. Or share a brief product description and I'll write directional copy we can sharpen once the context is built.

If the user supplies enough context or asks you to continue, proceed. Label assumptions and directional claims clearly. Never invent customer quotations, metrics, testimonials, logos, research, or product capabilities.

## Step 2: Clarify the Assignment

Infer details already present. Ask only for missing information that materially affects the copy:

- Copy type: homepage hero, landing page, ad set and platform, email subject lines, navigation, microcopy, feature page, pricing page, or a section rewrite
- Audience or persona
- Primary JTBD statement and relevant job dimension
- Conversion action
- Offer, funnel stage, and traffic source where relevant
- Constraints: current platform character limits, layout, legal requirements, brand rules, prohibited claims, and tone

Do not repeat questions the user or context file already answered.

For regulated products or consequential claims, ask about required disclosures and approved substantiation. Flag the need for legal or compliance review rather than presenting copy as approved.

## Step 3: Map the Strategy to JTBD

Before drafting, show a brief strategy map:

- **Situation:** The context in which the reader encounters the message
- **Job:** The progress the reader wants
- **Job dimension:** Functional, emotional, or social
- **Push:** The frustration with the current approach to name
- **Pull:** The outcome or gain to lead with
- **Anxiety:** The objection or switching risk to preempt
- **Habit:** The inertia or existing workflow the message must overcome
- **Promised outcome:** What credible success looks like
- **Proof:** Evidence that supports the promise
- **Conversion action:** What the reader should do next

Keep this concise. If a field lacks evidence, mark it rather than guessing.

## Step 4: Write the Copy

Use a sandbox agent when available. Give it:

- The full product marketing context
- The JTBD strategy map
- The assignment and constraints
- The writing and evidence standards in this skill
- The global `pyramid-principle-writing` and `human-first-writing` skill guidance when available

Review its output before presenting it. If no sandbox agent is available, write directly. Never claim an agent ran when it did not.

### Homepage Hero

```text
Headline: [Prefer 8 to 12 words, job-focused and outcome-first]
Subhead: [One or two sentences that expand the promise, name the pain, or establish credibility]
Primary CTA: [Specific, verb-led action]
Secondary CTA: [Optional, lower-commitment action]
Supporting proof: [Optional, verified metric, customer count, testimonial, or trust line]
```

Treat word counts as layout guidance, not a reason to create awkward language.

### Ad Set

Produce at least three materially different variations unless the user requests another count. Vary the strategic angle, not just synonyms.

```text
Variation 1
Headline 1:
Headline 2:
Headline 3:
Description or body:
CTA:
Angle:
Job and force targeted:
Proof or substantiation:
Character counts:
```

Verify current official platform limits before claiming compliance. Platform limits change and differ by placement, format, and objective. If web access is unavailable, use limits supplied by the user or label counts as requiring platform verification.

Never imply that every headline and description combination forms a coherent responsive search ad unless you test the combinations. Avoid prohibited targeting language, discriminatory claims, personal-attribute assertions, deceptive urgency, and unsupported performance claims.

### Full Landing Page

Use this default architecture, then adapt it to the audience and awareness stage:

1. Hero: outcome, context, CTA, and proof
2. Pain: describe the current struggle in customer language
3. Solution: explain how the product helps customers make progress
4. Proof: verified metrics, demonstrations, testimonials, or logos
5. Capabilities: three to five capabilities framed as job outcomes
6. Objections: answer the strongest anxieties and switching costs
7. Closing CTA: repeat the primary action with relevant reassurance

Do not force this predictable order when another sequence better serves the argument. The Pyramid Principle governs the logic.

### Feature Page

```text
Section headline: [Outcome, not merely a feature name]
Body: [Situation, job, mechanism, and outcome in two or three concise sentences]
Proof: [Verified quotation, metric, demonstration, or evidence]
CTA: [Specific to the use case]
```

Explain the mechanism. Do not promise an outcome the feature cannot credibly cause.

### Pricing Page

Cover plan selection, who each plan suits, value and limits, billing cadence, trial or guarantee terms, key anxieties, FAQs, and a clear CTA. Use exact current prices and entitlements from approved sources. Never invent discounts, scarcity, or guarantees.

### Navigation and Microcopy

Prioritize clarity, predictability, accessibility, and task completion over cleverness. Include relevant empty, loading, success, validation, permission, destructive-action, and recovery states. Make button labels describe the action and consequence.

### Subject Lines

Provide distinct angles tied to jobs or forces. Include preview text when useful. Avoid deceptive `Re:` or `Fwd:`, false personalization, manufactured urgency, and claims unsupported by the email body.

## Writing Standards

### Voice

- Use active voice.
- Address readers as "you" and "your" when appropriate.
- Match the documented brand voice.
- Apply the global `human-first-writing` skill when available.
- Do not use em dashes.
- Do not use double hyphens.
- Prefer plain, specific language over jargon.

### Structure

- Apply the Pyramid Principle. Lead with the outcome or recommendation, then support it.
- Make headlines outcome-first when that is the strongest truthful angle.
- Use subheads to clarify the promise, pain, mechanism, or credibility.
- Use specific, verb-led CTAs. Prefer "Start your free trial" over "Get started" when a free trial actually exists.
- Name the reader's pain before or alongside the solution when awareness and page flow support it.

### JTBD Grounding

- Map each headline to a core job or functional, emotional, or social dimension.
- Use verbatim customer language where it remains truthful, representative, and suitable for public use.
- Preempt the strongest switching anxiety.
- Address habit and migration friction when they materially block adoption.
- Connect capabilities to outcomes rather than listing feature names.

### Evidence and Ethics

- Never invent quotations, statistics, customer counts, rankings, testimonials, logos, awards, scarcity, urgency, or guarantees.
- Attribute customer language internally so reviewers can trace it.
- Confirm permission before publishing identifiable testimonials.
- Distinguish product facts from hypotheses.
- Qualify claims to match the evidence.
- Avoid manipulative dark patterns.
- Flag legal review needs for health, finance, employment, comparative, environmental, privacy, and other regulated claims.

### Avoid

- Generic category copy that could describe any competitor
- Jargon customers do not use
- Feature lists without outcome context
- Passive, abstract phrasing
- Vague CTAs such as "Click here" and "Submit"
- Claims without proof
- Copying competitor language
- Using a quotation out of context

## Step 5: Present and Iterate

Present:

1. A one-sentence rationale naming the job and switching force behind the angle
2. The concise JTBD strategy map
3. The copy, organized by section or variation
4. Character counts and platform notes where relevant
5. Assumptions, missing proof, and claims that require verification

Then ask:

> Which direction lands best? Want me to adjust the angle, tighten a section, or write variations for another job or persona?

For ads, offer push-led, pull-led, anxiety-reducing, and social-job variants when useful. Iterate by changing the strategy first, then the words.

## Confidence and Evidence Gaps

End the saved document with a fenced code block tagged `json evidence-gaps`. The GTM Positioning studio reads it to flag weak claims and ask the user for the sources that would close them. It holds one JSON object:

```json evidence-gaps
{
  "confidence": "medium",
  "gaps": [
    {
      "id": "g1",
      "section": "Heading the claim sits under",
      "claim": "The claim or finding that is weakly supported",
      "confidence": "low",
      "why": "What is missing or thin: no first-party customer language, a single source, or only vendor claims",
      "need": "The specific source that would raise confidence, written as a request to the user",
      "sources": ["Interview or transcript", "Customer review", "Answer"],
      "searches": ["a web search that could find it"],
      "question": "One question the user could answer directly from what they know"
    }
  ]
}
```

- `confidence` is your overall confidence in the document: `high`, `medium`, or `low`.
- List at most six gaps, most decision-critical first, and only claims rated `medium` or `low`. Use an empty `gaps` list when the evidence is strong.
- `sources` uses only these values, best fit first: `Document`, `Answer`, `Customer review`, `Community thread`, `Competitor page`, `Interview or transcript`, `Article or report`, `Our own page`.
- `searches` has zero to three queries. `question` may be an empty string.
- When updating a document, keep the ids of gaps that are still open, drop gaps the new evidence closes, and never raise confidence without evidence.
- Do not mention the block in the document's prose. It must parse as valid JSON.

## Quality Gate

Before delivery, confirm:

- The document ends with a valid `json evidence-gaps` block whose confidence levels match the evidence.
- Every major copy element traces to a job, force, objection, proof point, or differentiation claim.
- Customer language remains accurate and contextual.
- The copy could not apply unchanged to most products in the category.
- Headlines lead with credible outcomes rather than internal feature labels.
- The strongest anxiety receives a direct answer.
- Claims have evidence or clear verification flags.
- CTAs name a real available action.
- Tone matches the brand and audience.
- The structure leads with the point.
- No em dashes or double hyphens appear.
- Character counts are accurate, and platform limits are verified or flagged.
- No fabricated proof or deceptive tactic appears.
