import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const root = fileURLToPath(new URL("../", import.meta.url));
const localCargo = path.join(
	os.homedir(),
	".cargo",
	"bin",
	process.platform === "win32" ? "cargo.exe" : "cargo",
);
const cargo =
	process.env.CARGO_PATH || (existsSync(localCargo) ? localCargo : "cargo");
const gnu =
	process.platform === "win32" &&
	existsSync(
		path.join(
			os.homedir(),
			".rustup/toolchains/stable-x86_64-pc-windows-gnu/bin/rustc.exe",
		),
	);
const toolchain = process.env.STORY_RUST_TOOLCHAIN || (gnu ? "stable-gnu" : "");
const result = spawnSync(
	cargo,
	[
		...(toolchain ? [`+${toolchain}`] : []),
		"build",
		"-p",
		"story-narrator",
		"--release",
		"--target",
		"wasm32-unknown-unknown",
	],
	{ cwd: root, stdio: "inherit" },
);
if (result.error) console.error(result.error.message);
if (result.status === 0) {
	copyFileSync(
		path.join(
			root,
			"target/wasm32-unknown-unknown/release/story_narrator.wasm",
		),
		path.join(root, "rust/crates/story-narrator/story-narrator.wasm"),
	);
}
process.exitCode = result.status ?? 1;
