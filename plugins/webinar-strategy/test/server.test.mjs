// node:test coverage for the static server (loopback, Host/Origin checks, no traversal, GET/HEAD only). NOT YET RUN.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { createStudioServer } from "../tools/studio.mjs";

let studio, port;
before(async () => {
	studio = createStudioServer({ port: 0 });
	const addr = await studio.listen();
	port = addr.port;
	assert.equal(addr.address, "127.0.0.1", "binds to loopback by default");
});
after(() => studio.close());

const call = (path, { method = "GET", headers = {} } = {}) =>
	new Promise((resolve, reject) => {
		const req = request({ host: "127.0.0.1", port, path, method, headers }, (res) => {
			const chunks = [];
			res.on("data", (c) => chunks.push(c));
			res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
		});
		req.on("error", reject);
		req.end();
	});

test("serves the studio with hardening headers", async () => {
	const r = await call("/");
	assert.equal(r.status, 200);
	assert.match(r.headers["content-type"], /text\/html/);
	assert.match(r.body, /Virtual Event Strategy/);
	assert.ok(!/Webinar|webinars/.test(r.body.replace(/webinar-strategy/g, "")), "page uses Virtual Event wording");
	assert.match(r.headers["content-security-policy"], /script-src 'self'/);
	assert.match(r.headers["content-security-policy"], /frame-ancestors 'none'/);
	assert.equal(r.headers["x-content-type-options"], "nosniff");
	assert.equal(r.headers["cache-control"], "no-store");
});

test("serves modules, scripts and styles with the right types", async () => {
	assert.match((await call("/model.mjs")).headers["content-type"], /javascript/);
	assert.match((await call("/app.js")).headers["content-type"], /javascript/);
	assert.match((await call("/studio.css")).headers["content-type"], /text\/css/);
});

test("HEAD works and mutating methods are refused", async () => {
	assert.equal((await call("/", { method: "HEAD" })).status, 200);
	for (const method of ["POST", "PUT", "DELETE", "PATCH"]) assert.equal((await call("/", { method })).status, 405, method);
});

test("path traversal, dotfiles, unknown types and missing files are 404", async () => {
	for (const p of ["/..%2fpackage.json", "/%2e%2e/package.json", "/..%2f..%2fetc%2fpasswd", "/.hidden", "/nope.html", "/model.mjs.bak", "/..%5cpackage.json", "/%00"]) {
		const r = await call(p);
		assert.ok([400, 404].includes(r.status), `${p} -> ${r.status}`);
		assert.ok(!r.body.includes('"name": "webinar-strategy"'), p);
	}
});

test("unexpected Host headers are refused (DNS rebinding defence)", async () => {
	assert.equal((await call("/", { headers: { Host: "evil.example.com" } })).status, 421);
	assert.equal((await call("/", { headers: { Host: `localhost:${port}` } })).status, 200);
});

test("foreign Origin headers are refused; same-origin is accepted", async () => {
	assert.equal((await call("/", { headers: { Origin: "https://evil.example.com" } })).status, 403);
	assert.equal((await call("/", { headers: { Origin: `http://127.0.0.1:${port}`, Host: `127.0.0.1:${port}` } })).status, 200);
});

test("there is no data API: common API paths do not exist", async () => {
	for (const p of ["/api", "/api/sessions", "/sessions.json", "/data"]) assert.equal((await call(p)).status, 404, p);
});
