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
	const originalFetch = globalThis.fetch;
	try {
		globalThis.fetch = (async () => { throw new Error("Metadata unavailable"); }) as typeof fetch;
		await withToolEnv(
			{
				YTDLP_PATH: path.join(directory, "missing-yt-dlp"),
				FFMPEG_PATH: path.join(directory, "missing-ffmpeg"),
			},
			async () => {
				await assert.rejects(
					new BilibiliProvider(directory).importVideo("BV18RHZ6TEeC"),
					/YTDLP_PATH/,
				);
			},
		);
	} finally {
		globalThis.fetch = originalFetch;
		assert.ok(directory.startsWith(path.join(os.tmpdir(), "opencut-tools-")));
		await fs.rm(directory, { recursive: true, force: true });
	}
});

test("metadata uses the Bilibili API without invoking yt-dlp", async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async (input) => {
		const url = new URL(String(input));
		if (url.pathname.endsWith("/view")) {
			return Response.json({
				code: 0,
				data: {
					cid: 123,
					title: "API video",
					duration: 42,
					pic: "http://example.com/cover.jpg",
					owner: { name: "Creator" },
				},
			});
		}
		return Response.json({
			code: 0,
			data: {
				dash: {
					video: [{ baseUrl: "https://example.com/video.m4s", codecid: 7 }],
					audio: [{ baseUrl: "https://example.com/audio.m4s" }],
				},
			},
		});
	}) as typeof fetch;

	try {
		await withToolEnv({ YTDLP_PATH: "missing-yt-dlp" }, async () => {
			const metadata = await new BilibiliProvider().getMetadata("BV18kJD6LEEn");
			assert.equal(metadata.title, "API video");
			assert.equal(metadata.duration, 42);
			assert.equal(metadata.thumbnail, "https://example.com/cover.jpg");
			assert.equal(metadata.uploader, "Creator");
		});
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("provider instances share one import for the same output file", async () => {
	const prefix = path.join(os.tmpdir(), "bili-import-shared-");
	const directory = await fs.mkdtemp(prefix);
	const originalFetch = globalThis.fetch;
	try {
		const id = "BV18kJD6LEEn";
		await fs.writeFile(path.join(directory, `${id}.full.mp4`), Buffer.alloc(50000));
		let requests = 0;
		globalThis.fetch = (async (input) => {
			requests++;
			return new URL(String(input)).pathname.endsWith("/view")
				? Response.json({ code: 0, data: { cid: 123, title: "Shared import", duration: 42 } })
				: Response.json({ code: 0, data: { dash: { video: [{ baseUrl: "https://example.com/video.m4s", codecid: 7 }] } } });
		}) as typeof fetch;
		const [first, second] = await Promise.all([
			new BilibiliProvider(directory).importVideo(id), new BilibiliProvider(directory).importVideo(id),
		]);
		assert.deepEqual(second, first);
		assert.equal(requests, 2, "one metadata lookup and one play URL lookup serve both callers");
	} finally {
		globalThis.fetch = originalFetch;
		assert.ok(directory.startsWith(prefix));
		await fs.rm(directory, { recursive: true, force: true });
	}
});

test("a completed download left by a failed rename resumes without downloading again", async () => {
	const prefix = path.join(os.tmpdir(), "bili-import-resume-");
	const directory = await fs.mkdtemp(prefix);
	const originalFetch = globalThis.fetch;
	try {
		const id = "BV18kJD6LEEn";
		const temporaryPath = path.join(directory, `${id}.full.download.mp4`);
		const finalPath = path.join(directory, `${id}.full.mp4`);
		const contents = Buffer.alloc(50000, 42);
		await fs.writeFile(temporaryPath, contents);
		await fs.writeFile(`${temporaryPath}.complete.json`, JSON.stringify({
			provider: "bilibili", sourceId: id, sourceUrl: `https://www.bilibili.com/video/${id}`,
			title: "Completed download", thumbnail: "", duration: 42, fullVideo: true,
			localMediaPath: finalPath, createdAt: new Date().toISOString(), downloadedSize: contents.length,
		}));
		let requests = 0;
		globalThis.fetch = (async () => { requests++; throw new Error("Network unavailable"); }) as typeof fetch;
		const imported = await new BilibiliProvider(directory).importVideo(id);
		assert.equal(requests, 0);
		assert.equal(imported.localMediaPath, finalPath);
		assert.equal(imported.title, "Completed download");
		assert.deepEqual(await fs.readFile(finalPath), contents);
		await assert.rejects(fs.access(`${temporaryPath}.complete.json`), { code: "ENOENT" });
	} finally {
		globalThis.fetch = originalFetch;
		assert.ok(directory.startsWith(prefix));
		await fs.rm(directory, { recursive: true, force: true });
	}
});
