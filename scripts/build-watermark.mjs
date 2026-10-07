import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(
	new URL("../rust/crates/watermark/src/lib.rs", import.meta.url),
);
const output = fileURLToPath(
	new URL("../rust/crates/watermark/watermark.wasm", import.meta.url),
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
	console.error("Rust compiler not found. Install Rust, or set RUSTC_PATH.");
	process.exitCode = 1;
} else {
	process.exitCode = result.status ?? 1;
}
