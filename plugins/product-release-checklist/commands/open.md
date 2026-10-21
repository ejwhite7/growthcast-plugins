---
description: Open the release checklist studio, where you plan, run and measure a product launch, and send requests to Claude with your next message
argument-hint: "[feature name and launch date, to start a launch straight away]"
---

Open the Product Release Checklist studio for the user.

1. Start it: `node "${CLAUDE_PLUGIN_ROOT}/tools/studio.mjs" --port 4730` (if `${CLAUDE_PLUGIN_ROOT}` wasn't filled in, the
   script is `tools/studio.mjs` in the product-release-checklist plugin's folder). It is a local server: start it the way
   this client runs dev servers (a preview or launch configuration if there is one, otherwise in the background). If it
   says port 4730 is busy, it is already running.
2. Open http://127.0.0.1:4730 where the user can see it: the client's built-in browser pane if it has one, otherwise
   start it with `--open` so it opens in their browser.
3. If no company context file is set (`~/.product-release-checklist/settings.json`, `contextFile`), and the current project
   has `launches/launch-context.md`, set `contextFile` to it and `exportDir` to that `launches/` folder.
4. Tell the user in two or three sentences: each launch has tabs from Brief & tier through Retro; the checklist dates count
   back from T-0 and filter to the tier; the Ask Claude buttons on the left queue a request that comes to Claude with
   their next message here.

If `$ARGUMENTS` names a feature, also create the launch now with
`node "${CLAUDE_PLUGIN_ROOT}/tools/studio.mjs" new "<name>" --t0 <yyyy-mm-dd>` (ask for the date if it isn't given), run
the launch-kickoff skill's intake on it, and open http://127.0.0.1:4730/#<launch id>.

When a message arrives with a `[Product release checklist request]` block, it is the request the user queued in the
studio: follow it with the product-release-checklist skill.
