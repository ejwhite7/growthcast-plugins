---
description: Open the Virtual Event Strategy studio, a local planning app for virtual event strategy, event briefs, workflow and exports
argument-hint: "[port, optional]"
---

Open the Virtual Event Strategy studio for the user.

1. Start it: `node "${CLAUDE_PLUGIN_ROOT}/tools/studio.mjs" --port 4731` (if `${CLAUDE_PLUGIN_ROOT}` wasn't filled in, the
   script is `tools/studio.mjs` in the webinar-strategy plugin's folder). It is a local static server: start it the way
   this client runs dev servers (a preview or launch configuration if there is one, otherwise in the background). If it
   says port 4731 is busy, it is already running. Use `$ARGUMENTS` as the port if the user gave one.
2. Open http://127.0.0.1:4731 where the user can see it (the client's built-in browser pane if it has one).
3. Tell the user in two or three sentences: "Why virtual events" is an interactive map you can pan, zoom and select;
   each session has tabs from Event brief to Export; everything is saved in this browser only, so use Export backup
   in the sidebar to keep a copy; nothing is published or sent.

Do not run anything else, install packages, or contact any outside service. When the user asks for help filling a
session, follow the webinar-strategy skill and respect its approval boundaries.
