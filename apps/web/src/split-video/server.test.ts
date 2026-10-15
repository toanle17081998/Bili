import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { FFmpegService } from "@/media/ffmpeg";
import { POST, GET, DELETE } from "@/app/api/source/split/route";
import {
	getDownloadThumbnail,
	getSplitDirectory,
	removeSplitBatch,
	resolveDownloadedVideo,
	splitVideoOnServer,
	SplitRequestError,
	retainSplitResult,
	getSplitResultDirectory,
	removeRetainedSplitResult,
} from "./server";
import type { SplitResult } from "./types";

test("FFmpeg splitting API keeps accurate cuts, source audio, downloadable files and cleanup", async () => {
	const id = `split-test-${randomUUID()}.mp4`;
	const source = path.resolve(process.cwd(), ".local_storage/downloads", id);
	const tailSource = path.resolve(
		process.cwd(),
		".local_storage/downloads",
		`split-test-tail-${randomUUID()}.mp4`,
	);
	const tailBatch = randomUUID();
	const batchId = randomUUID();
	await fs.mkdir(path.dirname(source), { recursive: true });
	let thumbnail: string | undefined;
	try {
		await FFmpegService.runCommand("ffmpeg", [
			"-y",
			"-f",
			"lavfi",
			"-i",
			"color=red:s=160x96:d=4:r=30",
			"-f",
			"lavfi",
			"-i",
			"color=lime:s=160x96:d=4:r=30",
			"-f",
			"lavfi",
			"-i",
			"color=blue:s=160x96:d=4:r=30",
			"-f",
			"lavfi",
			"-i",
			"sine=frequency=500:duration=12",
			"-filter_complex",
			"[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]",
			"-map",
			"[v]",
			"-map",
			"3:a",
			"-c:v",
			"libx264",
			"-g",
			"300",
			"-pix_fmt",
			"yuv420p",
			"-c:a",
			"aac",
			source,
		]);
		// Reject invalid input before allocating a temporary batch.
		{
			await assert.rejects(
				resolveDownloadedVideo({ filePath: path.resolve("package.json") }),
				SplitRequestError,
			);
			assert.throws(
				() => getSplitDirectory({ batchId: "../downloads" }),
				SplitRequestError,
			);
			const invalidBatch = randomUUID();
			const response = await POST(
				new NextRequest("http://localhost/api/source/split", {
					method: "POST",
					body: JSON.stringify({
						batchId: invalidBatch,
						sourceVideoPath: source,
						cuts: [5, 5],
					}),
				}),
			);
			assert.equal(response.status, 400);
			await assert.rejects(
				fs.access(getSplitDirectory({ batchId: invalidBatch })),
			);
		}
		{
			thumbnail = await getDownloadThumbnail({ id });
			assert.equal((await sharp(thumbnail).metadata()).format, "jpeg");
		}
		// The source has a ten-second GOP; cuts deliberately land between keyframes.
		{
			const result: SplitResult = await splitVideoOnServer({
				batchId,
				sourceVideoPath: source,
				cuts: [8.5, 4.25],
			});
			await retainSplitResult({ result });
			const retainedPart = path.join(getSplitResultDirectory({ batchId }), "part-2.mp4");
			await fs.unlink(retainedPart);
			await fs.writeFile(retainedPart, "interrupted-copy");
			await retainSplitResult({ result });
			assert.equal((await fs.stat(retainedPart)).size, result.parts[1].size, "partial retained copies are replaced before publishing the manifest");
			assert.deepEqual(
				result.parts.map(({ start, end }) => ({ start, end })),
				[
					{ start: 0, end: 4.25 },
					{ start: 4.25, end: 8.5 },
					{ start: 8.5, end: 12 },
				],
			);
			for (const part of result.parts) {
				assert.equal(part.hasAudio, true);
				assert.ok(Math.abs(part.duration - (part.end - part.start)) < 0.1);
				const file = path.join(
					getSplitDirectory({ batchId }),
					`part-${part.index}.mp4`,
				);
				const frame = path.join(
					getSplitDirectory({ batchId }),
					`frame-${part.index}.png`,
				);
				await FFmpegService.runCommand("ffmpeg", [
					"-y",
					"-i",
					file,
					"-frames:v",
					"1",
					frame,
				]);
				const pixel = await sharp(frame)
					.extract({ left: 40, top: 40, width: 1, height: 1 })
					.removeAlpha()
					.raw()
					.toBuffer();
				assert.equal([...pixel].indexOf(Math.max(...pixel)), part.index - 1);
				const { stdout } = await FFmpegService.runCommand("ffprobe", [
					"-v",
					"error",
					"-select_streams",
					"v:0",
					"-read_intervals",
					"%+#1",
					"-show_entries",
					"packet=pts_time",
					"-of",
					"csv=p=0",
					file,
				]);
				assert.ok(Math.abs(Number(stdout.trim())) < 0.05, stdout);
			}
		}
		{
			const response = await GET(
				new NextRequest(
					`http://localhost/api/source/split?batchId=${batchId}&part=2`,
				),
			);
			assert.equal(response.status, 200);
			const bytes = await response.arrayBuffer();
			assert.equal(
				bytes.byteLength,
				Number(response.headers.get("content-length")),
			);
			assert.ok(bytes.byteLength > 1000);
			await removeRetainedSplitResult({ batchId });
			assert.equal(
				(
					await DELETE(
						new NextRequest(
							`http://localhost/api/source/split?batchId=${batchId}`,
							{ method: "DELETE" },
						),
					)
				).status,
				200,
			);
			assert.equal(
				(
					await GET(
						new NextRequest(
							`http://localhost/api/source/split?batchId=${batchId}&part=2`,
						),
					)
				).status,
				404,
			);
			await fs.access(source);
		}
		{
			const cancelledBatch = randomUUID();
			const originalCommand = FFmpegService.runCommand;
			const runCommand = originalCommand.bind(FFmpegService);
			let markStarted = () => {};
			const started = new Promise<void>((resolve) => {
				markStarted = resolve;
			});
			FFmpegService.runCommand = (
				...args: Parameters<typeof FFmpegService.runCommand>
			) => {
				const pending = runCommand(...args);
				if (args[0] === "ffmpeg") markStarted();
				return pending;
			};
			try {
				const pending = splitVideoOnServer({
					batchId: cancelledBatch,
					sourceVideoPath: source,
					cuts: [4, 8],
				});
				const rejected = assert.rejects(pending);
				await started;
				await removeSplitBatch({ batchId: cancelledBatch });
				await rejected;
				await assert.rejects(
					fs.access(getSplitDirectory({ batchId: cancelledBatch })),
				);
			} finally {
				FFmpegService.runCommand = originalCommand;
			}
		}
		// Container duration includes a longer audio tail; picture duration is 12.012s at 29.97fps.
		await FFmpegService.runCommand("ffmpeg", [
			"-y",
			"-f",
			"lavfi",
			"-i",
			"color=blue:s=160x96:d=12:r=30000/1001",
			"-f",
			"lavfi",
			"-i",
			"sine=frequency=500:duration=13",
			"-c:v",
			"libx264",
			"-pix_fmt",
			"yuv420p",
			"-c:a",
			"aac",
			tailSource,
		]);
		const outside = await POST(
			new NextRequest("http://localhost/api/source/split", {
				method: "POST",
				body: JSON.stringify({
					batchId: randomUUID(),
					sourceVideoPath: tailSource,
					cuts: [12.5],
				}),
			}),
		);
		assert.equal(outside.status, 400);
		const exact = await splitVideoOnServer({
			batchId: tailBatch,
			sourceVideoPath: tailSource,
			cuts: [6.006],
		});
		assert.ok(Math.abs(exact.parts[1].end - 12.012) < 0.001);
		for (const part of exact.parts) {
			assert.ok(Math.abs(part.fps - 30000 / 1001) < 1e-7);
			assert.ok(Math.abs(part.duration - 6.006) < 0.05);
			assert.equal(part.hasAudio, true);
		}
	} finally {
		await removeSplitBatch({ batchId });
		await removeRetainedSplitResult({ batchId });
		await removeSplitBatch({ batchId: tailBatch });
		await fs.rm(source, { force: true });
		await fs.rm(tailSource, { force: true });
		if (thumbnail) await fs.rm(thumbnail, { force: true });
	}
});
