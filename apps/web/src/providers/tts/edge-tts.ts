import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import { FFmpegService } from "@/media/ffmpeg";

export interface TTSRequest {
	text: string;
	voice?: string; // Default: 'vi-VN-HoaiMyNeural' (female) or 'vi-VN-NamMinhNeural' (male)
	speed?: number; // e.g. 1.0
	outputPath: string;
}

export interface TTSResult {
	audioPath: string;
	duration: number;
}

export interface TTSProvider {
	readonly name: string;
	generateSpeech(request: TTSRequest): Promise<TTSResult>;
}

export class EdgeTTSProvider implements TTSProvider {
	readonly name = "edge-tts";

	async generateSpeech({
		text,
		voice = "vi-VN-HoaiMyNeural",
		speed = 1.0,
		outputPath,
	}: TTSRequest): Promise<TTSResult> {
		await fs.mkdir(path.dirname(outputPath), { recursive: true });

		// Calculate rate percentage string: e.g. speed 1.1 -> "+10%"
		let rateStr = "+0%";
		if (speed !== 1.0) {
			const diff = Math.round((speed - 1.0) * 100);
			rateStr = diff >= 0 ? `+${diff}%` : `${diff}%`;
		}

		const pyCode = `
import asyncio
import edge_tts

async def main():
    communicate = edge_tts.Communicate(
        text="""${text.replace(/"/g, '\\"')}""",
        voice="${voice}",
        rate="${rateStr}"
    )
    await communicate.save("""${outputPath.replace(/\\/g, "/")}""")

asyncio.run(main())
`;

		let generated = false;
		try {
			await new Promise<void>((resolve, reject) => {
				const pythonBin =
					process.env.PYTHON_BIN ||
					"C:\\Users\\toanlv31\\AppData\\Local\\Python\\bin\\python.exe";
				const proc = spawn(pythonBin, ["-c", pyCode]);
				let stderr = "";
				const timer = setTimeout(() => {
					proc.kill();
					reject(new Error("TTS timeout"));
				}, 6000);

				proc.stderr.on("data", (d) => (stderr += d.toString()));
				proc.on("close", (code) => {
					clearTimeout(timer);
					if (code === 0) resolve();
					else reject(new Error(`edge-tts failed: ${stderr}`));
				});
				proc.on("error", (err) => {
					clearTimeout(timer);
					reject(err);
				});
			});
			generated = true;
		} catch (e) {
			console.warn("TTS network service unavailable, generating speech placeholder track:", e);
		}

		if (!generated) {
			// Generate placeholder audio tone via ffmpeg with duration ~ 3.5s
			const args = [
				"-y",
				"-f",
				"lavfi",
				"-i",
				"sine=frequency=520:duration=3.5",
				"-c:a",
				"libmp3lame",
				outputPath,
			];
			const proc = spawn("ffmpeg", args);
			await new Promise<void>((resolve, reject) => {
				proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg audio tone failed"))));
				proc.on("error", reject);
			});
		}

		// Probe generated audio for duration
		const probe = await FFmpegService.probeVideo(outputPath);

		return {
			audioPath: outputPath,
			duration: probe.duration,
		};
	}
}
