import path from "node:path";
import fs from "node:fs/promises";
import { FFmpegService } from "@/media/ffmpeg";
import { runPython } from "@/media/python";

export interface TTSRequest {
	text: string;
	voice?: string;
	speed?: number;
	outputPath: string;
}
export interface TTSResult { audioPath: string; duration: number; }
export interface TTSProvider {
	readonly name: string;
	generateSpeech(request: TTSRequest): Promise<TTSResult>;
}

export class EdgeTTSProvider implements TTSProvider {
	readonly name = "edge-tts";
	async generateSpeech({ text, voice = "vi-VN-HoaiMyNeural", speed = 1, outputPath }: TTSRequest): Promise<TTSResult> {
		await fs.mkdir(path.dirname(outputPath), { recursive: true });
		const percent = Math.round((speed - 1) * 100);
		const rate = `${percent >= 0 ? "+" : ""}${percent}%`;
		await runPython(`
import asyncio, sys, edge_tts
async def main():
    await edge_tts.Communicate(text=sys.argv[1], voice=sys.argv[2], rate=sys.argv[3]).save(sys.argv[4])
asyncio.run(main())
`, [text, voice, rate, outputPath], 90_000);
		const probe = await FFmpegService.probeVideo(outputPath);
		return { audioPath: outputPath, duration: probe.duration };
	}
}
