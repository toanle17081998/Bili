import fs from "node:fs/promises";
import path from "node:path";
import { FFmpegService } from "@/media/ffmpeg";
import { storyEngine } from "./engine";
import { readAtomicJSON, writeAtomicJSON } from "./atomic-json";

/** Cache decoded frame timestamps beside the analysis media, outside AI context. */
export async function readStoryFrameIndex({
	videoPath,
	signal,
}: {
	videoPath: string;
	signal: AbortSignal;
}): Promise<number[]> {
	signal.throwIfAborted();
	const stat = await fs.stat(videoPath);
	const stamp = `${stat.size}:${stat.mtimeMs}`;
	const cachePath = path.join(path.dirname(videoPath), "frame-index.json");
	try {
		const cached = await readAtomicJSON<{
			version: number;
			stamp: string;
			frames: number[];
		}>({ filePath: cachePath });
		if (cached?.version === 1 && cached.stamp === stamp)
			return await storyEngine<number[]>({
				operation: "frame_index",
				frames: cached.frames,
			});
	} catch {
		signal.throwIfAborted(); /* Missing or invalid indexes are regenerated from the media. */
	}
	const { stdout } = await FFmpegService.runCommand(
		"ffprobe",
		[
			"-v",
			"error",
			"-select_streams",
			"v:0",
			"-show_frames",
			"-show_entries",
			"frame=best_effort_timestamp_time",
			"-of",
			"json",
			videoPath,
		],
		{ signal },
	);
	const frames = await storyEngine<number[]>({
		operation: "frame_index",
		frames: JSON.parse(stdout).frames,
	});
	signal.throwIfAborted();
	await writeAtomicJSON({
		filePath: cachePath,
		value: { version: 1, stamp, frames },
	});
	return frames;
}
