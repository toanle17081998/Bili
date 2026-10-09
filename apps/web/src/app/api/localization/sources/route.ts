import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { FFmpegService } from "@/media/ffmpeg";
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
const MAX_BYTES = 256 * 1024 * 1024;
const inputSchema = z.object({
	projectId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
	start: z.coerce.number().nonnegative(),
	duration: z.coerce.number().positive(),
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
	if (Number(request.headers.get("content-length")) > MAX_BYTES + 1024 * 1024)
		return NextResponse.json(
			{ success: false, error: "Video vượt quá 256 MB." },
			{ status: 413 },
		);
	activeUploads++;
	let directory: string | undefined;
	let release = () => {};
	const signal = AbortSignal.any([
		request.signal,
		AbortSignal.timeout(10 * 60_000),
	]);
	try {
		const form = await readWatermarkUpload({
			request,
			maxBytes: MAX_BYTES + 1024 * 1024,
			signal,
		});
		const parsed = inputSchema.safeParse({
			projectId: form.get("projectId"),
			start: form.get("start"),
			duration: form.get("duration"),
		});
		const file = form.get("video");
		if (
			!parsed.success ||
			!(file instanceof File) ||
			!file.size ||
			file.size > MAX_BYTES
		)
			throw new NarrationError(
				"Video hoặc khoảng thời gian không hợp lệ.",
				400,
			);
		const { projectId, start, duration } = parsed.data;
		const policy = await loadDubbingTiming();
		if (!policy.narration_frame_count(duration))
			throw new NarrationError("Mỗi video thuyết minh tối đa 10 phút.");
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
				"-an",
				"-vf",
				`scale=${policy.narration_proxy_size()}:${policy.narration_proxy_size()}:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=${policy.narration_proxy_fps()}`,
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
			JSON.stringify({ duration }),
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
