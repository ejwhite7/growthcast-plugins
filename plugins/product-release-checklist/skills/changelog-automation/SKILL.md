---
name: changelog-automation
description: Set up an automated, user-facing changelog on the marketing site, fed by repo releases, with a curation layer so internal or unreleased changes don't leak. Use when someone asks to automate the changelog, connect GitHub releases to the website, or write release notes for users.
argument-hint: "[repo path or owner/name]"
---

# Changelog Automation

## The pitfall to design around
Raw repo releases aren't a changelog. They contain internal refactors and they leak unreleased or flagged features. Engineers also describe *what changed in the code*, while users need to hear *what they can now do*. On top of that, a "release" (deploy) isn't the same as availability: a feature can deploy behind a flag weeks before customers get it. The pipeline needs three things: **a filter, a rewrite, and a human gate.**

## Target pipeline
```
PR merged with label  user-facing  (+ type: new | improved | fixed)
        │   PR template has a "Customer-facing note" field
        ▼
Release published (GitHub Release / tag)
        │   GitHub Action collects labeled PRs since the previous release
        ▼
Draft entry generated (Claude API rewrites notes into benefit-led copy,
grouped New / Improved / Fixed, links KB articles)
        │
        ▼
PR opened against the marketing-site repo (or a CMS draft created)
        │   PMM reviews; anything still flagged gets held back
        ▼
Merged → changelog page + RSS feed + (optional) in-app "What's new" feed
        │
        ▼
Monthly: T3 entries rolled up into a "What's new this month" post / email
```

## Steps
1. Inspect the repo: release process (tags, Releases, release-please, changesets), PR labels, and feature-flag tooling. Inspect the marketing site: framework or CMS (Next.js MDX, Webflow, Framer, Sanity, and so on) and where a changelog would live.
2. Add the PR template field and labels (`user-facing`, `changelog:new|improved|fixed`, `changelog:hold`).
3. Generate `.github/workflows/changelog-draft.yml` from `reference/changelog-workflow.yml` (in this skill's directory), adapted to the site's content format. The rewrite step uses the Claude API with the system prompt in `reference/rewrite-prompt.md`. Load the `claude-api` skill for the current model ID and SDK usage.
4. Exclude PRs labeled `changelog:hold`, and PRs whose flag isn't on for the general audience (for example, check for a flag key in the PR body).
5. Changelog page: one entry per release date, filters by type, permalink anchors, an RSS feed, and (optionally) a JSON endpoint for an in-app "What's new" widget. Each entry gets its own indexable URL for SEO.
6. Test with the last 3 releases as a dry run before turning on auto-PR.

Get the user's confirmation before creating workflows, labels, or secrets in their repos.
