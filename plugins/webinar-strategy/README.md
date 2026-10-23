# Virtual Event Strategy by GrowthCast

A Claude Code plugin with a local, visual planning studio for virtual events. It is **planning only**: it does not publish pages,
collect registrations, send email or SMS, fire webhooks, book platforms or touch a CMS, CRM, email or streaming tool.
A separate effort is building the headless CMS; this plugin does not include or call it.

## What's in the studio
- **Why virtual events**: an interactive map (select, drag to pan, zoom, reset; arrow keys, `+`/`-`, `0`; a text outline for
  non-visual use) covering the engagement signal (live vs on-demand), formats, the before / during / after phases and the
  channels a session feeds.
- **Sessions** (several, in the sidebar): Overview and progress, **Event brief** (slug, internal and public titles, hero,
  AIDA copy, description and outcomes, date / time / IANA zone, hosts, platform, venue, join and waiting-room links,
  repeating schedule, redirect or thank-you, visibility, recording URL, topics), **RSVP form** (name and email always
  required; phone, a separate optional SMS opt-in, company, size, title), **Tier & tools** (Crawl / Walk / Run),
  **Workflow** (create page → review/publish → promote/RSVP → execute/record → upload → attach recording →
  repurpose/readout, with status, owner, due date and evidence), **Reminders & reuse**, **Page preview**, **Export**.
- **Library**: search by text, topic or host; All / Upcoming / Recorded. Unscheduled sessions are labelled.
- "Planned-only" language is deliberate: *visibility* is the state you intend to apply in your CMS, and review/publish
  tasks only record approval.

## Run it
Requires Node 20+. No dependencies, no install step.

```
npm start                     # http://127.0.0.1:4731
PORT=0 npm start              # free port (prints the URL); for disposable tests only, see below
node tools/studio.mjs --port 4800
```
In Claude Code: `/webinar-strategy:open`. The server binds to `127.0.0.1` by default, serves only the files in `studio/`,
accepts only GET/HEAD, and rejects unexpected `Host` or foreign `Origin` headers. It has no write or file API.
Set `STUDIO_HOST` / `STUDIO_ALLOWED_HOSTS` only if you deliberately need to bind beyond loopback (for example in a test
container). A generic `HOST` environment variable is ignored.

Browser storage is per origin, so a random port (`PORT=0`) starts with an empty studio each run. Use the default 4731
for real planning.

## Where your data lives
In **this browser's localStorage** for the origin you opened (`127.0.0.1:<port>`; a different port is a different store).
It is versioned and validated on load. Invalid or newer-version data is never overwritten or silently wiped: the studio
tells you, saves nothing, and offers to download the raw data or back it up and start fresh. Two tabs editing at once are
detected and the second save is refused; the warning offers *Export this tab's backup* next to *Reload*, because reloading
discards that tab's unsaved edits. If storage is unavailable or full the studio says so and keeps working in memory.

Limits: at most 200 sessions and 4,000,000 characters of stored JSON. Saving uses the same limits as loading, so the studio
refuses a save (and refuses to create, duplicate or import sessions) that it could not read back, and explains why. Field
lengths in the forms match what is kept on load; if older or imported data has longer values, shortened or reset values
are listed in a warning rather than changed silently.

**Clearing site data deletes your sessions. Use *Export backup* (sidebar) regularly.** Import adds sessions without
overwriting existing ones.

## Exports and sensitivity
| Export | Contains | Share it? |
| --- | --- | --- |
| Public page JSON | slug, title, hero, AIDA copy, description, outcomes, logistics, hosts, platform, venue, recording URL, RSVP field list | Safe for a public page. No join / waiting-room / redirect / internal name / tasks / notes. It refuses to export, and the Page preview refuses to render, if a private link was pasted into public text (also caught without `https://`, without its query, or with/without `www.`; a link to the same site's other pages is not blocked). |
| Share file: HTML plan, HTML slides, Markdown, Print / Save PDF | Planning snapshot: title, logistics, cadence, AIDA copy, outcomes, and every stage's tasks with responsible role, named owner, dependencies, unmet blockers, status and due date | **Internal sharing.** No join / waiting-room / redirect links, thank-you text, internal name, notes or task evidence. Role and owner assignments may be sensitive (the file says so). Refuses to build if a private link appears anywhere in it, including task titles, roles and owners. |
| Session JSON, Markdown handoff, webhook spec, backup | Everything, including join and waiting-room links, roles, owners, dependencies, evidence and notes | **Private.** Treat like credentials-adjacent data. |

### Share file
The Export tab's *Share as a file* section downloads one self-contained HTML file (document view by default, or a
slides build that opens in slide view). It has inline CSS and a fixed inline script only: no CDN, fonts, images,
network requests, external modules or localStorage, and a `Content-Security-Policy` with `connect-src 'none'`. It works
opened directly from disk (`file://`). Inside it: Document / Slides toggle (arrow keys or Previous / Next in slides),
**Print / Save PDF** (the browser print dialog; every slide prints on its own page) and **Download Markdown**. Every
user string is HTML-escaped (including `</script>`); the Markdown is read from an escaped element, never interpolated
into script. The studio's own *Print / Save PDF* button prints the same content with the studio print stylesheet.
**No URL is created**: the plugin hosts nothing and never invents a localhost or public link. Send the file as an
attachment. Claude can attach the generated file and use the host app's native sharing where that host supports it;
whether that is available depends on the host, not on this plugin.

