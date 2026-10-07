import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const appDirectory = fileURLToPath(new URL("../apps/web/", import.meta.url));
const require = createRequire(
	new URL("../apps/web/package.json", import.meta.url),
);
const nextRequire = createRequire(require.resolve("next/package.json"));
const { loadEnvConfig } = nextRequire("@next/env");

// Proxy support is initialized at Node startup, before Next loads its env files.
loadEnvConfig(appDirectory, true);
const nodeArgs = [];
if (
	process.env.HTTPS_PROXY ||
	process.env.HTTP_PROXY ||
	process.env.https_proxy ||
	process.env.http_proxy
) {
	if (!process.allowedNodeEnvironmentFlags.has("--use-env-proxy")) {
		throw new Error(
			"The configured proxy requires a Node version with --use-env-proxy support. Upgrade Node before running dev:web.",
		);
	}
	nodeArgs.push("--use-env-proxy");
}

const child = spawn(
	process.execPath,
	[
		...nodeArgs,
		require.resolve("next/dist/bin/next"),
		"dev",
		"--turbopack",
		...process.argv.slice(2),
	],
	{
		cwd: appDirectory,
		stdio: "inherit",
	},
);
child.on("error", (error) => {
	console.error("Unable to start web development server:", error.message);
	process.exitCode = 1;
});
child.on("exit", (code, signal) => {
	process.exitCode = code ?? (signal ? 1 : 0);
});
