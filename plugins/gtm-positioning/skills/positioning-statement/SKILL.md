---
name: positioning-statement
description: Turns a Jobs-to-be-Done analysis into evidence-based positioning using April Dunford's positioning components and Geoffrey Moore's positioning statement template. Produces ICP candidates, per-ICP positioning statements, and a recommended primary position. Use after a JTBD analysis and before product marketing context or copywriting.
---

# Positioning Statement Exercise

Build positioning from the progress customers are trying to make. Positioning defines the context in which customers understand the product: who it is for, what it competes with, why it is different, and why that difference matters.

Use a Jobs-to-be-Done report as the primary input. Every positioning claim must trace to a job, force, alternative, or verified differentiator in that report or in another cited source.

## Step 1: Load Inputs

1. Read the JTBD report fully. If the user did not name one, look for `output/*jtbd*.md` and confirm the file before continuing.
2. If `.claude/product-marketing-context.md` exists, read it for differentiators, proof, and customer language.
3. Note the feature or scope the user wants positioned. Position the feature inside the product when a feature is named.
4. List the evidence gaps that the JTBD report flagged. Carry them forward rather than resolving them with assumptions.

If no JTBD report exists, tell the user to run the `jobs-to-be-done-analysis` skill first, or offer to proceed with a clearly labeled hypothesis draft.

## Step 2: Work Through the Positioning Components

Work in this order. Each component depends on the one before it.

### 1. Competitive Alternatives

Start from the JTBD "True Competition" section. List what customers would hire if this product did not exist, including manual work, spreadsheets, services, internal hires, and doing nothing.

| Alternative | Job and circumstance it serves | Why customers hire it | Where it falls short | Evidence |
|---|---|---|---|---|

### 2. Unique Attributes

List capabilities, approaches, or business-model features the product has and the alternatives lack. Include only attributes that are true today. Mark roadmap items as roadmap and exclude them from the statement.

### 3. Value

Translate each unique attribute into the progress it enables. Map value to a core job and its functional, emotional, or social dimension. Explain which switching force it acts on: increases pull, amplifies push, reduces anxiety, or breaks habit.

| Unique attribute | Value (progress enabled) | Core job | Dimension | Force acted on | Proof | Confidence |
|---|---|---|---|---|---|---|

Drop attributes that create no value customers recognize.

### 4. Who Cares a Lot: ICP Candidates

Identify two to four Ideal Customer Profile candidates. Define each ICP by the circumstance and job first, then by firmographic or demographic traits. An ICP is the group for whom the value is greatest and the switching forces most favor switching.

For each candidate include:

- **Name:** Short, descriptive label
- **Circumstance and trigger:** The situation that starts their search
- **Primary job:** The JTBD statement they hire for
- **Why they care a lot:** Which value themes matter most and why
- **Strongest forces:** The dominant push, pull, anxiety, and habit
- **Primary alternative:** What they would use instead
- **Traits:** Role, company type, size, or other observable attributes, only where evidence supports them
- **Confidence:** High, medium, or low

### 5. Market Category

Recommend the frame of reference that makes the value obvious to the selected ICPs. Consider:

- **Head-to-head:** Win an existing category customers already understand
- **Subcategory:** Claim a niche within an existing category
- **New category:** Create a category only when no existing frame works and the business can afford the education cost

State the recommendation, the trade-off, and what customers will assume once they hear the category.

### 6. Relevant Trends (Optional)

Include a trend only when it makes the value more urgent for an ICP and a source supports it.

## Step 3: Write Positioning Statements

Write one statement per ICP candidate using Geoffrey Moore's template:

```text
For [ICP defined by circumstance]
who [job or struggling moment],
[product or feature] is a [market category]
that [key value, stated as progress].
Unlike [primary competitive alternative],
[product or feature] [key differentiator tied to a unique attribute].
```

Then write a short narrative version, two or three sentences, that a salesperson could say aloud.

Rules:

- Do not put feature names in the "who" clause. Describe the struggle.
- State value as an outcome, not as a capability.
- Name a real alternative from Step 2, including "doing it manually" when that is the true competitor.
- The differentiator must trace to a unique attribute with proof or a verification flag.

## Step 4: Recommend a Primary Position

Recommend which ICP to lead with and why. Use explicit criteria: strength of evidence, size of value gap, switching force balance, reachability, and strategic fit. State what you would need to learn to change the recommendation.

## Step 5: Save the Output

Save one Markdown file. Use the path the user or the calling workflow provides, otherwise `output/[product]-positioning.md`. Create the directory if needed.

Use this structure:

```markdown
# [Product or Feature] Positioning

*Last updated: YYYY-MM-DD*
*Source JTBD report: [path]*

## Recommendation
[Primary ICP, statement, and one-paragraph rationale]

## Competitive Alternatives
## Unique Attributes
## Value Map
## ICP Candidates
## Market Category
## Positioning Statements
### [ICP name]
## Relevant Trends
## Evidence Gaps and Validation Tests

## ICP Candidates (Machine Readable)
```

Near the end of the file, before the evidence-gaps block, add a fenced code block tagged `json icp-candidates` that lists every ICP candidate, so downstream tools can offer the ICPs as choices. Keep the summary to one sentence.

````markdown
```json icp-candidates
[
  { "name": "ICP name", "summary": "One-sentence circumstance and job.", "confidence": "high" }
]
```
````

## Confidence and Evidence Gaps

End the saved document with a fenced code block tagged `json evidence-gaps` after the `json icp-candidates` block, as the very last thing in the file. The GTM Positioning studio reads it to flag weak claims and ask the user for the sources that would close them. It holds one JSON object:

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

## Writing Standards

- Lead with the recommendation, then support it.
- Use active voice and plain language.
- Do not use em dashes.
- Do not use double hyphens in prose.
- Use customer language from the JTBD report where it stays accurate.
- Never invent customers, metrics, quotes, competitors, or proof.
- Carry confidence levels forward from the JTBD report. Do not raise confidence without new evidence.

## Quality Gate

Before saving, confirm:

- Every alternative appears in, or is reconciled with, the JTBD true competition.
- Every unique attribute is true today or flagged.
- Every value claim maps to a job and a switching force.
- ICPs are defined by circumstance before demographics.
- Each statement names a real alternative and a provable differentiator.
- The recommendation states its criteria and what would change it.
- The `json icp-candidates` block parses as valid JSON.
- The document ends with a valid `json evidence-gaps` block whose confidence levels match the evidence.
- No em dashes or double hyphens appear in prose.
