import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FFmpegService } from "@/media/ffmpeg";
import { removeVideoWatermarks } from "./processing";

test("processing forwards cancellation into probing", async () => {
	const original = FFmpegService.runCommand;
	const controller = new AbortController();
	let probingStarted!: () => void;
	const started = new Promise<void>((resolve) => {
		probingStarted = resolve;
	});
	FFmpegService.runCommand = async (...args) => {
		const [cmd, , options] = args;
		assert.equal(cmd, "ffprobe");
		assert.equal(options?.signal, controller.signal);
		probingStarted();
		return new Promise((_resolve, reject) =>
			options!.signal!.addEventListener(
				"abort",
				() => reject(options!.signal!.reason),
				{ once: true },
			),
		);
	};
	try {
		const pending = removeVideoWatermarks({
			inputPath: "source.mp4",
			outputPath: "clean.mp4",
			regions: [],
			signal: controller.signal,
		});
		await started;
		controller.abort();
		await assert.rejects(pending, /Cannot probe media/);
	} finally {
		FFmpegService.runCommand = original;
	}
});

test(
	"cancelled command settles after the child releases output file handles",
	{ timeout: 10_000 },
	async () => {
		const root = await fs.mkdtemp(
			path.join(os.tmpdir(), "opencut-watermark-cancel-"),
		);
		const file = path.join(root, "locked-output");
		try {
			const controller = new AbortController();
			const pending = FFmpegService.runCommand(
				process.execPath,
				[
					"-e",
					"const fs=require('node:fs'); fs.openSync(process.argv[1], 'w'); setInterval(()=>{},1000)",
					file,
				],
				{ signal: controller.signal },
			);
			const rejection = assert.rejects(pending);
			for (let attempt = 0; attempt < 100; attempt++) {
				if (await fs.stat(file).catch(() => null)) break;
				await new Promise((resolve) => setTimeout(resolve, 20));
			}
			assert.ok(await fs.stat(file));
			controller.abort();
			await rejection;
			await fs.unlink(file);
		} finally {
			assert.ok(
				root.startsWith(path.join(os.tmpdir(), "opencut-watermark-cancel-")),
			);
			await fs.rm(root, { recursive: true, force: true });
		}
	},
);

test(
	"missing executable rejects without waiting indefinitely",
	{ timeout: 5_000 },
	async () => {
		await assert.rejects(
			FFmpegService.runCommand("opencut-missing-test-binary", []),
			{ code: "ENOENT" },
		);
	},
);
