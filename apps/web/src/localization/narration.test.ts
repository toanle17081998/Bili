import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FFmpegService } from "@/media/ffmpeg";
import { loadDubbingTiming } from "./timing";
import { generateNarrationPreview, validateNarrationScript } from "./narration";
import { LocalizationPipeline } from "./pipeline";

const storyAnalysis = {
	throughline: "Từ các bộ phận rời đến một cây cầu hoàn chỉnh.",
	tone: "Gần gũi, tò mò, hào hứng vừa phải.",
	beats: [
		{ frameIndex: 0, observation: "Các thanh nhỏ được ghép thành cầu.", storyRole: "Mở câu chuyện bằng sự tò mò." },
		{ frameIndex: 1, observation: "Cây cầu đã được lắp hoàn chỉnh.", storyRole: "Chốt bằng thành quả nhìn thấy." },
	],
	uncertainties: ["Không thấy thử tải nên không khẳng định độ bền."],
};

function providerResponse({ provider, payload }: { provider: string; payload: unknown }) {
	const text = JSON.stringify(payload);
	return Response.json(provider === "gemini"
		? { candidates: [{ content: { parts: [{ text }] } }] }
		: { choices: [{ message: { content: text } }] });
}

test("Rust bounds image sampling and rejects overlapping, empty or excessive narration", async () => {
	const policy = await loadDubbingTiming();
	assert.ok(policy.narration_output_tokens(600) > policy.narration_output_tokens(8));
	assert.ok(policy.narration_output_tokens(600) <= 16384);
	for (const duration of [0.5, 8, 60, 600]) {
		const count = policy.narration_frame_count(duration);
		assert.ok(count > 0 && count <= 72);
		let previous = -1;
		for (let i = 0; i < count; i++) {
			const time = policy.narration_frame_time(duration, i);
			assert.ok(time > previous && time < duration);
			previous = time;
		}
		assert.ok(Number.isNaN(policy.narration_frame_time(duration, count)));
	}
	for (const duration of [0, -1, NaN, Infinity, 601])
		assert.equal(policy.narration_frame_count(duration), 0);
	const cue = {
		id: "one",
		start: 0,
		end: 4,
		text: "A person builds a small bridge.",
	};
	await validateNarrationScript({ segments: [cue], duration: 8 });
	await assert.rejects(
		validateNarrationScript({ segments: [{ ...cue, text: "x".repeat(10000) }], duration: 8 }),
		/giới hạn/,
	);
	await assert.rejects(
		validateNarrationScript({
			segments: Array.from({ length: 17 }, (_, index) => ({
				id: String(index),
				start: index,
				end: index + 1,
				text: "x".repeat(4096),
			})),
			duration: 20,
		}),
		/giới hạn/,
	);
	for (const cues of [
		[],
		[{ ...cue, text: " " }],
		[{ ...cue, end: 9 }],
		[{ ...cue, text: "word ".repeat(17) }],
		[cue, { ...cue, id: "two", start: 3, end: 6 }],
	])
		await assert.rejects(validateNarrationScript({ segments: cues, duration: 8 }));
});

