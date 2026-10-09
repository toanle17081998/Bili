import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { FFmpegService } from "@/media/ffmpeg";
import { POST } from "@/app/api/localization/music/route";
import { loadDubbingTiming } from "./timing";

function musicRequest({ file, duration, signal }: { file?: File; duration: string; signal?: AbortSignal }) {
	const body = new FormData();
	if (file) body.set("music", file);
	body.set("duration", duration);
	return new NextRequest("http://localhost/api/localization/music", { method: "POST", body, signal });
}

test("Rust bounds background music duration and keeps short-clip fades inside the clip", async () => {
	const policy = await loadDubbingTiming();
	for (const duration of [0, 0.09, -1, NaN, Infinity, 3601]) {
		assert.equal(policy.background_music_valid_duration(duration), 0);
		assert.ok(Number.isNaN(policy.background_music_fade_duration(duration)));
	}
	for (const duration of [0.1, 1, 8, 3600]) {
		assert.equal(policy.background_music_valid_duration(duration), 1);
		assert.ok(policy.background_music_fade_duration(duration) * 2 <= duration);
	}
});

test("music upload rejects invalid files, durations and cancelled jobs without creating a music asset", async () => {
	assert.equal((await POST(new NextRequest("http://localhost/api/localization/music", { method: "POST", body: "{}" }))).status, 415);
	assert.equal((await POST(musicRequest({ duration: "4" }))).status, 400);
	const file = new File(["invalid audio"], "broken.mp3", { type: "audio/mpeg" });
	for (const duration of ["0", "-1", "NaN", "Infinity", "3601"])
		assert.equal((await POST(musicRequest({ file, duration }))).status, 400);
	const invalid = await POST(musicRequest({ file, duration: "4" }));
	assert.equal(invalid.status, 422);
	assert.match((await invalid.json()).error, /Không đọc được file nhạc/);
	const controller = new AbortController();
	controller.abort();
	assert.equal((await POST(musicRequest({ file, duration: "4", signal: controller.signal }))).status, 408);
});

test("real music upload loops short audio, trims long audio and fades only the full bed's edges", async () => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "background-music-test-"));
	try {
		const input = path.join(directory, "music.wav");
		await FFmpegService.runCommand("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-ar", "48000", input]);
		const file = new File([await fs.readFile(input)], "music.wav", { type: "audio/wav" });
		for (const duration of [6.4, 0.4]) {
			const response = await POST(musicRequest({ file, duration: String(duration) }));
			assert.equal(response.status, 200);
			assert.equal(response.headers.get("content-type"), "audio/mpeg");
			const output = path.join(directory, `${duration}.mp3`);
			await fs.writeFile(output, new Uint8Array(await response.arrayBuffer()));
			const probe = await FFmpegService.probeVideo(output);
			assert.equal(probe.hasAudio, true);
			assert.ok(Math.abs(probe.duration - duration) < 0.05);
			if (duration === 6.4) {
				const volumeAt = async ({ time, length = 0.04 }: { time: number; length?: number }) => {
					const { stderr } = await FFmpegService.runCommand("ffmpeg", ["-i", output, "-af", `atrim=start=${time}:duration=${length},volumedetect`, "-f", "null", "-"]);
					const match = stderr.match(/mean_volume: (-?[\d.]+) dB/);
					assert.ok(match, stderr);
					return Number(match[1]);
				};
				const middle = await volumeAt({ time: 3.2 });
				assert.ok(middle > -30, "music remains audible well beyond the original one-second file");
				assert.ok(await volumeAt({ time: 0.01 }) < middle - 20, "fade-in starts softly");
				assert.ok(await volumeAt({ time: 6.32 }) < middle - 20, "fade-out ends softly");
				assert.ok(Math.abs(await volumeAt({ time: 2.02 }) - middle) < 1, "loop boundaries do not restart the intro fade");
			}
		}
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
});
