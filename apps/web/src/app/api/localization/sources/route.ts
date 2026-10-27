import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { FFmpegService } from "@/media/ffmpeg";
import { getVideoUploadMaxBytes } from "@/media/watermark/core";
import {
	readWatermarkUpload,
	UploadLimitError,
} from "@/media/watermark/upload";
import { loadDubbingTiming, LocalizationWasmError } from "@/localization/timing";
import { NarrationError } from "@/localization/narration";
import {
	cleanupNarrationSources,
	scheduleNarrationSourceCleanup,
	retainNarrationSource,
} from "@/localization/source";

export const runtime = "nodejs";
const inputSchema = z.object({
	projectId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
	start: z.coerce.number().nonnegative(),
	duration: z.coerce.number().positive(),
	purpose: z.enum(["narration", "story"]).default("narration"),
});
let activeUploads = 0;

export async function POST(request: NextRequest) {
	if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
		return NextResponse.json(
			{ success: false, error: "Cần gửi video bằng multipart/form-data." },
			{ status: 415 },
		);
	if (activeUploads >= 2)
		return NextResponse.json(
			{ success: false, error: "Đang chuẩn bị video khác. Vui lòng thử lại." },
			{ status: 429 },
		);
	activeUploads++;
	let directory: string | undefined;
	let release = () => {};
	const signal = AbortSignal.any([
		request.signal,
		AbortSignal.timeout(10 * 60_000),
	]);
	try {
		const maxBytes = await getVideoUploadMaxBytes();
		if (Number(request.headers.get("content-length")) > maxBytes + 1024 * 1024)
			throw new UploadLimitError("Video vượt quá 1 GB.");
		const form = await readWatermarkUpload({
			request,
			maxBytes: maxBytes + 1024 * 1024,
			signal,
		});
		const parsed = inputSchema.safeParse({
			projectId: form.get("projectId"),
			start: form.get("start"),
			duration: form.get("duration"),
			purpose: form.get("purpose") || undefined,
		});
		const file = form.get("video");
		if (file instanceof File && file.size > maxBytes)
			throw new UploadLimitError("Video vượt quá 1 GB.");
		if (
			!parsed.success ||
			!(file instanceof File) ||
			!file.size
		)
			throw new NarrationError(
				"Video hoặc khoảng thời gian không hợp lệ.",
				400,
			);
		const { projectId, start, duration, purpose } = parsed.data;
		const policy = await loadDubbingTiming();
		if (!policy.narration_frame_count(duration))
			throw new NarrationError(
				"Mỗi video thuyết minh tối đa " + policy.narration_max_duration() / 60 + " phút.",
			);
		const root = path.resolve(
			process.cwd(),
			".local_storage",
			"projects",
			projectId,
			"narration-sources",
		);
		await fs.mkdir(root, { recursive: true });
		await cleanupNarrationSources(root, { reserveSlot: true });
		directory = await fs.mkdtemp(path.join(root, "source-"));
		const input = path.join(directory, "upload.video");
		const output = path.join(directory, "video.mp4");
		release = retainNarrationSource(output);
		await fs.writeFile(input, Buffer.from(await file.arrayBuffer()));
		const probe = await FFmpegService.probeVideo({ filePath: input, signal });
		if (!policy.narration_valid_source(probe.width, probe.height, probe.fps))
			throw new NarrationError(
				"Độ phân giải hoặc tốc độ khung hình video quá lớn để phân tích.",
			);
		if (start + duration > probe.duration + 0.1)
			throw new NarrationError("Khoảng thời gian nằm ngoài video gốc.");
		// Story analysis and export need the selected clip's original sound and motion.
		// Keep the existing lightweight, silent narration workflow as its default.
		const originalPath = path.join(directory, "original.mp4");
		if (purpose === "story") {
			await FFmpegService.runCommand("ffmpeg", ["-y", "-ss", String(start), "-i", input,
				"-t", String(duration), "-map", "0:v:0", "-map", "0:a:0?", "-c:v", "libx264",
				"-preset", "veryfast", "-crf", "18", "-c:a", "aac", "-b:a", "192k", originalPath], { signal });
		}
		await FFmpegService.runCommand(
			"ffmpeg",
			[
				"-y",
				"-ss",
				String(start),
				"-i",
				input,
				"-t",
				String(duration),
				"-map",
				"0:v:0",
				...(purpose === "story" ? ["-map", "0:a:0?", "-c:a", "aac", "-b:a", "96k"] : ["-an"]),
				"-vf",
				`scale=${policy.narration_proxy_size()}:${policy.narration_proxy_size()}:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=${purpose === "story" ? 8 : policy.narration_proxy_fps()}`,
				"-threads",
				"2",
				"-filter_threads",
				"1",
				"-fs",
				String(policy.narration_proxy_max_bytes()),
				"-c:v",
				"libx264",
				"-preset",
				"fast",
				"-crf",
				"28",
				output,
			],
			{ signal },
		);
		if (
			(await fs.stat(output)).size >=
			policy.narration_proxy_max_bytes() - 65536
		)
			throw new NarrationError("Video phân tích vượt quá giới hạn dung lượng.");
		await fs.unlink(input);
		await fs.writeFile(
			path.join(directory, "source.json"),
			JSON.stringify({ duration, ...(purpose === "story" ? { originalPath } : {}) }),
		);
		await scheduleNarrationSourceCleanup(root);
		return NextResponse.json(
			{ success: true, videoPath: output },
			{ status: 201 },
		);
	} catch (error: unknown) {
		if (!(error instanceof NarrationError || error instanceof UploadLimitError))
			console.error("Narration source preparation failed:", error);
		if (directory) await fs.rm(directory, { recursive: true, force: true });
		return NextResponse.json(
			{
				success: false,
				error:
					error instanceof NarrationError || error instanceof UploadLimitError || error instanceof LocalizationWasmError
						? error.message
						: "Không chuẩn bị được video. Kiểm tra FFmpeg và thử lại.",
			},
			{
				status:
					error instanceof NarrationError
						? error.status
						: error instanceof LocalizationWasmError
							? 503
						: error instanceof UploadLimitError
							? 413
							: signal.aborted
								? 408
								: 500,
			},
		);
	} finally {
		release();
		activeUploads--;
	}
}
