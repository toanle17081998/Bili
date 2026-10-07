import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const launcher = fileURLToPath(new URL("./dev-web.mjs", import.meta.url));
const probe = `
if (process.argv[1]?.replaceAll("\\\\", "/").endsWith("/next")) {
  console.log(JSON.stringify({ args: process.execArgv, forwarded: process.argv.slice(2) }));
  process.exit(0);
}
`;

function launch(proxy) {
	const result = spawnSync(process.execPath, [launcher, "--port", "3001"], {
		encoding: "utf8",
		timeout: 15_000,
		env: {
			...process.env,
			HTTP_PROXY: "",
			HTTPS_PROXY: proxy,
			http_proxy: "",
			https_proxy: "",
			NODE_USE_ENV_PROXY: "0",
			NODE_OPTIONS: `--import=data:text/javascript,${encodeURIComponent(probe)}`,
		},
	});
	assert.equal(result.error, undefined);
	assert.equal(result.status, 0, result.stderr);
	return JSON.parse(result.stdout.trim().split("\n").at(-1));
}

test("dev launcher enables Node proxy support when a proxy is configured", () => {
	assert.ok(launch("http://127.0.0.1:3128").args.includes("--use-env-proxy"));
});

test("dev launcher preserves direct connections and forwards Next arguments", () => {
	const result = launch("");
	assert.ok(!result.args.includes("--use-env-proxy"));
	assert.deepEqual(result.forwarded, ["dev", "--turbopack", "--port", "3001"]);
});
