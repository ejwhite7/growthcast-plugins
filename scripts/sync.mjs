// Copies each plugin's released files from its own repo into plugins/<name>, but only when
// plugin.json on the repo's default branch carries a new version. Unreleased commits never ship.
// sources.json records the repo, commit and version each folder came from.
// Usage: node scripts/sync.mjs [plugin-name] [--force]
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const marketplacePath = join(root, ".claude-plugin/marketplace.json");
const sourcesPath = join(root, "sources.json");
const marketplace = JSON.parse(await readFile(marketplacePath, "utf8"));
const sources = JSON.parse(await readFile(sourcesPath, "utf8"));
const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.find((a) => !a.startsWith("--"));
if (only && !sources[only]) throw new Error(`no plugin named ${only} in sources.json`);

// Never copied in: repo plumbing, and the old per-repo marketplace manifest.
const skip = new Set([".git", ".github", "node_modules", ".claude-plugin/marketplace.json"]);

const changes = [];
for (const [name, source] of Object.entries(sources)) {
	if (only && name !== only) continue;
	// First-party plugins developed in this repository (sources.json: inRepo) have no upstream to copy from.
	if (source.inRepo || !source.repo) continue;
	const entry = marketplace.plugins.find((p) => p.name === name);
	if (!entry) throw new Error(`${name} is in sources.json but not marketplace.json`);

	const tmp = await mkdtemp(join(tmpdir(), `${name}-`));
	try {
		execFileSync("git", ["clone", "-q", "--depth", "1", `https://github.com/${source.repo}.git`, tmp]);
		const sha = execFileSync("git", ["-C", tmp, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
		const manifest = JSON.parse(await readFile(join(tmp, ".claude-plugin/plugin.json"), "utf8"));
		if (manifest.name !== name) throw new Error(`${source.repo} plugin.json name is ${manifest.name}, expected ${name}`);
		if (manifest.version === source.version && !force) continue;

		const dest = join(root, "plugins", name);
		await rm(dest, { recursive: true, force: true });
		await cp(tmp, dest, { recursive: true, filter: (src) => !skip.has(src.slice(tmp.length + 1)) });

		changes.push(`${name} ${source.version} -> ${manifest.version}`);
		Object.assign(source, { sha, version: manifest.version });
		entry.version = manifest.version;
	} finally {
		await rm(tmp, { recursive: true, force: true });
	}
}

if (changes.length) {
	await writeFile(marketplacePath, JSON.stringify(marketplace, null, 2) + "\n");
	await writeFile(sourcesPath, JSON.stringify(sources, null, "\t") + "\n");
}
console.log(changes.length ? changes.join("\n") : "up to date");
