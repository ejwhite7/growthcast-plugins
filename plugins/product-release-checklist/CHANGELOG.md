# Changelog

## 0.8.2
- In the client portal, the Staffing tab says the team is saved for the project: new launches in it start with that team, and its launches with no team yet pick it up.

## 0.8.1
- Directory listing links: support, privacy policy and terms of service on growthcast.app.

## 0.8.0
- **Dependencies.** Every checklist item now lists what it waits on, from tiering through the T+90 readout. Change them per launch under **Edit** on any item, custom items included. When an item the launch doesn't have sits in the middle of a chain (another tier, or removed), the dependency passes through to what that item waits on. The checklist shows "waits on N" on open items, flags dependency loops, and warns when an item is due before something it waits on.
- **Linear "blocked by".** A Linear sync now adds a "blocks" relation for each dependency where both tasks have an issue. Re-syncs reuse existing relations and remove the ones the sync made for dependencies that were later dropped.
- **Task context on Linear issues.** Each issue carries a launch overview (set on the Staffing tab; it defaults to the message-house one-liner), plus the message-house and brief blocks that fit the task's role: pillars and proof, audience, words to use and avoid, CTAs, objections, limits, eligibility, quotes, success metric and video brief. Per task, **Edit** adds a note and changes which blocks go in, and previews the issue. Issues also list what they wait on and what they block, and say when the message house is still a draft.
- The tasks CSV gains "Task id" and "Waits on" columns.
- New checklist items for T1 and T2: the launch video thumbnail (T-4, design) and posting the launch video to YouTube (T-0). Thumbnails move out of the cutdowns item, and both show on the Video tab's steps.

## 0.7.1
- New checklist items: an optional pre-launch teaser motion graphic (T-4), a teaser post scheduled for T-2, and handing product marketing, launch video and vertical-specific assets off to paid.
- Paid runs for T1 and T2 launches: audiences, creative, budget, search, the paid video cuts and the paid hand-off.
- Paid audiences are prospects, warm engagers, users and churned, excluding users who have adopted the feature.
- The T-0 paid item is now a launch campaign with one ad set per audience and a custom-conversion objective on the first step of feature usage. It replaces "Paid flights live" and keeps the announcement video boost to warm engagers.

## 0.7.0
- Checklist items are fully editable: **Edit** on any item changes its text, phase and role, or deletes it. Default items you delete can be restored from the bottom of the checklist; go/no-go gates can be waived but not deleted. **+ Add item** sits at the top of the checklist.

## 0.6.1
- The studio checks for changes as soon as its tab is back in view, so a sync or Claude's work that finished in the background shows up right away.

## 0.6.0
- In the client portal, the Staffing tab connects the project's Linear workspace through a Composio Connect link (the person picks the workspace on Composio's page) and syncs launches to it: a project, phase milestones and one issue per open task, assigned by email, with closed issues ticking off the checklist.
- Linear issue descriptions no longer ask for an evidence link.

## 0.5.4
- Delete a launch from the bottom of its Brief tab. In the client portal only owners and admins see it.

## 0.5.3
- In the client portal, a new launch records its project's name.

## 0.5.2
- Evidence on checklist items is optional. An item marked done counts as done, with or without a link.

## 0.5.1
- Inside the client portal, the studio drops its own product name from the top bar.

## 0.5.0
- The studio also runs hosted in the GrowthCast client portal ("web mode"): launches filed under portal projects, per-project company context, read-only access for clients, and Ask Claude run on the server. API paths are now relative. Local use is unchanged.

## 0.4.0
- Launch video workstream: Video tab, nine dated items (brief → performance), approved hero cut as a go/no-go gate, `launch-video` skill.

## 0.3.0
- Staffing tab (people, role → person matrix, workload), team launch plan page, tasks CSV, Linear sync via Composio (`launch-linear-sync`).

## 0.2.0
- Interactive local studio: brief and tier, dated checklist, message house, assets, measurement, readiness, retro, portfolio.

## 0.1.0
- Markdown skills, templates and the `launch-red-team` agent.
