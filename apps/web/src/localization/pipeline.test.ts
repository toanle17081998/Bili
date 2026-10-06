import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FFmpegService } from "@/media/ffmpeg";
import { LocalizationPipeline } from "./pipeline";

test("dubbing retains source timestamps, fits real audio, and surfaces provider failures", async () => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bili-dubbing-test-"));
	try {
		const source = path.join(directory, "source.wav");
		await FFmpegService.runCommand("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=10", source]);
		let speechCalls = 0;
		const providers = {
			vocalSeparator: async () => ({ vocals: source, background: source }),
			transcriptionProvider: { name: "faster-whisper", transcribe: async () => [
				{ start: 4, end: 5.5, text: "First" }, { start: 8, end: 10, text: "Second" },
			] },
			llmProvider: { name: "test", translateAndRewrite: async (segments: { text: string }[]) => segments.map((s) => ({
				sourceStart: 999, sourceEnd: 1000, sourceText: s.text, vietnameseText: s.text, targetDuration: 1,
			})) },
			ttsProvider: { name: "test", generateSpeech: async ({ outputPath }: { outputPath: string }) => {
				speechCalls++;
				await FFmpegService.runCommand("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=550:duration=3", outputPath]);
				return { audioPath: outputPath, duration: 3 };
			} },
		};
		const options = { projectId: "test", videoPath: source, workDir: directory };
		const result = await new LocalizationPipeline(providers).run(options);
		assert.deepEqual(result.voiceovers.map((s) => s.start), [4, 8]);
		assert.ok(result.voiceovers[0].end <= 5.5 + 1e-6);
		assert.ok(result.voiceovers[1].end <= 10 + 1e-6);
		for (const segment of result.voiceovers) {
			const file = new URL(segment.audioUrl, "http://localhost").searchParams.get("file")!;
			assert.equal((await FFmpegService.probeVideo(file)).duration, segment.duration);
		}
		assert.equal(speechCalls, 2);
		await assert.rejects(new LocalizationPipeline({ ...providers,
			transcriptionProvider: { name: "faster-whisper", transcribe: async () => [] },
		}).run(options), /No speech detected/);
		assert.equal(speechCalls, 2, "silent input must not fabricate narration");
		await assert.rejects(new LocalizationPipeline({ ...providers,
			ttsProvider: { name: "failed", generateSpeech: async () => { throw new Error("TTS unavailable"); } },
		}).run(options), /TTS unavailable/);
		await assert.rejects(new LocalizationPipeline({ ...providers,
			vocalSeparator: async () => { throw new Error("Separation unavailable"); },
		}).run(options), /Separation unavailable/);
	} finally { await fs.rm(directory, { recursive: true, force: true }); }
});
