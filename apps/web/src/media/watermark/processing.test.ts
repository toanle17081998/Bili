import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { FFmpegService } from "@/media/ffmpeg";
import { removeVideoWatermarks } from "./processing";

test(
	"removal reconstructs the background, respects time windows and preserves source and audio",
	{ timeout: 30_000 },
	async () => {
		const directory = await fs.mkdtemp(
			path.join(os.tmpdir(), "opencut-watermark-"),
		);
		const source = path.join(directory, "source.mp4");
		const output = path.join(directory, "clean.mp4");
		try {
			await FFmpegService.runCommand("ffmpeg", [
				"-y",
				"-f",
				"lavfi",
				"-i",
				"color=c=0x3264a0:s=160x96:r=10:d=2",
				"-f",
				"lavfi",
				"-i",
				"sine=frequency=440:sample_rate=48000:duration=2",
				"-vf",
				"drawbox=x=110:y=12:w=24:h=12:color=white:t=fill:enable='gte(t,0.5)*lt(t,1.5)'",
				"-c:v",
				"libx264",
				"-pix_fmt",
				"yuv420p",
				"-c:a",
				"aac",
				"-shortest",
				source,
			]);
			const hash = createHash("sha256")
				.update(await fs.readFile(source))
				.digest("hex");
			await removeVideoWatermarks({
				inputPath: source,
				outputPath: output,
				regions: [
					{ x: 108, y: 10, width: 28, height: 16, start: 0.75, end: 1.25 },
				],
			});
			const pixel = async ({ time }: { time: number }) => {
				const file = path.join(directory, `pixel-${time}.ppm`);
				await FFmpegService.runCommand("ffmpeg", [
					"-y",
					"-ss",
					String(time),
					"-i",
					output,
					"-vf",
					"format=rgb24,crop=1:1:120:18",
					"-frames:v",
					"1",
					file,
				]);
				const data = await fs.readFile(file);
				assert.equal(data.subarray(0, 2).toString(), "P6");
				return data.subarray(-3);
			};
			assert.ok((await pixel({ time: 0.6 }))[0] > 220);
			const cleaned = await pixel({ time: 1 });
			assert.ok(cleaned[0] > 30 && cleaned[0] < 90, String(cleaned));
			assert.ok(cleaned[1] > 70 && cleaned[1] < 130, String(cleaned));
			assert.ok(cleaned[2] > 130 && cleaned[2] < 190, String(cleaned));
			assert.ok((await pixel({ time: 1.4 }))[0] > 220);
			const probe = await FFmpegService.probeVideo(output);
			assert.equal(probe.hasAudio, true);
			assert.deepEqual(probe.audioCodecs, ["aac"]);
			const audioPackets = async (file: string) =>
				JSON.parse(
					(
						await FFmpegService.runCommand("ffprobe", [
							"-v",
							"error",
							"-select_streams",
							"a",
							"-show_packets",
							"-show_data_hash",
							"sha256",
							"-show_entries",
							"packet=pts_time,duration_time,data_hash",
							"-of",
							"json",
							file,
						])
					).stdout,
				).packets;
			assert.deepEqual(
				await audioPackets(output),
				await audioPackets(source),
				"Watermark removal must not re-encode or retime AAC audio",
			);
			assert.equal(probe.width, 160);
			assert.equal(probe.height, 96);
			assert.ok(Math.abs(probe.duration - 2) < 0.1);
			assert.equal(
				createHash("sha256")
					.update(await fs.readFile(source))
					.digest("hex"),
				hash,
			);
		} finally {
			assert.ok(
				directory.startsWith(path.join(os.tmpdir(), "opencut-watermark-")),
			);
			await fs.rm(directory, { recursive: true, force: true });
		}
	},
);

test("removal also accepts silent video", { timeout: 15_000 }, async () => {
	const directory = await fs.mkdtemp(
		path.join(os.tmpdir(), "opencut-watermark-"),
	);
	try {
		const source = path.join(directory, "source.mp4");
		const output = path.join(directory, "clean.mp4");
		await FFmpegService.runCommand("ffmpeg", [
			"-y",
			"-f",
			"lavfi",
			"-i",
			"color=c=blue:s=160x96:r=10:d=1",
			"-c:v",
			"libx264",
			source,
		]);
		await removeVideoWatermarks({
			inputPath: source,
			outputPath: output,
			regions: [{ x: 108, y: 10, width: 28, height: 16, start: 0, end: 1 }],
		});
		assert.equal((await FFmpegService.probeVideo(output)).hasAudio, false);
	} finally {
		assert.ok(
			directory.startsWith(path.join(os.tmpdir(), "opencut-watermark-")),
		);
		await fs.rm(directory, { recursive: true, force: true });
	}
});

test(
	"removal uses displayed coordinates for rotated video",
	{ timeout: 15_000 },
	async () => {
		const directory = await fs.mkdtemp(
			path.join(os.tmpdir(), "opencut-watermark-"),
		);
		try {
			const source = path.join(directory, "source.mp4");
			const rotated = path.join(directory, "rotated.mp4");
			const output = path.join(directory, "clean.mp4");
			await FFmpegService.runCommand("ffmpeg", [
				"-y",
				"-f",
				"lavfi",
				"-i",
				"color=c=blue:s=160x96:r=10:d=1",
				"-c:v",
				"libx264",
				source,
			]);
			await FFmpegService.runCommand("ffmpeg", [
				"-y",
				"-display_rotation:v:0",
				"90",
				"-i",
				source,
				"-c",
				"copy",
				rotated,
			]);
			const probe = await FFmpegService.probeVideo(rotated);
			assert.equal(probe.width, 96);
			assert.equal(probe.height, 160);
			await removeVideoWatermarks({
				inputPath: rotated,
				outputPath: output,
				regions: [{ x: 10, y: 120, width: 24, height: 16, start: 0, end: 1 }],
			});
			const cleaned = await FFmpegService.probeVideo(output);
			assert.equal(cleaned.width, 96);
			assert.equal(cleaned.height, 160);
		} finally {
			assert.ok(
				directory.startsWith(path.join(os.tmpdir(), "opencut-watermark-")),
			);
			await fs.rm(directory, { recursive: true, force: true });
		}
	},
);
