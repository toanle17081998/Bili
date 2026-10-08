import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const result = spawnSync(
	process.env.RUSTC_PATH || "rustc",
	[
		"--edition=2024",
		"--crate-type",
		"cdylib",
		"--target",
		"wasm32-unknown-unknown",
		"-C",
		"opt-level=3",
		"-C",
		"strip=symbols",
		"-C",
		"panic=abort",
		fileURLToPath(new URL("../rust/search-filter/src/lib.rs", import.meta.url)),
		"-o",
		fileURLToPath(
			new URL("../apps/web/public/search-filter.wasm", import.meta.url),
		),
	],
	{ stdio: "inherit" },
);
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