URLs must be full `https://` links (plain `http://` only for localhost); anything else is flagged and left out of exports.
Webhook payloads in this plugin are **synthetic examples** (placeholder ids, `example.invalid` email). No attendee
data is collected or stored.

## Registration webhook spec (proposal)
`webinar-registration.v1-draft`: delivery id and attempt; registration id, **idempotency key** (the original "item
potency" is interpreted as idempotency) and form version (kept separate from the hero image URL); UTC submit time;
registrant fields; consent (email reminders, and separate optional SMS marketing consent with wording and timestamp);
occurrence id and UTC start; an event snapshot (slug, titles, description, outcomes, AIDA, logistics, hosts, platform,
venue, visibility, hero image, join / waiting / recording links, redirect and thank-you). Authentication and signing are
left to the CMS implementer. It is exported for that work; nothing here sends it.

## Tooling guidance and caveats
- Riverside is the **author's** Crawl preference and Sequel the **author's** Run preference ("SQL" in the original notes
  was confirmed to mean Sequel). They are preferences, not verified capability rankings. **No pricing is stated or
  guaranteed.** Walk is vendor-neutral. Zoom, Wispr and Livefront are names from the author's notes, marked unverified.
- The grouping of capabilities into Crawl / Walk / Run is an editorial suggestion; adjust per session.
- Repeating schedules are planning metadata chosen from Weekly, Biweekly (every two weeks), Monthly or Quarterly.
  There is no scheduler and no calendar integration. Sessions saved before this change with free-text schedules keep
  that text verbatim as a *legacy* value (shown on the Event brief with a warning and a readiness check) until you pick
  a cadence and clear it; it is never reinterpreted.
- Social live/event distribution (template v3): separate X, LinkedIn, Meta (Facebook/Instagram), and YouTube eligibility and event-listing tasks (Social media manager), connection and rehearsal checks (Producer). Confirm each account's supported capabilities; mark unused/unsupported destinations N/A. Never store stream keys in plans. These are planning tasks, not live integrations. New plans make go-live depend on destination tests; existing plans retain customized dependencies during the explicit checklist upgrade, so review the go-live dependencies after upgrading.
- All workflow tasks, preset or custom, support CRUD: Add task creates; task rows display details; Edit task changes title/stage, while role, owner, status, dates, evidence and dependencies are editable inline. Delete always asks for confirmation and removes incoming dependency links. Changes persist on reload. A later explicit template upgrade may offer to re-add deleted preset tasks.
- Checklist (template v3): every bundled channel or role is its own task (company social, founder-led, email list,
  lifecycle, optional paid, partner co-promotion and customer invites before; edit, captions, thumbnail; clips, quotes
  and stills; attendee and no-show follow-ups; social, founder, partner, optional paid, lifecycle, customer success,
  help center and in-app after). Each task has exactly one responsible role (pre-filled), an optional named owner and
  dependencies. Dependencies on itself, on a missing task, or that would form a cycle are refused in the UI; imported
  self/missing references are removed with a warning; imported cycles are kept and flagged for you to resolve.
- Sessions with the earlier checklist are **not** changed on load. The Workflow tab offers *Preview checklist
  upgrade…*: it lists what is added, removed and kept, downloads a private JSON backup of the session, then upgrades.
  Only untouched bundled tasks (to do, no owner, due date or evidence) are removed; completed states, owners, evidence,
  due dates and custom tasks are kept, and bundled tasks with progress stay for you to mark N/A.
- Times are stored as local date + time + IANA zone and converted with `Intl`. Past/future is judged on the UTC instant;
  the machine's zone is never assumed. Nonexistent daylight-saving times are rejected.
- Fonts fall back to system stacks (no font files are bundled).

## Develop and test
```
npm run check   # node --check on every source and test file
npm test        # node:test: model, exports, store, server, review-fixes, share-tasks regressions (no dependencies)
npm run smoke   # Playwright browser test; run in a container that already has Playwright
```
The cadence / checklist / dependency / share-file changes and their tests (`test/share-tasks.test.mjs` and the new
smoke steps) **have not been run yet** (see CONTINUITY.md). `test/browser-smoke.mjs` imports `playwright` only
if present and exits with a clear message otherwise; the plugin has no runtime or dev dependencies.

## Approval boundaries
Anything outward-facing (publishing, sending, scheduling, paying, connecting accounts or deploying the CMS) is outside this
plugin and requires explicit approval from the owner. The skill (`skills/webinar-strategy`) tells Claude the same.

## Layout
`.claude-plugin/plugin.json` · `commands/open.md` · `skills/webinar-strategy/SKILL.md` · `tools/studio.mjs` (static server) ·
`studio/` (`model.mjs`, `store.mjs`, `content.mjs`, `exports.mjs`, `app.js`, HTML/CSS) · `test/`
