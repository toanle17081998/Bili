import { NextRequest, NextResponse } from "next/server";
import { LocalizationPipeline } from "@/localization/pipeline";
import path from "path";
import type { LocalizedVideoProject } from "@/localization/schemas";
import { TranslationCooldownError } from "@/providers/llm/free-translate";
import { SpeechProviderError } from "@/providers/tts/types";
import { z } from "zod";
import { SubtitleSegmentSchema } from "@/localization/schemas";
import { NarrationError } from "@/localization/narration";
import { resolveNarrationSource, retainNarrationSource, readNarrationDuration } from "@/localization/source";
import { readLocalizationRequest } from "@/localization/http";

const requestSchema = z.object({
	projectId: z.string().regex(/^[a-zA-Z0-9_-]+$/), videoPath: z.string().optional(), voice: z.string().max(200).optional(),
	subtitles: z.array(SubtitleSegmentSchema).max(1000).optional(), force: z.boolean().optional(),
	mode: z.enum(["dubbing", "narration"]).default("dubbing"), timelineStart: z.number().nonnegative().default(0),
	sourceSignature: z.string().max(2000).optional(),
	sourceElementId: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(128).optional(),
});

const activeJobs = new Map<string, Promise<LocalizedVideoProject>>();

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const projectId = searchParams.get("projectId");
		const mode = searchParams.get("mode") || "dubbing";
		if (mode !== "dubbing" && mode !== "narration") return NextResponse.json({ success: false, error: "Chế độ không hợp lệ." }, { status: 400 });
		if (!projectId || !/^[a-zA-Z0-9_-]+$/.test(projectId)) {
			return NextResponse.json({ success: false, error: "Mã dự án không hợp lệ." }, { status: 400 });
		}
		const workDir = path.join(process.cwd(), ".local_storage", "projects");
		let latestFile = path.join(workDir, projectId, `latest-${mode}.json`);
		const fsModule = await import("fs");
		if (!fsModule.existsSync(latestFile) && mode === "dubbing") latestFile = path.join(workDir, projectId, "latest-project.json");
		if (!fsModule.existsSync(latestFile)) {
			return NextResponse.json({ success: false, notFound: true }, { status: 404 });
		}
		const content = fsModule.readFileSync(latestFile, "utf-8");
		const cached = JSON.parse(content);
		if ((cached.mode || "dubbing") !== mode) return NextResponse.json({ success: false, notFound: true }, { status: 404 });
		return NextResponse.json({ success: true, localizedProject: cached });
	} catch (error: unknown) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : "Failed to load cached project" },
			{ status: 500 },
		);
	}
}

export async function POST(request: NextRequest) {
	try {
		const parsed = requestSchema.safeParse(await readLocalizationRequest(request));
		if (!parsed.success) return NextResponse.json({ success: false, error: "Yêu cầu tạo giọng không hợp lệ." }, { status: 400 });
		const { projectId, videoPath, voice, subtitles, force, mode, timelineStart, sourceSignature, sourceElementId } = parsed.data;
		if (typeof projectId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(projectId)) {
			return NextResponse.json({ success: false, error: "Mã dự án không hợp lệ." }, { status: 400 });
		}

		let targetVideoPath = videoPath || "";
		if (mode === "narration") {
			targetVideoPath = await resolveNarrationSource(projectId, videoPath || "");
			if (!subtitles?.length) throw new NarrationError("Tạo và duyệt kịch bản thuyết minh trước khi tạo giọng.");
		}
		const downloadsDir = path.join(process.cwd(), ".local_storage", "downloads");
		const fsModule = await import("fs");
		if (!targetVideoPath || targetVideoPath === "default" || !fsModule.existsSync(targetVideoPath)) {
			if (fsModule.existsSync(path.join(downloadsDir, `${projectId}.full.mp4`))) {
				targetVideoPath = path.join(downloadsDir, `${projectId}.full.mp4`);
			} else if (fsModule.existsSync(path.join(downloadsDir, `${projectId}.mp4`))) {
				targetVideoPath = path.join(downloadsDir, `${projectId}.mp4`);
			}
		}
		if (!targetVideoPath || !fsModule.existsSync(targetVideoPath)) return NextResponse.json({ success: false, error: "Không tìm thấy video cho dự án." }, { status: 404 });

		const workDir = path.join(process.cwd(), ".local_storage", "projects");
		const latestFile = path.join(workDir, projectId, `latest-${mode}.json`);

		// If no custom subtitles and not forced, return cached result if audio files exist
		if (!subtitles && !force && fsModule.existsSync(latestFile)) {
			try {
				const cached = JSON.parse(fsModule.readFileSync(latestFile, "utf-8"));
				if ((cached.mode || "dubbing") !== mode || cached.voice !== (voice || "vi-VN-HoaiMyNeural") || cached.source?.path !== targetVideoPath) throw new Error("Cached settings changed");
				const bgParam = cached.backgroundAudioUrl ? new URL(cached.backgroundAudioUrl, "http://localhost").searchParams.get("file") : null;
				const voiceParam = cached.voiceovers?.[0]?.audioUrl ? new URL(cached.voiceovers[0].audioUrl, "http://localhost").searchParams.get("file") : null;
				if ((!bgParam || fsModule.existsSync(bgParam)) && (!voiceParam || fsModule.existsSync(voiceParam))) {
					return NextResponse.json({
						success: true,
						localizedProject: cached,
						cached: true,
					});
				}
			} catch (err) {
				console.warn("Failed reading latest-project.json, continuing fresh run:", err);
			}
		}

		const pipeline = new LocalizationPipeline();

		const jobKey = JSON.stringify([projectId, targetVideoPath, voice, subtitles, mode, timelineStart, sourceSignature, sourceElementId]);
		let job = activeJobs.get(jobKey);
		if (!job) {
			if (mode === "narration" && activeJobs.size >= 2) return NextResponse.json({ success: false, error: "Đang tạo giọng cho video khác. Vui lòng thử lại." }, { status: 429 });
			const release = mode === "narration" ? retainNarrationSource(targetVideoPath) : () => {};
			job = (mode === "narration" ? readNarrationDuration(targetVideoPath) : Promise.resolve(undefined)).then((sourceDuration) => pipeline.run({
				sourceDuration,
				mode,
				timelineStart,
				sourceSignature,
				sourceElementId,
				projectId,
				videoPath: targetVideoPath,
				workDir,
				voice: voice || "vi-VN-HoaiMyNeural",
				customSubtitles: subtitles,
			})).finally(() => { activeJobs.delete(jobKey); release(); });
			activeJobs.set(jobKey, job);
		}
		const result = await job;

		return NextResponse.json({
			success: true,
			localizedProject: result,
		});
	} catch (error: unknown) {
		if (error instanceof NarrationError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
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