test("silent video analyzes the whole story before writing narration with either provider", async () => {
	const directory = await fs.mkdtemp(
		path.join(os.tmpdir(), "narration-vision-"),
	);
	const keys = [
		"GEMINI_API_KEY",
		"OPENAI_API_KEY",
		"OPENAI_LLM_API_KEY",
		"OPENAI_LLM_MODEL",
		"OPENAI_MODEL",
	];
	const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
	try {
		const videoPath = path.join(directory, "silent.mp4");
		await FFmpegService.runCommand("ffmpeg", [
			"-y",
			"-f",
			"lavfi",
			"-i",
			"testsrc2=size=96x64:rate=10:duration=8",
			"-an",
			"-c:v",
			"libx264",
			videoPath,
		]);
		assert.equal((await FFmpegService.probeVideo(videoPath)).hasAudio, false);
		for (const key of keys) delete process.env[key];
		await assert.rejects(
			generateNarrationPreview({ videoPath, workDir: directory }),
			/GEMINI_API_KEY/,
		);
		for (const provider of ["gemini", "openai"]) {
			delete process.env.GEMINI_API_KEY;
			process.env[
				provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_LLM_API_KEY"
			] = "test-key";
			process.env.OPENAI_LLM_MODEL = "gpt-4o-mini";
			let calls = 0;
			const fetchImpl: NonNullable<
				Parameters<typeof generateNarrationPreview>[0]["fetchImpl"]
			> = async (...args) => {
				const init = args[1];
				calls++;
				const body = JSON.parse(String(init?.body));
				const parts =
					provider === "gemini"
						? body.contents[0].parts
						: body.messages[0].content;
				assert.match(parts[0].text, /"duration":8/);
				assert.match(parts[0].text, /"notes":"Bridge demonstration"/);
				const images = parts.filter(
					(part: { inlineData?: unknown; image_url?: unknown }) =>
						part.inlineData || part.image_url,
				);
				if (calls === 2) {
					assert.equal(images.length, 0, "writing uses grounded story analysis, not frame-by-frame captioning");
					assert.match(parts[0].text, /"throughline":"Từ các bộ phận rời/);
					assert.match(parts[0].text, /"time":2/);
					assert.match(parts[0].text, /"time":6/);
					assert.match(parts[0].text, /Không thấy thử tải/);
					assert.match(parts[0].text, /KHÔNG PHẢI.*mô tả/);
					return providerResponse({ provider, payload: {
						segments: [
							{ start: 0, end: 4, text: "Vài thanh nhỏ thôi, ghép lại sẽ ra sao?" },
							{ start: 5, end: 8, text: "Thành hình rồi, nhìn cũng ra gì đấy!" },
						],
					} });
				}
				assert.equal(calls, 1);
				assert.match(parts[0].text, /PHÂN TÍCH MẠCH CHUYỆN/);
				assert.equal(images.length, 2);
				for (const image of images) {
					const base64 =
						provider === "gemini"
							? image.inlineData.data
							: image.image_url.url.split(",")[1];
					assert.equal(
						Buffer.from(base64, "base64").subarray(0, 2).toString("hex"),
						"ffd8",
					);
				}
				return providerResponse({ provider, payload: storyAnalysis });
			};
			const preview = await generateNarrationPreview({
				videoPath,
				workDir: directory,
				notes: "Bridge demonstration",
				fetchImpl,
			});
			assert.equal(calls, 2);
			assert.equal(preview.subtitles.length, 2);
			assert.equal(preview.subtitles[1].start, 5, "the pause between story beats is preserved");
			assert.equal(preview.duration, 8);
			assert.deepEqual(await fs.readdir(directory), ["silent.mp4"]);
		}
		for (const response of [
			new Response(null, { status: 429 }),
			Response.json({ choices: [{ message: { content: "invalid json" } }] }),
			providerResponse({ provider: "openai", payload: { ...storyAnalysis, beats: [] } }),
			providerResponse({ provider: "openai", payload: { ...storyAnalysis, beats: [{ ...storyAnalysis.beats[0], frameIndex: 99 }] } }),
		]) {
			await assert.rejects(
				generateNarrationPreview({
					videoPath,
					workDir: directory,
					fetchImpl: async () => response,
				}),
			);
			assert.deepEqual(await fs.readdir(directory), ["silent.mp4"]);
		}
		for (const response of [
			new Response(null, { status: 429 }),
			providerResponse({ provider: "openai", payload: { segments: [] } }),
			providerResponse({ provider: "openai", payload: { segments: [{ start: 0, end: 9, text: "Too late." }] } }),
		]) {
			let calls = 0;
			await assert.rejects(generateNarrationPreview({
				videoPath,
				workDir: directory,
				fetchImpl: async () => ++calls === 1 ? providerResponse({ provider: "openai", payload: storyAnalysis }) : response,
			}));
			assert.equal(calls, 2);
			assert.deepEqual(await fs.readdir(directory), ["silent.mp4"]);
		}
		let fractionalCalls = 0;
		const fractional = await generateNarrationPreview({
			videoPath,
			workDir: directory,
			duration: 7.8,
			fetchImpl: async (_url, init) => {
				const body = JSON.parse(String(init?.body));
				assert.match(body.messages[0].content[0].text, /"duration":7.8/);
				if (++fractionalCalls === 1) return providerResponse({ provider: "openai", payload: storyAnalysis });
				return Response.json({
					choices: [
						{
							message: {
								content: JSON.stringify({
									segments: [
										{ start: 0, end: 7.8, text: "A bridge takes shape." },
									],
								}),
							},
						},
					],
				});
			},
		});
		assert.equal(fractional.duration, 7.8);
		assert.equal(fractionalCalls, 2);
	} finally {
		for (const key of keys) {
			if (saved[key] === undefined) delete process.env[key];
			else process.env[key] = saved[key];
		}
		await fs.rm(directory, { recursive: true, force: true });
	}
});

test("narration synthesizes silent video without separation, transcription or translation", async () => {
	const directory = await fs.mkdtemp(
		path.join(os.tmpdir(), "narration-speech-"),
	);
	try {
		const videoPath = path.join(directory, "silent.mp4");
		await FFmpegService.runCommand("ffmpeg", [
			"-y",
			"-f",
			"lavfi",
			"-i",
			"testsrc2=size=96x64:rate=10:duration=8",
			"-an",
			"-c:v",
			"libx264",
			videoPath,
		]);
		const unexpected = async (): Promise<never> => {
			throw new Error("Audio source must not be requested");
		};
		let calls = 0;
		const pipeline = new LocalizationPipeline({
			vocalSeparator: unexpected,
			transcriptionProvider: { name: "test", transcribe: unexpected },
			llmProvider: { name: "test", translateAndRewrite: unexpected },
			ttsProvider: {
				name: "test",
				generateSpeech: async ({ outputPath }) => {
					calls++;
					await FFmpegService.runCommand("ffmpeg", [
						"-y",
						"-f",
						"lavfi",
						"-i",
						"sine=frequency=550:duration=1",
						outputPath,
					]);
					return { audioPath: outputPath, duration: 1 };
				},
			},
		});
		const options = {
			projectId: "test",
			videoPath,
			workDir: directory,
			mode: "narration" as const,
			timelineStart: 12,
			sourceSignature: "clip-one",
			voice: "test-voice",
		};
		await fs.mkdir(path.join(directory, "test"));
		await fs.writeFile(
			path.join(directory, "test", "latest-project.json"),
			'{"id":"legacy-dubbing"}',
		);
		const result = await pipeline.run({
			...options,
			customSubtitles: [
				{ id: "one", start: 2, end: 5, text: "A small bridge takes shape." },
			],
		});
		assert.equal(calls, 1);
		assert.equal(result.backgroundAudioUrl, undefined);
		assert.deepEqual(result.transcript, []);
		assert.equal(result.mode, "narration");
		assert.equal(result.timelineStart, 12);
		assert.equal(result.sourceSignature, "clip-one");
		assert.equal(result.voice, "test-voice");
		assert.equal(
			JSON.parse(
				await fs.readFile(
					path.join(directory, "test", "latest-project.json"),
					"utf8",
				),
			).id,
			"legacy-dubbing",
		);
		assert.ok(
			Math.abs(result.voiceovers[0].duration - 8) < 1 / 48000 + 0.000001,
		);
		const voicePath = new URL(
			result.voiceovers[0].audioUrl,
			"http://localhost",
		).searchParams.get("file")!;
		const { stderr } = await FFmpegService.runCommand("ffmpeg", [
			"-ss",
			"0.5",
			"-t",
			"0.2",
			"-i",
			voicePath,
			"-af",
			"volumedetect",
			"-f",
			"null",
			"-",
		]);
		assert.ok(Number(stderr.match(/mean_volume: (-?[\d.]+) dB/)?.[1]) < -80);
		assert.equal(
			JSON.parse(
				await fs.readFile(
					path.join(directory, "test", "latest-narration.json"),
					"utf8",
				),
			).mode,
			"narration",
		);
		await assert.rejects(pipeline.run(options), /kịch bản/);
		assert.equal(calls, 1, "unreviewed scripts never invoke TTS");
		const fractional = await pipeline.run({
			...options,
			sourceDuration: 7.8,
			customSubtitles: [
				{ id: "one", start: 2, end: 5, text: "A bridge takes shape." },
			],
		});
		assert.equal(fractional.source.duration, 7.8);
		assert.ok(
			Math.abs(fractional.voiceovers[0].duration - 7.8) < 1 / 48000 + 0.000001,
		);
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
});
