---
name: launch-video
description: Script, produce, review, finish, hand off and measure the launch announcement video in the release checklist studio's Video tab. Use for "Write video script", "Plan or make the video" and "Turn notes into revisions" requests, or when someone asks for a launch video, demo video script, storyboard, cutdowns, video review notes, or a video hand-off.
argument-hint: "[launch] [script | produce | review | handoff | performance]"
---

# Launch video

The video is the asset every channel shares on launch day: founder post, company post, employee advocacy, paid boost,
landing page, KB. It works on `video` in the launch JSON, plus the script in `assets.announcement-video.body`. The steps
are checklist items, dated back from T-0:

| Item | Due | Done means |
|---|---|---|
| `video-brief` | T-21 | Format, length, hook, channels and approvers set on the Video tab |
| `video-script` | T-14 | Script and storyboard approved |
| `ui-freeze` | T-12 | Final UI in a capture environment with realistic demo data |
| `video-production` | T-9 | Footage, screen capture, VO and music in hand |
| `video-review` | T-6 | PMM, Founder and Legal approved (2 rounds max) |
| `video-final` | T-5 | Master approved and archived (**go/no-go gate** for T1/T2, with the hero cut ready) |
| `video-cutdowns` | T-4 | Every deliverable for the tier exported and captioned |
| `video-handoff` | T-3 | The packet went to every team on the Video tab |
| `video-performance` | T+7 | Read and acted on |

Read the message house first. The video says one thing, the one-liner, and every claim must have proof there.

## Brief → `video.format`, `length`, `hook`, `talent`, `music`, `tools`
- **Pick the format by tier and audience:**
  - T2 defaults to a screen demo (30–60s) with captions.
  - T1 adds the founder on camera, or an AI/hybrid cut.
  - For an SMB audience that watches muted on mobile, design for no sound: burned-in captions, and text on screen for every claim.
- **Write the hook** as the outcome a viewer gets, shown in the first 2 seconds, never a logo intro. For example: an invoice landing in a client's inbox from "billing@yourbusiness.com".

## Script → `assets.announcement-video.body`
Write a two-column table, **On screen | Said / text**, with a timecode column. Structure for 60–75s:

1. **0–2s:** hook. The result, on screen.
2. **2–8s:** the problem in the customer's words (`brief.job`, `message.before`).
3. **8–12s:** the reveal. Feature name and one-liner.
4. **12–50s:** 2–3 demo beats. Each shows a real UI action and its outcome, no more than one idea per beat, with the proof from the message house.
5. **50–60s:** who it's for, and plan eligibility in plain words.
6. **60–70s:** CTA. Where to find it (deep link or menu path) and what to do first.

Then add:
- **Shot list:** for each scene, the source (screen capture / founder / AI / b-roll), the demo data needed, and the on-screen text.
- **Cutdown notes:** which beats make the 9:16 30–45s cut, the 15s and 6s paid cuts (each opening with a different hook), and the silent 10–20s in-app loop.

Budget about 150 spoken words per minute. Set the asset status to `draft` and `updatedBy` to `claude`. Never approve.

## Produce → `video.concept`, item `video-production` note
Write the production plan:
- the schedule back from `video-production`'s due date
- a capture checklist: demo account seeded with realistic data, notifications off, 2x resolution, cursor smoothing, final UI only (check `ui-freeze`)
- the founder setup: light, mic, teleprompter, 3 takes per line
- the VO, and music licensed for paid use

Production paths:
- **Screen demo:** a screen recorder with auto-zoom (Screen Studio, Loom, Descript).
- **AI / hybrid:** if the video-gen plugin's `ai-movie-making` skill is installed, follow it. Shots come from Seedance/Veo, voice and music from ElevenLabs, and the real product UI is captured, never generated. Always show real UI for the feature itself. Confirm costs with the user before any paid generation, then record the output path as a new entry in `video.rounds` for review.
- **Creator / UGC:** use the `ugc-video-script-writing` skill and the creator brief asset.

## Review → `video.rounds`, `video.approvers`
- **Notes are timestamped:** `0:14 — UI shows staging data; recapture on prod`. One line per issue, grouped as must-fix / should-fix / nit.
- **Turning notes into revisions:**
  - Merge duplicate notes.
  - Flag notes that contradict each other, or the message house.
  - Mark which approver owns each call.
  - Write a numbered revision list into that round's `notes`.
- If a local file is linked and a video-watching tool is available, watch the cut and add your own timestamped notes, labelled as yours.
- **Approvers:**
  - PMM checks the message and claims.
  - The founder checks voice and narrative.
  - Legal checks claims and music/talent rights.
  - Only the user sets `approvers.*.status`. A third round means scope is drifting: say so.

## Master and cutdowns → `video.master`, `video.archive`, `video.deliverables`
Export each deliverable for the tier (spec on the Video tab). Hero and vertical are always required for T1/T2; T1 adds square and paid cuts.
- **Captions:** an SRT for every cut, plus burned-in captions on social cuts.
- **Thumbnails:** 2 options per cut.
- **Paid cuts:** 3 hook variants. Need `video.rights.paid` set before they're handed to PAID.
- **Archive:** the master, project files, raw footage and licenses.

## Hand-off → `video.handoff`
Each team's packet holds the files, the captions, and the copy it needs:
- **Social:** a native upload per platform (don't share YouTube links), plus the T-0 posting order: founder → company → employees within 60 minutes.
- **Paid:** the specs, hook variants, rights, and UTMs with `utm_content=<cut>`.
- **Web:** the embed and poster frame.
- **Support:** the KB embed.
- **CS:** a link and a one-liner.
- **Archive:** the archive link.

## Performance (T+7) → item `video-performance` note, `measure.channels`
For each cut and channel, report:
- 3-second hold rate (did the hook work)
- average % watched
- click-through to the feature
- activations by `utm_content` / `entry_point`

Recommend which paid cuts to scale, which to kill, and what hook to test next.
