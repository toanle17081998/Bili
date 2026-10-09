import { NextRequest, NextResponse } from "next/server";
import { LocalizationPipeline } from "@/localization/pipeline";
import path from "path";
import fs from "fs";
import { TranslationCooldownError } from "@/providers/llm/free-translate";
import { z } from "zod";
import { generateNarrationPreview, NarrationError } from "@/localization/narration";
import { resolveNarrationSource, retainNarrationSource, readNarrationDuration } from "@/localization/source";
import { readLocalizationRequest } from "@/localization/http";

const requestSchema = z.object({
	projectId: z.string().regex(/^[a-zA-Z0-9_-]+$/), videoPath: z.string().optional(),
	mode: z.enum(["dubbing", "narration"]).default("dubbing"), notes: z.string().max(1000).optional(),
});
const narrationJobs = new Map<string, ReturnType<typeof generateNarrationPreview>>();

export async function POST(request: NextRequest) {
	try {
		const parsed = requestSchema.safeParse(await readLocalizationRequest(request));
		if (!parsed.success) return NextResponse.json({ success: false, error: "Yêu cầu phân tích video không hợp lệ." }, { status: 400 });
		const { projectId, videoPath, mode, notes } = parsed.data;
		if (mode === "narration") {
			const source = await resolveNarrationSource(projectId, videoPath || "");
			const key = JSON.stringify([projectId, source, notes]);
			let job = narrationJobs.get(key);
			if (!job) {
				if (narrationJobs.size >= 2) return NextResponse.json({ success: false, error: "AI đang phân tích video khác. Vui lòng thử lại." }, { status: 429 });
				const release = retainNarrationSource(source);
				job = readNarrationDuration(source).then((duration) => generateNarrationPreview({ videoPath: source, workDir: path.dirname(source), notes, duration, signal: request.signal })).finally(() => { narrationJobs.delete(key); release(); });
				narrationJobs.set(key, job);
			}
			return NextResponse.json({ success: true, mode, ...await job });
		}

		let targetVideoPath = videoPath;
		const downloadsDir = path.join(process.cwd(), ".local_storage", "downloads");

		if (
			!targetVideoPath ||
			targetVideoPath === "default" ||
			!fs.existsSync(targetVideoPath)
		) {
			if (fs.existsSync(path.join(downloadsDir, `${projectId}.full.mp4`))) {
				targetVideoPath = path.join(downloadsDir, `${projectId}.full.mp4`);
			} else if (
				fs.existsSync(path.join(downloadsDir, `${projectId}.mp4`))
			) {
				targetVideoPath = path.join(downloadsDir, `${projectId}.mp4`);
			}
		}

		if (!targetVideoPath || !fs.existsSync(targetVideoPath)) {
			return NextResponse.json(
				{
					success: false,
					error: `Không tìm thấy file video cho dự án ${projectId}`,
				},
				{ status: 404 },
			);
		}

		const workDir = path.join(process.cwd(), ".local_storage", "projects");
		const pipeline = new LocalizationPipeline();

		const preview = await pipeline.generatePreview({
			projectId,
			videoPath: targetVideoPath,
			workDir,
		});

		return NextResponse.json({
			success: true,
			subtitles: preview.subtitles,
			transcript: preview.transcript,
			translations: preview.translations,
		});
	} catch (error: unknown) {
		if (error instanceof NarrationError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
		console.error("Localization preview API error:", error);
		if (error instanceof TranslationCooldownError) {
			return NextResponse.json(
				{ success: false, error: error.message },
				{ status: error.status, headers: { "Retry-After": String(Math.ceil(error.retryAfterMs / 1000)) } },
			);
		}
		return NextResponse.json(
			{
				success: false,
				error: error instanceof Error
					? error.message
					: "Lỗi khi trích xuất và tạo kịch bản phụ đề xem trước",
			},
			{ status: 500 },
		);
	}
}
