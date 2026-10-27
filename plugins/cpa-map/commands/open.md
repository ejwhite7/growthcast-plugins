---
description: Open the CPA Map, where every Meta or Google ad sits on a spend × CPA scatter with kill and scale lines, and pull or refresh an account through BlueAlpha
argument-hint: "[account name, act_<id> or gads_<customer id>]"
---

Open the CPA Map for the user.

1. Start it: `node "${CLAUDE_PLUGIN_ROOT}/tools/cpamap.mjs" --port 4731` (if `${CLAUDE_PLUGIN_ROOT}` wasn't filled in, the
   script is `tools/cpamap.mjs` in the cpa-map plugin's folder). It is a local server: start it the way this client
   runs dev servers (a preview or launch configuration if there is one, otherwise in the background). If it says port
   4731 is busy, it is already running.
2. If `$ARGUMENTS` names an account, or no account has been built yet (`node "${CLAUDE_PLUGIN_ROOT}/tools/cpamap.mjs" accounts`
   prints `[]`), follow the cpa-map skill's **Pull** steps for that account and platform (ask which one if there are
   several candidates and none was named; Meta and Google accounts can share a name). Pulling a big account takes a few
   minutes; say so.
3. Open http://127.0.0.1:4731/#<account id> where the user can see it: the client's built-in browser pane if it has one,
   otherwise start the server with `--open` so it opens in their browser.
4. Tell the user in two or three sentences what the map shows (lines, filled = live, hollow = not live), that the
   playbook steps on the left walk the method (turn winners back on, kill and scale, compare formats, grade stages),
   that they can filter by campaign and ad set and hide everything else, that clicking a dot lets them fix its format
   or stage or call it by hand, that Export has the report, slides, PDFs, action plan and readout, and that the Ask
   Claude buttons queue a request that comes to Claude with their next message here.

When a message arrives with a `[CPA map request]` block, it is the request the user queued in the studio: follow it
with the cpa-map skill.
