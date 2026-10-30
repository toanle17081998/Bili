import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	filterAudioFiles,
	pickRandomMusic,
	resolveMusicPlaylist,
	resolveMusicSelection,
} from "./music-picker";
import { parseVisionResponse } from "./vision-detector";
import { DEFAULT_SUBTITLE_BOX } from "./layout";
import { FFmpegService } from "@/media/ffmpeg";

test("keeps only audio files", () => {
	assert.deepEqual(
		filterAudioFiles({ names: ["a.MP3", "b.txt", "c.wav", "d"] }),
		["a.MP3", "c.wav"],
	);
});

test("returns null when the music directory is missing", async () => {
	assert.equal(await pickRandomMusic({ directory: "Z:\\missing-dir-xyz" }), null);
});

test("resolves explicit music file, none, and random fallback", async () => {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aq-music-"));
	try {
		await fs.writeFile(path.join(dir, "track1.mp3"), "audio1");
		await fs.writeFile(path.join(dir, "track2.mp3"), "audio2");

		const none = await resolveMusicSelection({
			musicFile: "none",
			directory: dir,
		});
		assert.equal(none, null);

		const chosen = await resolveMusicSelection({
			musicFile: "track2.mp3",
			directory: dir,
		});
		assert.equal(chosen, path.join(dir, "track2.mp3"));

		const randomPick = await resolveMusicSelection({
			musicFile: "random",
			directory: dir,
			random: () => 0,
		});
		assert.equal(randomPick, path.join(dir, "track1.mp3"));

		await fs.writeFile(path.join(dir, "track3.mp3"), "audio3");
		const playlist = await resolveMusicPlaylist({
			musicFiles: ["track2.mp3", "track1.mp3"],
			directory: dir,
			random: () => 0,
		});
		assert.deepEqual(playlist, [
			path.join(dir, "track2.mp3"),
			path.join(dir, "track1.mp3"),
			path.join(dir, "track3.mp3"),
		]);
	} finally {
		await fs.rm(dir, { recursive: true, force: true });
	}
});

test("parses vision output and falls back to the default subtitle box", () => {
	const parsed = parseVisionResponse(
		'{"logos":[{"x":0.8,"y":0.05,"width":0.15,"height":0.08}],"subtitle":null}',
	);
	assert.equal(parsed.logos.length, 1);
	assert.deepEqual(parsed.subtitle, DEFAULT_SUBTITLE_BOX);
	assert.deepEqual(parsed.detected, { logos: true, subtitle: false });

	const edgeLogo = parseVisionResponse(
		'{"logos":[{"x":0.036,"y":0.446,"width":0.067,"height":0.107}],"subtitle":{"x":0.198,"y":0.833,"width":0.606,"height":0.069}}',
	);
	assert.equal(edgeLogo.logos.length, 1);
	assert.deepEqual(edgeLogo.detected, { logos: true, subtitle: true });
});

test("ignores malformed vision output", () => {
	const parsed = parseVisionResponse("not json");
	assert.equal(parsed.logos.length, 0);
	assert.equal(parsed.detected.subtitle, false);
});

test("spills oversized -filter_complex arguments to a script file to prevent ENAMETOOLONG", async () => {
	const padding = Array.from({ length: 180 }, () => "anull,")
		.join("");
	const hugeFilter = `anullsrc=r=48000:cl=mono,${padding}atrim=duration=0.05[outa]`;
	assert.ok(hugeFilter.length > 4000 || padding.length > 1000);
	const longFilter = `anullsrc=r=48000:cl=mono,${"anull,".repeat(700)}atrim=duration=0.05[outa]`;
	assert.ok(longFilter.length > 4000);
	await FFmpegService.runCommand("ffmpeg", [
		"-y",
		"-filter_complex",
		longFilter,
		"-map",
		"[outa]",
		"-f",
		"null",
		"-",
	]);
});
