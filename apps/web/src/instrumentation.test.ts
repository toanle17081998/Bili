import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("an outdated narration WASM does not crash startup; unrelated hook failures still propagate", () => {
	const result = spawnSync(process.execPath, ["--eval", `
		import { mock } from "bun:test";
		import assert from "node:assert/strict";
		import { LocalizationWasmError } from "./src/localization/timing";
		let failure = new LocalizationWasmError("Localization WASM is outdated. Rebuild and restart.");
		mock.module("@/localization/source", () => ({
			startNarrationSourceSweep: async () => { throw failure; },
		}));
		const { register } = await import("./src/instrumentation");
		process.env.NEXT_RUNTIME = "nodejs";
		let diagnostic = "";
		console.error = (...args) => { diagnostic = args.join(" "); };
		await assert.doesNotReject(register());
		assert.match(diagnostic, /WASM is outdated/);
		failure = new Error("Unexpected cleanup failure");
		await assert.rejects(register(), /Unexpected cleanup failure/);
	`], { cwd: process.cwd(), encoding: "utf8", timeout: 15000 });
	assert.equal(result.status, 0, result.stderr);
});
