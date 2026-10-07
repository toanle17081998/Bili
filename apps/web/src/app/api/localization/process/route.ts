import { NextRequest, NextResponse } from "next/server";
import { LocalizationPipeline } from "@/localization/pipeline";
import path from "path";
import type { LocalizedVideoProject } from "@/localization/schemas";
import { TranslationCooldownError } from "@/providers/llm/free-translate";
import { SpeechProviderError } from "@/providers/tts/types";

const activeJobs = new Map<string, Promise<LocalizedVideoProject>>();

export async function POST(request: NextRequest) {
	try {
		const { projectId, videoPath, voice, subtitles } = await request.json();
		if (typeof projectId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(projectId)) {
			return NextResponse.json({ success: false, error: "Mã dự án không hợp lệ." }, { status: 400 });
		}

		let targetVideoPath = videoPath;
		const downloadsDir = path.join(process.cwd(), ".local_storage", "downloads");
		const fsModule = await import("fs");
		if (!targetVideoPath || targetVideoPath === "default" || !fsModule.existsSync(targetVideoPath)) {
			if (fsModule.existsSync(path.join(downloadsDir, `${projectId}.full.mp4`))) {
				targetVideoPath = path.join(downloadsDir, `${projectId}.full.mp4`);
			} else if (fsModule.existsSync(path.join(downloadsDir, `${projectId}.mp4`))) {
				targetVideoPath = path.join(downloadsDir, `${projectId}.mp4`);
			}
		}

		const workDir = path.join(process.cwd(), ".local_storage", "projects");
		const pipeline = new LocalizationPipeline();

		const jobKey = JSON.stringify([projectId, targetVideoPath, voice, subtitles]);
		let job = activeJobs.get(jobKey);
		if (!job) {
			job = pipeline.run({
				projectId,
				videoPath: targetVideoPath,
				workDir,
				voice: voice || "vi-VN-HoaiMyNeural",
				customSubtitles: subtitles,
			}).finally(() => activeJobs.delete(jobKey));
			activeJobs.set(jobKey, job);
		}
		const result = await job;

		return NextResponse.json({
			success: true,
			localizedProject: result,
		});
	} catch (error: unknown) {
		console.error("Localization process API error:", error);
		if (error instanceof SpeechProviderError) {
			return NextResponse.json(
				{ success: false, error: error.message },
				{ status: error.status === 429 ? 429 : 503, headers: { "Retry-After": String(Math.ceil(error.retryAfterMs / 1000)) } },
			);
		}
		if (error instanceof TranslationCooldownError) {
			return NextResponse.json(
				{ success: false, error: error.message },
				{ status: error.status, headers: { "Retry-After": String(Math.ceil(error.retryAfterMs / 1000)) } },
			);
		}
		return NextResponse.json(
			{
				success: false,
					error: error instanceof Error ? error.message : "Failed to run Vietnamese localization pipeline",
			},
			{ status: 500 },
		);
	}
}
