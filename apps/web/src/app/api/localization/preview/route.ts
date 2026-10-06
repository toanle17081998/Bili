import { NextRequest, NextResponse } from "next/server";
import { LocalizationPipeline } from "@/localization/pipeline";
import path from "path";
import fs from "fs";

export async function POST(request: NextRequest) {
	try {
		const { projectId, videoPath } = await request.json();

		let targetVideoPath = videoPath;
		const downloadsDir = path.join(process.cwd(), ".local_storage", "downloads");

		if (
			!targetVideoPath ||
			targetVideoPath === "default" ||
			!fs.existsSync(targetVideoPath)
		) {
			if (fs.existsSync(path.join(downloadsDir, `${projectId}.mp4`))) {
				targetVideoPath = path.join(downloadsDir, `${projectId}.mp4`);
			} else if (
				fs.existsSync(path.join(downloadsDir, `${projectId}.full.mp4`))
			) {
				targetVideoPath = path.join(downloadsDir, `${projectId}.full.mp4`);
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
	} catch (error: any) {
		console.error("Localization preview API error:", error);
		return NextResponse.json(
			{
				success: false,
				error:
					error.message ||
					"Lỗi khi trích xuất và tạo kịch bản phụ đề xem trước",
			},
			{ status: 500 },
		);
	}
}
