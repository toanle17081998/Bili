import fs from "node:fs/promises";
import path from "node:path";
import { FFmpegService } from "@/media/ffmpeg";
import { storyEngine } from "./engine";
import type { StoryMedia } from "./provider";
import type { StoryProject } from "./types";
import { readStoryFrameIndex } from "./frame-index";

interface StoryWindowMedia {
	media: StoryMedia[];
	window: StoryProject["windows"][number];
	uncertainty?: string;
}

export async function inspectStoryVideo({
	videoPath,
	duration,
	signal,
}: {
	videoPath: string;
	duration?: number;
	signal: AbortSignal;
}) {
	const metadata = await FFmpegService.probeVideo({
		filePath: videoPath,
		signal,
		frameRatePrecision: "exact",
	});
	if (!metadata.hasVideo) throw new Error("Nguồn không có luồng video.");
	const { stderr } = await FFmpegService.runCommand(
		"ffmpeg",
		[
			"-hide_banner",
			"-i",
			videoPath,
			"-an",
			"-vf",
			"select=gt(scene\\,0.3),showinfo",
			"-fps_mode",
			"vfr",
			"-f",
			"null",
			"-",
		],
		{ signal },
	);
	const plan = await storyEngine<Pick<StoryProject, "scenes" | "windows">>({
		operation: "plan",
		duration: duration ?? metadata.duration,
		fps: metadata.fps,
		scene_log: stderr,
	});
	return { metadata, ...plan };
}

export async function readStoryWindow({
	project,
	window,
	directory,
	supportsVideoAudio,
	signal,
}: {
	project: StoryProject;
	window: StoryProject["windows"][number];
	directory: string;
	supportsVideoAudio: boolean;
	signal: AbortSignal;
}): Promise<StoryWindowMedia> {
	const plan = await storyEngine<{
		window: StoryProject["windows"][number];
		samples: { time: number; seek_time: number }[];
		uncertainty?: string;
	}>({
		operation: "window_frames",
		duration: project.duration,
		window,
		frames: await readStoryFrameIndex({
			videoPath: project.video_path,
			signal,
		}),
	});
	if (plan.uncertainty)
		return { media: [], window: plan.window, uncertainty: plan.uncertainty };
	if (supportsVideoAudio) {
		const clip = path.join(directory, "clip.mp4");
		await FFmpegService.runCommand(
			"ffmpeg",
			[
				"-y",
				"-ss",
				String(window.start),
				"-i",
				project.video_path,
				"-t",
				String(window.end - window.start),
				"-map",
				"0:v:0",
				"-map",
				"0:a:0?",
				"-vf",
				"fps=4,scale=512:512:force_original_aspect_ratio=decrease:force_divisible_by=2",
				"-c:v",
				"libx264",
				"-preset",
				"ultrafast",
				"-crf",
				"28",
				"-c:a",
				"aac",
				"-b:a",
				"64k",
				clip,
			],
			{ signal },
		);
		return {
			window: plan.window,
			media: [
				{
					mimeType: "video/mp4",
					data: (await fs.readFile(clip)).toString("base64"),
				},
			],
		};
	}
	const frames: StoryMedia[] = [];
	for (const [index, { time, seek_time }] of plan.samples.entries()) {
		const image = path.join(directory, `${index}.jpg`);
		await FFmpegService.runCommand(
			"ffmpeg",
			[
				"-y",
				"-ss",
				String(seek_time),
				"-i",
				project.video_path,
				"-map",
				"0:v:0",
				"-an",
				"-frames:v",
				"1",
				"-vf",
				"scale=512:512:force_original_aspect_ratio=decrease:out_range=full,format=yuvj420p",
				"-q:v",
				"4",
				image,
			],
			{ signal },
		);
		frames.push({
			time,
			mimeType: "image/jpeg",
			data: (await fs.readFile(image)).toString("base64"),
		});
	}
	return { window: plan.window, media: frames };
}

export async function renderStoryVideo({
	project,
	output,
	signal,
}: {
	project: StoryProject;
	output: string;
	signal: AbortSignal;
}) {
	const plan = await storyEngine<{
		filter_complex: string;
		crf: number;
		preset: string;
		duration: number;
	}>({ ...project, operation: "render_plan" });
	await FFmpegService.runCommand(
		"ffmpeg",
		[
			"-y",
			"-i",
			project.original_path,
			...project.segments.flatMap((segment) => ["-i", segment.audio!.path]),
			"-filter_complex",
			plan.filter_complex,
			"-map",
			"0:v:0",
			"-map",
			"[mixed]",
			"-t",
			String(plan.duration),
			"-c:v",
			"libx264",
			"-pix_fmt",
			"yuv420p",
			"-crf",
			String(plan.crf),
			"-preset",
			plan.preset,
			"-c:a",
			"aac",
			"-b:a",
			"192k",
			"-movflags",
			"+faststart",
			output,
		],
		{ signal },
	);
	return FFmpegService.probeVideo({ filePath: output, signal });
}
