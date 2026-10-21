---
description: Open the GTM Positioning studio, a GrowthCast-branded screen for each module whose queued request goes to Claude with your next message
---

Open the GTM Positioning studio for the user.

1. Start it: `node "${CLAUDE_PLUGIN_ROOT}/studio/server.mjs" --port 4710 --project "<current working directory>"`. If `${CLAUDE_PLUGIN_ROOT}` was not filled in, the script is `studio/server.mjs` in the gtm-positioning plugin folder. It is a local server, so run it in the background. If it says port 4710 is busy, it is already running; register the project with `node <same script> add "<current working directory>"` instead.
2. Open http://127.0.0.1:4710 where the user can see it: the client's built-in browser pane if it has one, otherwise start the server with `--open`.
3. Tell the user in one or two sentences: pick or create a run on the left, open a module, fill in its brief, and press "Queue for Claude". Their next message here, even just "go", carries that request.

When a message arrives with a `[GTM Positioning request]` block, carry out that request with the named skill, following the stage rules in the gtm-positioning:workshop command. Save to the exact paths it gives so the studio picks up the output.
