import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const appDirectory = fileURLToPath(new URL("../apps/web/", import.meta.url));
const require = createRequire(
	new URL("../apps/web/package.json", import.meta.url),
);
const child = spawn(
	process.execPath,
	[
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
