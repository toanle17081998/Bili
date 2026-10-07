import { FFmpegService } from "@/media/ffmpeg";
import { planWatermarkFilters } from "./core";
import type { WatermarkRegion } from "./types";

export async function removeVideoWatermarks({
	inputPath,
	outputPath,
	regions,
	signal,
}: {
	inputPath: string;
	outputPath: string;
	regions: WatermarkRegion[];
	signal?: AbortSignal;
}) {
	const video = await FFmpegService.probeVideo({ filePath: inputPath, signal });
	const filters = await planWatermarkFilters({ video, regions });
	const copyAudio = video.audioCodecs?.every((codec) => codec === "aac");
	await FFmpegService.runCommand(
		"ffmpeg",
		[
			"-hide_banner",
			"-loglevel",
			"error",
			"-nostdin",
			"-y",
			"-i",
			inputPath,
			"-vf",
			[...filters, "pad=ceil(iw/2)*2:ceil(ih/2)*2", "format=yuv420p"].join(","),
			"-map",
			"0:v:0",
			"-map",
			"0:a?",
			"-map_metadata",
			"0",
			"-c:v",
			"libx264",
			"-preset",
			"fast",
			"-crf",
			"18",
			"-c:a",
			...(copyAudio ? ["copy"] : ["aac", "-b:a", "192k"]),
			"-movflags",
			"+faststart",
			outputPath,
		],
		{ signal },
	);
	return video;
}
