// UserPromptSubmit hook: hands Claude the request the user queued in the GTM Positioning studio, once, with the
// next message they send. A request older than twelve hours is ignored. The hook never blocks a message: on any
// problem it adds nothing.
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const reqPath = join(homedir(), ".positioning-workshop", "request.json");

try {
  const req = JSON.parse(readFileSync(reqPath, "utf8"));
  if (!req || req.delivered || Date.now() - req.setAt > 12 * 3600e3) process.exit(0);
  const context = [
    "[GTM Positioning request]",
    "The user queued this in the GTM Positioning studio. Treat a short go-ahead such as \"go\" or \"run it\" as approval to carry it out.",
    "",
    req.context,
  ].join("\n");
  writeFileSync(reqPath, `${JSON.stringify({ ...req, delivered: true, deliveredAt: Date.now() }, null, 2)}\n`);
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context } }));
} catch {
  process.exit(0);
}
