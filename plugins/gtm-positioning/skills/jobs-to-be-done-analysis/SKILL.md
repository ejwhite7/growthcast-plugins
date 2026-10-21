---
name: jobs-to-be-done-analysis
description: Applies Tony Ulwick and Bob Moesta's Jobs-to-be-Done frameworks to uncover the progress customers seek, switching forces, true competition, and actionable opportunities. Use for product, feature, service, positioning, and customer research analysis.
---

# Jobs-to-be-Done Analysis

Analyze the progress customers are trying to make. Ask what job customers hire a product to do, not merely who the customers are.

Use customer evidence wherever possible. Clearly separate observed evidence, interpretation, and hypotheses. Do not present research-based assumptions as validated customer jobs.

## Step 1: Determine Input and Context

Infer answers from the conversation and project files first. Ask focused questions only for missing information:

1. What product, feature, or service should be analyzed?
2. Are customer interview transcripts, research notes, support conversations, reviews, or survey responses available? If so, where are they?
3. Which customer segments, circumstances, or use cases matter most, or should the analysis discover them?
4. Where should the output file be saved if `output/` is not appropriate?

If interview evidence exists, extract jobs from customer language. If it does not, use project documents and web research, then label the result as a research-based hypothesis that requires customer validation.

## Step 2: Research and Discovery

Use a sandbox agent for the research when agent functionality is available. Give it the product context, source paths, target segments, output requirements, and this complete methodology. Review its findings before delivery.

If no sandbox agent is available, conduct the analysis directly. Never claim an agent ran when it did not.

### When Interview Data Is Available

Read all relevant transcripts and notes. Extract moments where customers describe:

- What they were trying to accomplish
- How they wanted to feel
- How they wanted others to perceive them
- The circumstances and trigger that started the search
- What they used before
- What pushed them away from the old approach
- What attracted them to the new approach
- Their anxieties before switching
- Habits or constraints that resisted change
- The trade-offs they accepted
- What success looked like after adoption

Quote exact customer language with a source identifier and location when possible. Preserve meaning and context. Do not fabricate or clean up quotations in ways that change them.

### When Interview Data Is Unavailable

1. Search project documents for product behavior, positioning, feedback, support themes, usage contexts, and alternatives.
2. Use web research for category behavior, customer reviews, community discussions, and competitor positioning.
3. Prefer first-party customer language and independent reviews over vendor claims.
4. Record source URLs and access dates.
5. Identify likely jobs from usage circumstances and switching behavior.
6. Label every inferred job and force with a confidence level: high, medium, or low.
7. Flag hypotheses that need interviews rather than filling evidence gaps with certainty.

## Step 3: Build the Analysis

Create one Markdown report with the following sections.

## 1. Evidence and Method

Briefly state:

- Product and scope
- Segments or circumstances analyzed
- Evidence reviewed
- Whether findings are interview-derived, research-based, or mixed
- Important evidence gaps and limitations

Include a compact source list. For interviews, use anonymized source IDs unless the user authorizes names. Do not expose sensitive personal information.

## 2. Core Job Statements

Identify multiple distinct jobs when customers hire the product in different circumstances. Use:

```text
When [specific situation or context]
I want to [motivation or job]
So I can [expected progress or outcome]
```

A strong statement describes the customer's circumstance and desired progress without embedding the current product or a predetermined solution. Avoid vague statements such as "When I need help, I want an easy tool, so I can save time."

For each job include:

- Job statement
- Hiring context and trigger
- Desired outcome
- Evidence and source
- Confidence level
- Segment notes, only when the segment changes the job or constraints

## 3. Job Dimensions

For every core job, analyze:

- **Functional:** The practical progress or task
- **Emotional:** How the customer wants to feel during and after progress
- **Social:** How the customer wants relevant people to perceive them

Do not force emotional or social claims unsupported by evidence. If evidence is missing, state what is unknown and propose an interview question.

Use a table where it improves clarity:

| Core job | Functional progress | Emotional progress | Social progress | Evidence | Confidence |
|---|---|---|---|---|---|

## 4. Forces of Progress

Map the four forces around the switching decision:

- **Push:** Pain, frustration, or a changed circumstance that makes the current approach unacceptable
- **Pull:** Expected benefits and identity or emotional gains from the new approach
- **Anxiety:** Fear, uncertainty, learning cost, financial risk, or implementation risk associated with the new approach
- **Habit:** Familiarity, sunk cost, workflow, relationships, contracts, and inertia supporting the old approach

State the model clearly:

```text
Customers switch when Push + Pull outweigh Anxiety + Habit.
```

Treat this as a qualitative model unless numerical evidence exists. Assess which forces appear strongest, cite evidence, and explain implications for messaging, onboarding, proof, migration, pricing, and product design.

Include the hiring timeline when evidence permits:

1. First thought
2. Passive looking
3. Active looking
4. Decision event
5. Purchase or adoption
6. First use and evaluation

## 5. True Competition

Identify anything customers might hire to make the same progress, including direct products, adjacent categories, manual work, services, internal teams, delay, and doing nothing.

| Competitor or alternative | Type | Job and circumstance served | How well it does the job | Where it falls short | Evidence |
|---|---|---|---|---|---|

Include non-obvious cross-category alternatives only when evidence or a clearly labeled hypothesis supports them. Explain why each competes for the same job.

## 6. Opportunities and Implications

Identify:

- **Underserved jobs:** Important outcomes customers struggle to achieve
- **Overserved jobs:** Solutions provide complexity or performance customers do not value enough to justify cost
- **Positioning opportunities:** Ways to frame the product around progress and circumstance rather than category
- **Innovation gaps:** Product, service, onboarding, workflow, or business-model changes that could serve the job better
- **Research gaps:** Questions that must be validated before investment

For every opportunity provide:

- Evidence or hypothesis basis
- Target job and circumstance
- Proposed action
- Expected customer outcome
- Business rationale
- Confidence
- Smallest useful validation test

Prioritize opportunities with an explicit method such as customer importance, current satisfaction, evidence strength, strategic fit, effort, and risk. Do not claim Ulwick-style quantitative opportunity scores unless proper outcome-importance and satisfaction data exists.

## Output Requirements

- Save the report under `output/` as a `.md` file unless the user provides another location.
- Create the directory if needed.
- Use a descriptive filename such as `output/[product]-jtbd-analysis.md`.
- Use clear headings, tables, and concise formatting.
- Write in active voice.
- Do not use em dashes.
- Do not use double hyphens.
- Quote interview language and identify its source.
- Cite web research with direct URLs.
- Flag insufficient evidence explicitly.
- End with recommended next research actions, not a generic summary.

Before saving, scan the entire report for prohibited punctuation and unsupported claims.

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

Confirm that:

- The document ends with a valid `json evidence-gaps` block whose confidence levels match the evidence.
- The report identifies multiple circumstance-specific jobs where evidence supports them.
- Statements describe progress rather than product features.
- Every job covers functional, emotional, and social dimensions, or explicitly flags missing evidence.
- The forces analysis uses specific evidence rather than generic platitudes.
- True competition includes credible non-obvious and cross-category alternatives.
- Opportunities are concrete, prioritized, and testable.
- Quotes are accurate and traceable.
- Research claims cite sources.
- Confidence levels match evidence quality.
- The report distinguishes findings from hypotheses.
- No em dashes or double hyphens appear.
