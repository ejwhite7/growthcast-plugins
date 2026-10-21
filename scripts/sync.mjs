// Pins each plugin in the marketplace to the head of its repo's default branch,
// but only when plugin.json carries a new version. Unreleased commits never ship.
// Usage: node scripts/sync.mjs [plugin-name]   (GITHUB_TOKEN optional, raises rate limit)
import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../.claude-plugin/marketplace.json", import.meta.url);
const marketplace = JSON.parse(await readFile(path, "utf8"));
const only = process.argv[2];
const headers = { Accept: "application/vnd.github+json", "User-Agent": "growthcast-marketplace-sync" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function gh(url) {
	const res = await fetch(`https://api.github.com/${url}`, { headers });
	if (!res.ok) throw new Error(`${url}: ${res.status} ${await res.text()}`);
	return res.json();
}

const changes = [];
for (const plugin of marketplace.plugins) {
	if (only && plugin.name !== only) continue;
	const { repo } = plugin.source;
	const { default_branch } = await gh(`repos/${repo}`);
	const { sha } = await gh(`repos/${repo}/commits/${default_branch}`);
	const file = await gh(`repos/${repo}/contents/.claude-plugin/plugin.json?ref=${sha}`);
	const manifest = JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
	if (manifest.name !== plugin.name) throw new Error(`${repo} plugin.json name is ${manifest.name}, expected ${plugin.name}`);
	if (manifest.version === plugin.version) continue;
	changes.push(`${plugin.name} ${plugin.version} -> ${manifest.version}`);
	plugin.version = manifest.version;
	plugin.source.sha = sha;
}

if (only && !marketplace.plugins.some((p) => p.name === only)) throw new Error(`no plugin named ${only}`);
if (changes.length) await writeFile(path, JSON.stringify(marketplace, null, 2) + "\n");
console.log(changes.length ? changes.join("\n") : "up to date");
