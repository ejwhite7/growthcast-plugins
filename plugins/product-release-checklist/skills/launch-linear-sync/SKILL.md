---
name: launch-linear-sync
description: Sync a launch from the GrowthCast release checklist studio to Linear through Composio. Creates or updates a Linear project with a milestone per phase and one issue per open task, assigned to the person staffed on it with its due date and launch context, links each task to what it waits on with "blocked by" relations, and pulls issue state back into the checklist. Use for "Sync to Linear" requests, or when someone asks to push a launch plan to Linear, create launch tickets, or assign launch tasks to the team.
argument-hint: "[launch id or name]"
---

# Launch → Linear (via Composio)

The studio never talks to Linear itself. You do, with Composio's Linear tools, then write the result back so the studio
shows issue links and stays in step. Run every Composio call through `COMPOSIO_MULTI_EXECUTE_TOOL`, after a
`COMPOSIO_SEARCH_TOOLS` call for Linear that gives you a session id. Check each tool's `successful` flag, because a failure
can arrive with an HTTP 200.

## 1. Get the payload
`node <tools>/studio.mjs sync-plan <id>` prints:
- `team`: `{ id, name }`. The id is empty before the first sync.
- `project`: `{ existingId, name, description (≤250 chars), start_date, target_date, lead_email }`
- `milestones[]`: `{ phase, name, target_date, existingId }`
- `people[]`: `{ email, name, linearUserId }`
- `issues[]`: `{ key, existing, open, title, description, due_date, priority, milestone, role, assignee_email, assignee_name }`. The description already holds the task's context and what it waits on; send it as is.
- `relations[]`: `{ key, blocker, blocked, existing }`, one per dependency where both tasks have an issue. `existing` is the relation id from an earlier sync.
- `remove[]`: `{ key, id }`, relations an earlier sync made for dependencies that no longer exist.

## 2. Resolve the team and people
- **Team.** If `team.id` is empty, call `LINEAR_LIST_LINEAR_TEAMS` and ask the user which team owns the launch (AskUserQuestion). Read both `data.teams` and `data.items`. Use the UUID, never the key or name.
- **People.** Call `LINEAR_LIST_LINEAR_USERS` and paginate until `page_info.hasNextPage` is false. Match each payload person by **email**, case-insensitive, `active: true` only. An assignee must be a member of the team (the members come from the teams listing). List anyone unmatched or outside the team: their issues go in unassigned. Never guess by name.

## 3. Confirm before the first write
If `project.existingId` is empty, this is the first sync. Show the user a short preview and wait for a yes:
- the team
- the project name
- the number of issues to create, per person
- the unassigned count

Mention that Linear notifies assignees. On a re-sync, go ahead without asking unless more than 20 new issues would be created.

## 4. Project and milestones
- If `project.existingId` is empty, call `LINEAR_CREATE_LINEAR_PROJECT` with these fields:
  - `name`, `team_ids: [teamId]` (a list)
  - `description`, `start_date`, `target_date` (YYYY-MM-DD)
  - `lead_id` (the lead's Linear id, if matched)

  Omit `icon`. Record `projectId` and the project `url`. If the response has no url, read it back with `LINEAR_GET_LINEAR_PROJECT`.
- For each milestone with no `existingId`, call `LINEAR_CREATE_PROJECT_MILESTONE` with `{ project_id, name, target_date, sort_order: index }`. Record `phase → milestone id`.

## 5. Issues
Batch up to 50 independent calls per `COMPOSIO_MULTI_EXECUTE_TOOL`.
- **New** (`existing` is null and `open`): call `LINEAR_CREATE_LINEAR_ISSUE` with these fields:
  - `team_id`, `project_id`
  - `title`, `description`
  - `due_date`, `priority`
  - `assignee_id`, only when matched

  Record `key → { id, identifier, url }` from `data`.
- **Existing and still open in the studio:** call `LINEAR_UPDATE_ISSUE` with `issueId`, `title`, `dueDate`, `description`, plus `assigneeId` only if the studio has a matched owner. Every field you send is overwritten, so omit the rest.
- **Existing but closed in the studio** (`open: false`): leave the issue alone and list it in the summary, so the owner can close it in Linear.
- **Milestones.** Attach issues to their phase milestone with one `LINEAR_RUN_QUERY_OR_MUTATION`, using aliased mutations: `m1: issueUpdate(id: "<issue id>", input: { projectMilestoneId: "<milestone id>" }) { success }`, chunked about 25 per call. This is optional: if it errors, skip it and say so.

## 6. Dependencies
After the issues exist, map each `blocker` and `blocked` key to its issue id (from `existing.id` or what you just created).
- **Read what's there.** One `LINEAR_RUN_QUERY_OR_MUTATION` per 20 blocker issues, aliased:
  `i0: issue(id: "<id>") { id relations(first: 50) { nodes { id type relatedIssue { id } } } }`. A `blocks` relation from the blocker to the blocked issue already exists if one is listed; use its id.
- **Create the missing ones** with aliased mutations, about 20 per call:
  `r0: issueRelationCreate(input: { issueId: "<blocker issue id>", relatedIssueId: "<blocked issue id>", type: blocks }) { success issueRelation { id } }`.
- **Delete** each `remove[]` relation that still exists: `d0: issueRelationDelete(id: "<id>") { success }`.
- Skip any pair where either issue is gone from the project. Record `key → relation id` for every relation that exists after this, and `key → null` for each one you deleted.

## 7. Pull state back
Read every linked issue's state with one `LINEAR_RUN_QUERY_OR_MUTATION`:
`query($id: String!) { project(id: $id) { issues(first: 250) { nodes { id identifier url state { type } } } } }`.
Map each issue `id` back to its `key`. The studio maps `state.type` like this:
- `completed` → done, with the issue URL as evidence
- `canceled` → N/A
- `started` → in progress

## 8. Write back
Save this JSON to a file in the scratchpad, then run `node <tools>/studio.mjs link <id> <file>`:
```json
{ "teamId": "", "teamName": "", "projectId": "", "projectUrl": "",
  "milestones": { "decide": "<id>", "...": "..." },
  "issues": { "<key>": { "id": "", "identifier": "GRO-12", "url": "", "state": "unstarted" } },
  "people": { "<email>": "<linear user id>" },
  "relations": { "<blocker key>><blocked key>": "<relation id or null>" },
  "pulled": { "<key>": { "state": "completed" } } }
```
The output lists the checklist items whose status changed. The open studio reloads by itself.

## 9. Report
In chat, give:
- the project link
- issues created, updated and left alone
- dependency links created and removed
- who got how many issues
- who couldn't be assigned, and why
- the items the pull ticked off

If any calls failed, list them and say that re-running the sync retries only what's missing, because linked issues are never duplicated.
