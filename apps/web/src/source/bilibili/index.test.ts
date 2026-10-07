import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BilibiliProvider } from "./index";

async function withToolEnv(
	values: { YTDLP_PATH?: string; FFMPEG_PATH?: string },
	run: () => void | Promise<void>,
) {
	const previous = {
		YTDLP_PATH: process.env.YTDLP_PATH,
		FFMPEG_PATH: process.env.FFMPEG_PATH,
	};
	for (const name of ["YTDLP_PATH", "FFMPEG_PATH"] as const) {
		if (values[name] === undefined) delete process.env[name];
		else process.env[name] = values[name];
	}
	try {
		await run();
	} finally {
		for (const name of ["YTDLP_PATH", "FFMPEG_PATH"] as const) {
			if (previous[name] === undefined) delete process.env[name];
			else process.env[name] = previous[name];
		}
	}
}

function toolConfig(provider: BilibiliProvider) {
	return provider as unknown as { ytdlpPath: string; ffmpegDir?: string };
}

test("video tools default to PATH instead of fixed WinGet installation paths", async () => {
	await withToolEnv({}, () => {
		const config = toolConfig(new BilibiliProvider());
		assert.equal(config.ytdlpPath, "yt-dlp");
		assert.equal(config.ffmpegDir, undefined);
	});
});

test("video tools support explicit executable and ffmpeg locations", async () => {
	await withToolEnv(
		{ YTDLP_PATH: "/custom tools/yt-dlp", FFMPEG_PATH: "/custom tools/ffmpeg" },
		() => {
			const config = toolConfig(new BilibiliProvider());
			assert.equal(config.ytdlpPath, "/custom tools/yt-dlp");
			assert.equal(config.ffmpegDir, "/custom tools/ffmpeg");
		},
	);
});

test("a missing downloader produces an actionable import error", async () => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "opencut-tools-"));
	try {
		await withToolEnv(
			{ YTDLP_PATH: path.join(directory, "missing-yt-dlp") },
			async () => {
				await assert.rejects(
					new BilibiliProvider(directory).importVideo("BV18RHZ6TEeC"),
					/YTDLP_PATH/,
				);
			},
		);
	} finally {
		assert.ok(directory.startsWith(path.join(os.tmpdir(), "opencut-tools-")));
		await fs.rm(directory, { recursive: true, force: true });
	}
});
