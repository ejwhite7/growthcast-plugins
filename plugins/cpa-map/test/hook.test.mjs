// The UserPromptSubmit hook delivers a queued request once and stays silent otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const hook = new URL("../tools/context.mjs", import.meta.url).pathname;
const run = (home) => spawnSync(process.execPath, [hook, "--home", home], { input: JSON.stringify({ session_id: "s1" }), encoding: "utf8" });

test("hook: delivers once, ignores stale and missing requests", () => {
	const home = mkdtempSync(join(tmpdir(), "cpamap-hook-"));
	try {
		assert.equal(run(home).stdout, "", "nothing queued: silent");
		writeFileSync(join(home, "request.json"), JSON.stringify({ kind: "actions", at: Date.now(), context: "CPA map request: Write the action list" }));
		const out = JSON.parse(run(home).stdout);
		assert.match(out.hookSpecificOutput.additionalContext, /^\[CPA map request\]\nCPA map request/);
		assert.equal(JSON.parse(readFileSync(join(home, "request.json"), "utf8")).session, "s1");
		assert.equal(run(home).stdout, "", "second message: already delivered");
		writeFileSync(join(home, "request.json"), JSON.stringify({ kind: "actions", at: Date.now() - 13 * 3600e3, context: "old" }));
		assert.equal(run(home).stdout, "", "stale request ignored");
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});
