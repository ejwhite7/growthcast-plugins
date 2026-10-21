---
name: product-marketing-context
description: Creates and maintains .claude/product-marketing-context.md with product positioning, messaging, personas, competition, customer language, proof, and evidence-based Jobs-to-be-Done analysis. Use to establish reusable marketing context for a project.
---

# Product Marketing Context

Help users create and maintain `.claude/product-marketing-context.md`. This document gives marketing workflows shared foundational context so users do not need to repeat positioning, audience, competition, and customer evidence.

Use Jobs-to-be-Done as the analytical backbone. Ask what progress customers hire the product to make, not merely who they are.

## JTBD Foundation

Use this job statement format:

```text
When [specific situation or context]
I want to [motivation or job]
So I can [expected progress or outcome]
```

For each core job, assess:

- **Functional:** The practical progress
- **Emotional:** How customers want to feel
- **Social:** How customers want relevant people to perceive them

Map the four switching forces:

- **Push:** Frustrations or changed circumstances driving customers away from the current approach
- **Pull:** Expected benefits and emotional gains attracting them to the product
- **Habit:** Familiarity, workflow, sunk cost, and inertia supporting the old approach
- **Anxiety:** Risk, uncertainty, learning cost, and fear associated with switching

Use the qualitative model:

```text
Customers switch when Push + Pull outweigh Habit + Anxiety.
```

Do not turn this into a numerical score without suitable data.

## Step 1: Check Existing Context

Before doing anything else, check whether `.claude/product-marketing-context.md` exists in the current project.

### If It Exists

1. Read it fully.
2. Summarize each populated section.
3. Identify contradictions, unsupported claims, stale dates, missing evidence, and incomplete sections.
4. Ask: "Which sections do you want to update, or does anything look off?"
5. Gather information only for sections the user wants to revisit, unless a change creates a clear contradiction elsewhere.
6. Preserve verified information and user-authored language.

### If It Does Not Exist

Offer two options:

1. **Auto-draft from the codebase, recommended:** Inspect the repository and create a first draft for review.
2. **Start from scratch:** Build the document conversationally, one section at a time.

Explain that auto-drafting is faster but can only form hypotheses where customer evidence is absent. Ask the user to choose. Do not write the final file until the review and confirmation step.

## Step 2: Gather Information

### Option 1: Auto-Draft

Use a sandbox agent when available. Give it this methodology, repository path, relevant files, evidence standards, and required output structure. If no sandbox agent exists, inspect the repository directly.

Review relevant material, including:

- README and product documentation
- Landing, pricing, about, onboarding, and feature pages
- Metadata and structured data
- Package metadata
- Existing briefs, research, sales notes, support notes, reviews, and interview transcripts
- Existing brand and marketing documents

Do not read secrets, private customer data unrelated to the task, build outputs, dependency directories, or generated files without reason.

Draft every applicable section. Flag missing or ambiguous information instead of speculating. For JTBD sections, distinguish direct evidence from hypotheses and include source locations or URLs.

Present the draft and ask: "What needs correcting? What's missing?" Iterate until the user is satisfied.

### Option 2: Start From Scratch

Walk through one section at a time. For each section:

1. Explain briefly what it captures and why it matters.
2. Ask one or two focused questions.
3. Ask for an example when the answer remains abstract.
4. Capture exact customer words whenever possible.
5. Summarize and confirm before moving on.

Useful prompts include:

- **Product overview:** "How do you describe this in one sentence to someone who has never heard of it?" and "What category would customers search for?"
- **Audience:** "Who buys it, and who uses it? Are they different people?"
- **JTBD:** "What were customers trying to accomplish right before they found you?" "What does success look like the day after adoption?" "What did they use before, and what frustrated them?"
- **Pain:** "What is the main frustration that brings customers to you?" "What does failing to solve it cost in time, money, opportunity, or emotion?"
- **Competition:** "What did they try before?" "What manual process, spreadsheet, colleague, service, or decision to do nothing competes with you?"
- **Forces:** "What pushed them away?" "What pulled them toward you?" "What habits made leaving hard?" "What worried them about switching?"
- **Language:** "Can you share exact phrases from calls, tickets, interviews, or reviews?"

## Step 3: Integrate the JTBD Analysis

When evidence is sufficient, use a sandbox agent for an independent JTBD pass if available, then review its work. Otherwise analyze directly. Never claim an agent ran when it did not.

### Core Jobs

Identify multiple jobs only when distinct usage circumstances support them. For each job include the formal statement, trigger, functional/emotional/social dimensions, evidence, and confidence.

Avoid product-specific solution language inside job statements. Jobs should remain relatively stable even when solutions change.

### Forces Analysis

