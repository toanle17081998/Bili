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
		assert.equal(result.voiceovers.length, 1);
		assert.equal(result.voiceovers[0].start, 0);
		assert.equal(result.voiceovers[0].end, 10);
		const voiceFile = new URL(result.voiceovers[0].audioUrl, "http://localhost").searchParams.get("file")!;
		const plan = JSON.parse(await fs.readFile(path.join(path.dirname(voiceFile), "dubbing-plan.json"), "utf8"));
		assert.deepEqual(plan.map((s: { start: number }) => s.start), [4, 8]);
		assert.ok(plan[0].end <= 5.5 + 1e-6);
		assert.ok(plan[1].end <= 10 + 1e-6);
		const volumeAt = async (seconds: number) => {
			const { stderr } = await FFmpegService.runCommand("ffmpeg", ["-ss", String(seconds), "-t", "0.2", "-i", voiceFile, "-af", "volumedetect", "-f", "null", "-"]);
			return Number(stderr.match(/mean_volume: (-?[\d.]+) dB/)?.[1]);
		};
		assert.ok(await volumeAt(1) < -80, "keep initial silence");
		assert.ok(await volumeAt(4.5) > -40, "first speech stays at source position");
		assert.ok(await volumeAt(7) < -80, "keep pause between paragraphs");
		assert.ok(await volumeAt(8.5) > -40, "second speech stays at source position");
		for (const segment of result.voiceovers) {
			const file = new URL(segment.audioUrl, "http://localhost").searchParams.get("file")!;
			assert.equal((await FFmpegService.probeVideo(file)).duration, segment.duration);
		}
		assert.equal(speechCalls, 2);
		const joined = await new LocalizationPipeline(providers).run({ ...options, customSubtitles: [
			{ id: "a", start: 1, end: 2, text: "First line" },
			{ id: "b", start: 2, end: 3, text: "continues here." },
			{ id: "c", start: 6, end: 8, text: "After a pause." },
		] });
		assert.equal(speechCalls, 4, "three captions synthesize two continuous paragraphs");
		assert.equal(joined.subtitles.length, 3, "caption splits remain unchanged");
		assert.equal(joined.voiceovers.length, 1);
		assert.match(joined.voiceovers[0].text, /First line continues here\./);
		await assert.rejects(new LocalizationPipeline({ ...providers,
			transcriptionProvider: { name: "faster-whisper", transcribe: async () => [] },
		}).run(options), /No speech detected/);
		assert.equal(speechCalls, 4, "silent input must not fabricate narration");
		await assert.rejects(new LocalizationPipeline({ ...providers,
			ttsProvider: { name: "failed", generateSpeech: async () => { throw new Error("TTS unavailable"); } },
		}).run(options), /TTS unavailable/);
		await assert.rejects(new LocalizationPipeline({ ...providers,
			vocalSeparator: async () => { throw new Error("Separation unavailable"); },
		}).run(options), /Separation unavailable/);
	} finally { await fs.rm(directory, { recursive: true, force: true }); }
});
