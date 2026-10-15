import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(
	new URL("../rust/crates/split-video/src/lib.rs", import.meta.url),
);
const output = fileURLToPath(
	new URL("../rust/crates/split-video/split-video.wasm", import.meta.url),
);
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
		source,
		"-o",
		output,
	],
	{ stdio: "inherit" },
);
if (result.error) {
	console.error(
		"Rust compiler not found. Install Rust with wasm32-unknown-unknown, or set RUSTC_PATH.",
	);
	process.exitCode = 1;
} else {
	process.exitCode = result.status ?? 1;
}
