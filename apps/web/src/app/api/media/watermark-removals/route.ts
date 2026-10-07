import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { removeVideoWatermarks } from "@/media/watermark/processing";
import { WatermarkValidationError } from "@/media/watermark/core";
import {
	readWatermarkUpload,
	UploadLimitError,
} from "@/media/watermark/upload";
import {
	expireTemporaryJobs,
	removeTemporaryJob,
	scheduleTemporaryJobExpiry,
} from "@/media/watermark/temporary-files";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 256 * 1024 * 1024;
const regionSchema = z.object({
	x: z.number(),
	y: z.number(),
	width: z.number(),
	height: z.number(),
	start: z.number(),
	end: z.number(),
});
let activeJobs = 0;

export async function POST(request: NextRequest) {
	if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) {
		return NextResponse.json(
			{ success: false, error: "Cần gửi video bằng multipart/form-data." },
			{ status: 415 },
		);
	}
	if (activeJobs >= 2)
		return NextResponse.json(
			{ success: false, error: "Đang xử lý video khác. Vui lòng thử lại." },
			{ status: 429, headers: { "Retry-After": "15" } },
		);
	if (
		Number(request.headers.get("content-length")) >
		MAX_FILE_BYTES + 1024 * 1024
	) {
		return NextResponse.json(
			{ success: false, error: "Video vượt quá 256 MB." },
			{ status: 413 },
		);
	}
	activeJobs++;
	let directory: string | undefined;
	const root = path.resolve(
		process.cwd(),
		".local_storage",
		"watermark-removals",
	);
	const signal = AbortSignal.any([
		request.signal,
		AbortSignal.timeout(15 * 60_000),
	]);
	try {
		const form = await readWatermarkUpload({
			request,
			maxBytes: MAX_FILE_BYTES + 1024 * 1024,
			signal,
		});
		const file = form.get("video");
		if (!(file instanceof File) || !file.size || file.size > MAX_FILE_BYTES) {
			return NextResponse.json(
				{
					success: false,
					error: "Chọn video có dung lượng từ 1 byte đến 256 MB.",
				},
				{ status: 400 },
			);
		}
		const raw = form.get("regions");
		let decoded: unknown;
		try {
			decoded = typeof raw === "string" ? JSON.parse(raw) : null;
		} catch {
			decoded = null;
		}
		const parsed = z.array(regionSchema).safeParse(decoded);
		if (!parsed.success) {
			return NextResponse.json(
				{ success: false, error: "Dữ liệu vùng logo không hợp lệ." },
				{ status: 422 },
			);
		}
		await fs.mkdir(root, { recursive: true });
		await expireTemporaryJobs({ root });
		directory = await fs.mkdtemp(path.join(root, "job-"));
		const inputPath = path.join(directory, "source.video");
		const outputPath = path.join(directory, "clean.mp4");
		await fs.writeFile(inputPath, Buffer.from(await file.arrayBuffer()));
		await removeVideoWatermarks({
			inputPath,
			outputPath,
			regions: parsed.data,
			signal,
		});
		await fs.unlink(inputPath);
		scheduleTemporaryJobExpiry({ root, directory });
		return NextResponse.json(
			{
				success: true,
				streamUrl: `/api/media/stream?file=${encodeURIComponent(outputPath)}`,
			},
			{ status: 201 },
		);
	} catch (error: unknown) {
		if (directory) {
			await removeTemporaryJob({ root, directory }).catch(
				(cleanupError: unknown) =>
					console.error("Cannot remove watermark job:", cleanupError),
			);
		}
		console.error("Watermark removal error:", error);
		return NextResponse.json(
			{
				success: false,
				error:
					error instanceof WatermarkValidationError ||
					error instanceof UploadLimitError
						? error.message
						: signal.aborted
							? "Đã dừng xử lý video."
							: "Không xử lý được video. Kiểm tra FFmpeg và thử lại.",
			},
			{
				status:
					error instanceof UploadLimitError
						? 413
						: error instanceof WatermarkValidationError
							? 422
							: signal.aborted
								? 408
								: 500,
			},
		);
	} finally {
		activeJobs--;
	}
}
