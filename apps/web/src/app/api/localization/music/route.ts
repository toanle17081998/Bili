import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { prepareBackgroundMusic } from "@/localization/background-music";
import { NarrationError } from "@/localization/narration";
import { loadDubbingTiming, LocalizationWasmError } from "@/localization/timing";
import { readWatermarkUpload, UploadLimitError } from "@/media/watermark/upload";

export const runtime = "nodejs";
let activeJobs = 0;

export async function POST(request: NextRequest) {
	if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
		return NextResponse.json({ success: false, error: "Cần gửi file nhạc bằng multipart/form-data." }, { status: 415 });
	if (activeJobs >= 2)
		return NextResponse.json({ success: false, error: "Đang chuẩn bị nhạc khác. Vui lòng thử lại." }, { status: 429 });
	activeJobs++;
	let directory: string | undefined;
	const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10 * 60_000)]);
	try {
		const policy = await loadDubbingTiming();
		const maxBytes = policy.background_music_max_bytes();
		const limitMessage = "File nhạc vượt quá 64 MB.";
		if (Number(request.headers.get("content-length")) > maxBytes + 1024 * 1024)
			throw new UploadLimitError(limitMessage);
		const form = await readWatermarkUpload({ request, maxBytes: maxBytes + 1024 * 1024, signal, limitMessage });
		const music = form.get("music");
		const duration = Number(form.get("duration"));
		if (!(music instanceof File) || !music.size)
			throw new NarrationError("Vui lòng chọn một file nhạc.", 400);
		if (music.size > maxBytes) throw new UploadLimitError(limitMessage);
		if (!policy.background_music_valid_duration(duration))
			throw new NarrationError("Thời lượng video không hợp lệ (từ 0,1 giây đến 60 phút).", 400);
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "opencut-background-music-"));
		const inputPath = path.join(directory, "input.audio");
		const outputPath = path.join(directory, "music.mp3");
		await fs.writeFile(inputPath, Buffer.from(await music.arrayBuffer()));
		await prepareBackgroundMusic({ inputPath, outputPath, duration, signal });
		return new Response(new Uint8Array(await fs.readFile(outputPath)), {
			headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
		});
	} catch (error) {
		const known = error instanceof NarrationError || error instanceof UploadLimitError || error instanceof LocalizationWasmError;
		if (!known && !signal.aborted) console.error("Background music preparation failed:", error);
		return NextResponse.json({
			success: false,
			error: known ? error.message : signal.aborted ? "Quá trình chuẩn bị nhạc đã bị hủy hoặc hết thời gian." : "Không chuẩn bị được nhạc nền. Kiểm tra FFmpeg và thử lại.",
		}, { status: error instanceof NarrationError ? error.status : error instanceof UploadLimitError ? 413 : error instanceof LocalizationWasmError ? 503 : signal.aborted ? 408 : 500 });
	} finally {
		try {
			if (directory) await fs.rm(directory, { recursive: true, force: true });
		} finally {
			activeJobs--;
		}
	}
}