Map Push, Pull, Habit, and Anxiety with specific evidence. Identify the strongest forces and explain implications for positioning, proof, onboarding, migration, pricing, and messaging.

### True Competition

Treat anything customers hire for the same progress as competition:

| Competitor | Type | Job and circumstance served | How well it does the job | Where it falls short | Evidence |
|---|---|---|---|---|---|

Types may include direct, secondary, indirect, manual, service, internal hire, delay, and doing nothing. Include non-obvious alternatives only when evidence supports them or label them as hypotheses.

### Opportunities

Identify:

- Underserved jobs
- Overserved jobs
- Positioning opportunities around progress rather than category
- Product, service, or business-model innovation gaps

For each opportunity state the evidence, confidence, implication, and smallest useful validation step. Do not claim formal Ulwick opportunity scores without importance and satisfaction data.

## Step 4: Draft the Document

Use this structure, adapting or omitting sections only when genuinely inapplicable. Mark unknown fields `[NEEDS INPUT]`.

```markdown
# Product Marketing Context

*Last updated: YYYY-MM-DD*

## Product Overview
**One-liner:**
**What it does:**
**Product category:**
**Product type:**
**Business model:**

## Target Audience
**Target customers or companies:**
**Decision-makers:**
**Users:**
**Primary use case:**
**Core jobs:**
- When [situation], I want to [motivation], so I can [outcome].
**Other use cases:**
-

## Personas
| Persona | Cares about | Challenge | Value we promise | Evidence |
|---|---|---|---|---|
| | | | | |

## Problems and Pain Points
**Core problem:**
**Why alternatives fall short:**
-
**What it costs customers:**
**Emotional tension:**

## Competitive Landscape
| Competitor | Type | Job served | Strength | Where it falls short | Evidence |
|---|---|---|---|---|---|
| | | | | | |

## Differentiation
**Key differentiators:**
-
**How we work differently:**
**Why that is better:**
**Why customers choose us:**

## Objections
| Objection | Evidence-based response | Proof needed |
|---|---|---|
| | | |

**Anti-persona:**

## Switching Dynamics
**Push:**
**Pull:**
**Habit:**
**Anxiety:**
**Assessment:** [Which forces dominate and what that means for messaging]

## JTBD Opportunities
**Underserved jobs:**
**Overserved jobs:**
**Positioning opportunities:**
**Innovation gaps:**
**Validation priorities:**

## Customer Language
**How customers describe the problem:**
- "[verbatim]" [source]
**How customers describe the product:**
- "[verbatim]" [source]
**Words to use:**
**Words to avoid:**
**Glossary:**
| Term | Meaning |
|---|---|
| | |

## Brand Voice
**Tone:**
**Style:**
**Personality:**

## Proof Points
**Metrics:**
**Customers:**
**Testimonials:**
> "[quote]" [source and permission status]

**Value themes:**
| Theme | Proof | Source |
|---|---|---|
| | | |

## Goals
**Business goal:**
**Conversion action:**
**Current metrics:**

## Evidence Gaps
-

## Sources
-
```

For B2C products, adapt or remove the company and decision-maker fields. Do not force personas when behavioral circumstances explain the market better.

## Step 5: Confirm and Save

1. Show the completed draft to the user.
2. Ask: "Does anything need adjusting before I save this?"
3. Apply requested corrections.
4. Create `.claude/` if needed.
5. Save the final version to `.claude/product-marketing-context.md`.
6. Re-read the saved file and verify formatting, date, evidence labels, and prohibited punctuation.
7. Tell the user: "Your product marketing context is saved. Other marketing skills can reference it. Run this skill anytime to update it."

Never overwrite an existing document before the user has reviewed the proposed changes. Show a concise summary or diff for updates.

## Confidence and Evidence Gaps

End the saved document (the run's ICP guidance file, not `.claude/product-marketing-context.md`) with a fenced code block tagged `json evidence-gaps`. The GTM Positioning studio reads it to flag weak claims and ask the user for the sources that would close them. It holds one JSON object:

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

## Quality Standards

- The document ends with a valid `json evidence-gaps` block whose confidence levels match the evidence.
- Lead with conclusions, then supporting detail.
- Use active voice and direct, concise language.
- Do not use em dashes.
- Do not use double hyphens.
- Use exact customer language rather than polished paraphrases when available.
- Attribute quotes and note whether testimonial permission exists.
- Ask for concrete examples.
- Validate each section during a scratch workflow.
- Flag unknowns explicitly.
- Ground JTBD claims in interviews, reviews, behavioral data, or cited research.
- Distinguish evidence, interpretation, and hypothesis.
- Never invent customers, metrics, quotes, competitors, or proof.
- Use the Pyramid Principle: state the main conclusion first and organize supporting points beneath it.
- Apply a human-first editing pass so the document reads naturally rather than mechanically.
