import { NextRequest, NextResponse } from "next/server";
import { FFmpegService } from "@/media/ffmpeg";
import path from "path";
import fs from "fs/promises";

export async function POST(request: NextRequest) {
	try {
		const {
			projectId,
			videoPath,
			subtitles,
			originalAudioVolume,
			voiceoverVolume,
		} = await request.json();

		let targetVideoPath = videoPath;
		if (!targetVideoPath || targetVideoPath === "default") {
			targetVideoPath = path.join(process.cwd(), ".local_storage", "downloads", `${projectId}.mp4`);
		}

		const exportDir = path.join(process.cwd(), ".local_storage", "exports");
		await fs.mkdir(exportDir, { recursive: true });
		const outputPath = path.join(exportDir, `${projectId || "export"}_vertical.mp4`);

		// Generate SRT file if subtitles exist
		let subtitlesPath: string | undefined;
		if (subtitles && Array.isArray(subtitles) && subtitles.length > 0) {
			subtitlesPath = path.join(exportDir, `${projectId || "export"}.srt`);
			const srtContent = subtitles
				.map((sub: any, idx: number) => {
					const formatSrtTime = (sec: number) => {
						const date = new Date(sec * 1000);
						const hh = String(Math.floor(sec / 3600)).padStart(2, "0");
						const mm = String(date.getUTCMinutes()).padStart(2, "0");
						const ss = String(date.getUTCSeconds()).padStart(2, "0");
						const ms = String(date.getUTCMilliseconds()).padStart(3, "0");
						return `${hh}:${mm}:${ss},${ms}`;
					};
					return `${idx + 1}\n${formatSrtTime(sub.start)} --> ${formatSrtTime(sub.end)}\n${sub.text}\n`;
				})
				.join("\n");
			await fs.writeFile(subtitlesPath, srtContent, "utf8");
		}

		await FFmpegService.exportVerticalVideo({
			videoPath: targetVideoPath,
			subtitlesPath,
			outputPath,
			originalAudioVolume: originalAudioVolume ?? 0.2,
			voiceoverVolume: voiceoverVolume ?? 1.0,
			targetWidth: 1080,
			targetHeight: 1920,
			fps: 30,
		});

		return NextResponse.json({
			success: true,
			downloadUrl: `/api/media/stream?file=${encodeURIComponent(outputPath)}`,
			outputPath,
		});
	} catch (error: any) {
		console.error("Export API error:", error);
		return NextResponse.json(
			{ success: false, error: error.message || "Failed to export video" },
			{ status: 500 },
		);
	}
}
