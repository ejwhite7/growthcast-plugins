---
description: Pull an account again through BlueAlpha and rebuild its CPA Map, keeping the user's tags, calls and line settings
argument-hint: "[account name, act_<id> or gads_<customer id>]"
---

Refresh an account in the CPA Map.

1. Pick the account: the one `$ARGUMENTS` names, otherwise the only built one (`node "${CLAUDE_PLUGIN_ROOT}/tools/cpamap.mjs" accounts`);
   if several are built and none was named, ask which.
2. Follow the cpa-map skill's **Pull** steps for its platform (same raw folder, overwrite the files), then `build` it.
   Settings, overrides and manual calls are kept: only `ads.json` is rewritten. The open studio reloads by itself.
3. Compare the new summary with the previous counts and tell the user what moved: new kills, new scale candidates, ads
   that crossed a line, and the data window the pull covers.
