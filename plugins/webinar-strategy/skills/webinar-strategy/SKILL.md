---
name: webinar-strategy
description: Plan a webinar with the GrowthCast Webinar Strategy studio. Use for "plan a webinar", "write the RSVP page copy (AIDA)", "which webinar tooling tier do we need", "what should the registration webhook carry", or when someone hands you a Webinar Strategy export to review. Planning only.
argument-hint: "[webinar topic] [target date]"
---

# Webinar Strategy

Work with the studio (`/webinar-strategy:open`) and with files the user exports from it. The studio keeps data in the
user's browser, so you work from an exported session JSON (kind `session` or `backup`, version 1) or from what the user
tells you. You cannot read the browser's storage.

## Schema (version 1, in short)
A session has `event` (slug, internalName, publicTitle, format, topics, heroUrl/heroAlt, `aida` {attention, interest,
decision, action}, shortDescription, outcomes[], date, time, **IANA** timeZone, durationMin, hosts[], platform, venue,
joinUrl, waitingUrl, recurring + recurrence text, redirectUrl, thankYou, visibility draft|unlisted|public, recordingUrl),
`rsvp` (formVersion, field modes; name and email always required, phone optional, SMS consent a separate optional
checkbox with its own wording), `tier` crawl|walk|run, `capabilities`, `tasks` (stage, status, owner, due, evidence),
`reminders`, `reuse`.

## Workflow
Create page → review/publish → promote/RSVP → execute/record → upload recording → attach recording → repurpose/readout.

## How to help
- Draft AIDA copy and outcomes from a topic: attention hook, why it matters, why attend this session, what to do now.
  Say what attendees will learn, get and be able to do. Keep join and waiting-room links out of all public copy.
- Recommend a tier by capability. Riverside is the author's Crawl preference and Sequel the author's Run preference;
  say so as preferences, never as verified rankings, prices or feature claims. Keep Walk vendor-neutral. Zoom, Wispr and
  Livefront are unverified names from the author's notes.
- Review exports with the readiness checks in mind (slug, copy, schedule in an IANA zone, hosts, valid https URLs).
- Treat PostHog (analytics) and HubSpot (CRM) as examples of destinations to confirm, not equivalents.

## Approval boundaries
- This plugin plans only. Do not publish pages, send email or SMS, fire webhooks, book platforms, spend money or call
  outside services. The registration webhook spec is a proposed contract with synthetic examples for the separate
  headless CMS work; it is not implemented here.
- Exports labelled private contain join/waiting-room links and internal notes. Never paste them into public places, and
  only suggest sharing the public export for public use.
- Get the user's explicit approval before any real-world action, even if a tool would allow it.
