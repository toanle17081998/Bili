import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";

export interface VideoProbeResult {
	duration: number; // in seconds
	width: number;
	height: number;
	fps: number;
	hasAudio: boolean;
	bitrate?: number;
}

export class FFmpegService {
	static getBinaryPath(name: string): string {
		const wingetGyanPath = path.join(
			process.env.LOCALAPPDATA || "C:\\Users\\Admin\\AppData\\Local",
			"Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.2-full_build\\bin",
			`${name}.exe`,
		);
		if (existsSync(wingetGyanPath)) {
			return wingetGyanPath;
		}
		return name;
	}

	static async runCommand(
		cmd: string,
		args: string[],
	): Promise<{ stdout: string; stderr: string }> {
		const binary = this.getBinaryPath(cmd);
		return new Promise((resolve, reject) => {
			const process = spawn(binary, args, { shell: false });
			let stdout = "";
			let stderr = "";

			process.stdout.on("data", (data) => {
				stdout += data.toString();
			});

			process.stderr.on("data", (data) => {
				stderr += data.toString();
			});

			process.on("close", (code) => {
				if (code === 0) {
					resolve({ stdout, stderr });
				} else {
					reject(
						new Error(
							`Command '${cmd} ${args.join(" ")}' exited with code ${code}.\n${stderr}`,
						),
					);
				}
			});

			process.on("error", (err) => {
				reject(err);
			});
		});
	}

	static async probeVideo(filePath: string): Promise<VideoProbeResult> {
		try {
			const args = [
				"-v",
				"error",
				"-show_entries",
				"stream=width,height,r_frame_rate,codec_type:format=duration,bit_rate",
				"-of",
				"json",
				filePath,
			];

			const { stdout } = await this.runCommand("ffprobe", args);
			const data = JSON.parse(stdout);

			const videoStream = data.streams?.find(
				(s: any) => s.codec_type === "video",
			);
			const audioStream = data.streams?.find(
				(s: any) => s.codec_type === "audio",
			);

			let fps = 30;
			if (videoStream?.r_frame_rate) {
				const [num, den] = videoStream.r_frame_rate.split("/").map(Number);
				if (den && den > 0) fps = Math.round(num / den);
			}

			const duration = parseFloat(data.format?.duration || "0");
			if (!Number.isFinite(duration) || duration <= 0) throw new Error("Invalid media duration");

			return {
				duration,
				width: videoStream?.width || 1080,
				height: videoStream?.height || 1920,
				fps,
				hasAudio: !!audioStream,
				bitrate: parseInt(data.format?.bit_rate || "0", 10),
			};
		} catch (e) {
			throw new Error(`Cannot probe media: ${filePath}`, { cause: e });
		}
	}

	static async extractAudio(
		videoPath: string,
		outputAudioPath: string,
	): Promise<string> {
		await fs.mkdir(path.dirname(outputAudioPath), { recursive: true });
		try {
			const args = [
				"-y",
				"-i",
				videoPath,
				"-vn",
				"-acodec",
				"libmp3lame",
				"-q:a",
				"2",
				outputAudioPath,
			];
			await this.runCommand("ffmpeg", args);
		} catch (e) {
			throw new Error("Cannot extract source audio", { cause: e });
		}
		return outputAudioPath;
	}

	static async exportVerticalVideo({
		videoPath,
		voiceoverAudioPath,
		subtitlesPath,
		outputPath,
		originalAudioVolume = 0.2,
		voiceoverVolume = 1.0,
		targetWidth = 1080,
		targetHeight = 1920,
		fps = 30,
	}: {
		videoPath: string;
		voiceoverAudioPath?: string;
		subtitlesPath?: string;
		outputPath: string;
		originalAudioVolume?: number;
		voiceoverVolume?: number;
		targetWidth?: number;
		targetHeight?: number;
		fps?: number;
	}): Promise<string> {
		await fs.mkdir(path.dirname(outputPath), { recursive: true });

		const inputs: string[] = ["-y", "-i", videoPath];
		if (voiceoverAudioPath) {
			inputs.push("-i", voiceoverAudioPath);
		}

		// Filter complex:
		// 1. Scale and crop video to center 1080x1920 (9:16)
		// 2. Mix audio if voiceover exists
		const filterComplex: string[] = [];

		// Video crop/scale filter
		// scale to fill 1080x1920 then crop center
		filterComplex.push(
			`[0:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},fps=${fps}[vbase]`,
		);

		let finalVideoLabel = "vbase";

		if (subtitlesPath) {
			// Subtitle overlay using subtitles filter (escape path for ffmpeg filter)
			const safeSubPath = subtitlesPath.replace(/\\/g, "/").replace(/:/g, "\\:");
			filterComplex.push(
				`[vbase]subtitles='${safeSubPath}':charenc=UTF-8:force_style='Alignment=2,FontSize=20,Fontname=Arial,Bold=1,Outline=2,Shadow=1'[vfinal]`,
			);
			finalVideoLabel = "vfinal";
		}

		if (voiceoverAudioPath) {
			// Mix 0:a (original) with 1:a (voiceover)
			filterComplex.push(
				`[0:a]volume=${originalAudioVolume}[a0];` +
					`[1:a]volume=${voiceoverVolume}[a1];` +
					`[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[afinal]`,
			);
		} else {
			filterComplex.push(`[0:a]volume=${originalAudioVolume}[afinal]`);
		}

		const filterString = filterComplex.join(";");

		const args = [
			...inputs,
			"-filter_complex",
			filterString,
			"-map",
			`[${finalVideoLabel}]`,
			"-map",
			"[afinal]",
			"-c:v",
			"libx264",
			"-preset",
			"fast",
			"-crf",
			"23",
			"-c:a",
			"aac",
			"-b:a",
			"192k",
			outputPath,
		];

		try {
			await this.runCommand("ffmpeg", args);
		} catch (err) {
			console.warn("FFmpeg export with subtitles failed, retrying without subtitle filter:", err);
			const fallbackArgs = [
				...inputs,
				"-filter_complex",
				`[0:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},fps=${fps}[vbase];` +
					(voiceoverAudioPath
						? `[0:a]volume=${originalAudioVolume}[a0];[1:a]volume=${voiceoverVolume}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[afinal]`
						: `[0:a]volume=${originalAudioVolume}[afinal]`),
				"-map",
				"[vbase]",
				"-map",
				"[afinal]",
				"-c:v",
				"libx264",
				"-preset",
				"fast",
				"-crf",
				"23",
				"-c:a",
				"aac",
				"-b:a",
				"192k",
				outputPath,
			];
			await this.runCommand("ffmpeg", fallbackArgs);
		}
		return outputPath;
	}
}
