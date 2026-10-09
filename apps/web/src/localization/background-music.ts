import fs from "node:fs/promises";
import { FFmpegService } from "@/media/ffmpeg";
import { NarrationError } from "./narration";
import { loadDubbingTiming } from "./timing";

export async function prepareBackgroundMusic({
	inputPath,
	outputPath,
	duration,
	signal,
}: {
	inputPath: string;
	outputPath: string;
	duration: number;
	signal?: AbortSignal;
}) {
	const policy = await loadDubbingTiming();
	if (!policy.background_music_valid_duration(duration))
		throw new NarrationError("Đoạn video để thêm nhạc phải dài từ 0,1 giây đến 60 phút.");
	const { size } = await fs.stat(inputPath);
	if (!size || size > policy.background_music_max_bytes())
		throw new NarrationError("File nhạc trống hoặc vượt quá 64 MB.", 413);
	let probe;
	try {
		probe = await FFmpegService.probeVideo({ filePath: inputPath, signal });
	} catch (error) {
		if (signal?.aborted) throw error;
		throw new NarrationError("Không đọc được file nhạc. Thử file MP3, WAV, M4A hoặc OGG khác.");
	}
	if (!probe.hasAudio) throw new NarrationError("File được chọn không có âm thanh.");
	const fade = policy.background_music_fade_duration(duration);
	await FFmpegService.runCommand("ffmpeg", [
		"-y", "-stream_loop", "-1", "-i", inputPath,
		"-map", "0:a:0", "-vn", "-t", String(duration),
		"-af", `afade=t=in:st=0:d=${fade},afade=t=out:st=${duration - fade}:d=${fade}`,
		"-ar", "48000", "-ac", "2", "-c:a", "libmp3lame", "-b:a", "160k",
		"-threads", "2", outputPath,
	], { signal });
}
