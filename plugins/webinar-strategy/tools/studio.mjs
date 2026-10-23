// Webinar Strategy studio: a dependency-free static file server for the local planning studio.
// Data lives in the browser (localStorage), not on this server: there are no write endpoints and no file API.
// Binds to loopback by default, answers GET/HEAD only, allowlists files under studio/, and checks Host and Origin.
//
// Usage: node tools/studio.mjs [--port 4731]      (or PORT=0 for a free port; STUDIO_HOST to override, default 127.0.0.1)
//        STUDIO_ALLOWED_HOSTS=name1,name2 permits extra Host names (needed only if you bind beyond loopback on purpose).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const studioDir = resolve(fileURLToPath(new URL("../studio/", import.meta.url)));
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const LOOPBACK = ["127.0.0.1", "localhost", "[::1]"];

export function createStudioServer({ port = 4731, host = "127.0.0.1", allowedHosts = [] } = {}) {
	const okHosts = new Set([...LOOPBACK, ...allowedHosts.map((h) => h.toLowerCase())]);
	const hostnameOf = (hostHeader) => {
		try {
			return new URL(`http://${hostHeader}`).hostname.toLowerCase();
		} catch {
			return null;
		}
	};
	const send = (res, status, body, type = "text/plain; charset=utf-8", extra = {}) => {
		res.writeHead(status, {
			"Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
			"Content-Security-Policy": CSP, "Cross-Origin-Resource-Policy": "same-origin", ...extra,
		});
		res.end(body);
	};
	const server = createServer(async (req, res) => {
		try {
			const hn = hostnameOf(req.headers.host ?? "");
			if (!hn || !okHosts.has(hn)) return send(res, 421, "Misdirected request: unexpected Host");
			const origin = req.headers.origin;
			if (origin !== undefined) {
				let oh = null;
				try {
					oh = new URL(origin).host.toLowerCase();
				} catch {}
				if (oh !== String(req.headers.host).toLowerCase()) return send(res, 403, "Cross-origin request refused");
			}
			if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed", "text/plain; charset=utf-8", { Allow: "GET, HEAD" });
			let pathname;
			try {
				pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
			} catch {
				return send(res, 400, "Bad request");
			}
			if (pathname.includes("\0") || pathname.includes("\\")) return send(res, 400, "Bad request");
			if (pathname === "/") pathname = "/index.html";
			const file = resolve(join(studioDir, pathname));
			const rel = file.slice(studioDir.length + 1);
			const type = TYPES[extname(file).toLowerCase()];
			if (!file.startsWith(studioDir + sep) || rel.split(sep).some((p) => p.startsWith(".")) || !type) return send(res, 404, "Not found");
			let body;
			try {
				body = await readFile(file);
			} catch {
				return send(res, 404, "Not found");
			}
			send(res, 200, req.method === "HEAD" ? undefined : body, type);
		} catch {
			send(res, 500, "Server error");
		}
	});
	return { server, listen: () => new Promise((ok, no) => { server.once("error", no); server.listen(port, host, () => ok(server.address())); }), close: () => new Promise((ok) => server.close(ok)) };
}

// Only the studio-specific variable can widen the bind address; a generic HOST set by a container or CI image is ignored.
export const listenHost = (env = process.env) => env.STUDIO_HOST || "127.0.0.1";

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
	const args = process.argv.slice(2);
	const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
	const port = Number(process.env.PORT ?? flag("--port") ?? 4731);
	const host = listenHost();
	if (!Number.isInteger(port) || port < 0 || port > 65535) {
		console.error("Invalid port");
		process.exit(2);
	}
	const allowedHosts = (process.env.STUDIO_ALLOWED_HOSTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
	const s = createStudioServer({ port, host, allowedHosts });
	s.listen().then(
		(addr) => console.log(`Virtual Event Strategy studio: http://${addr.family === "IPv6" ? `[${addr.address}]` : addr.address}:${addr.port}  (planning only; data stays in your browser)`),
		(err) => {
			console.error(err.code === "EADDRINUSE" ? `Port ${port} is busy: the studio may already be running.` : `Could not start: ${err.message}`);
			process.exit(1);
		},
	);
}
