import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { FFmpegService } from "@/media/ffmpeg";
import { VieNeuTTSProvider } from "@/providers/tts/vieneu";
import { NextRequest } from "next/server";
import { POST as uploadSource } from "@/app/api/localization/sources/route";
import {
	GET as getStoryAPI,
	POST as postStoryAPI,
} from "@/app/api/localization/story/route";
import { storyEngine } from "./engine";
import { ConfiguredStoryProvider, type StoryAIProvider } from "./provider";
import {
	runStoryAction,
	editStoryProject,
	startStoryJob,
	cancelStoryJob,
	getStoryState,
} from "./service";
import { readStoryProject, storyDirectory, writeStoryJSON } from "./storage";
import type { StoryDocument } from "./types";

// Provider outputs below are test fixtures only. Media preprocessing, audio
// measurements, fitting, persistence and FFmpeg rendering use real binaries.
function fixtureProvider({
	audio,
	failStory = false,
}: {
	audio: boolean;
	failStory?: boolean;
}) {
	const calls: string[] = [];
	let failed = false;
	const provider: StoryAIProvider = {
		cacheIdentity: "test-provider-v1",
		supportsVideoAudio: audio,
		async request({ stage, context, media }) {
			calls.push(stage);
			if (stage === "events") {
				assert.ok(media?.length);
				assert.equal(media[0].mimeType, audio ? "video/mp4" : "image/jpeg");
				return {
					events: [
						{
							start: 0,
							end: 3,
							event_type: "test",
							description: "Xe LEGO chạy thử.",
							objects: ["lego_car"],
							confidence: 0.9,
							source: "video",
							importance: "high",
							evidence_times: [0.1, 2],
							preserve_audio: false,
						},
						...(audio
							? [
									{
										start: 3.2,
										end: 3.8,
										event_type: "sound",
										description: "Âm thanh cần giữ.",
										objects: [],
										confidence: 0.9,
										source: "audio",
										importance: "high",
										evidence_times: [3.5],
										preserve_audio: true,
									},
								]
							: []),
					],
					uncertainties: ["Chưa thấy kết quả cuối cùng."],
				};
			}
			if (stage === "story") {
				if (failStory && !failed) {
					failed = true;
					throw new Error(
						"Simulated invalid AI JSON after analysis checkpoint",
					);
				}
				return {
					title: "Thử xe LEGO",
					summary: "Xe được thử nghiệm, chưa rõ kết quả.",
					outcome: "unknown",
					outcome_event_ids: [],
					understanding: {
						main_character: null,
						setting: null,
						central_challenge: null,
						goal: null,
						stakes: null,
						initial_situation: null,
						obstacles: null,
						attempts: null,
						turning_point: null,
						climax: null,
						resolution: null,
						final_outcome: null,
					},
					outline: [
						{
							role: "development",
							description: "Thử xe",
							event_ids: ["w0_e0"],
						},
					],
					causal_links: [],
					paragraphs: [
						{
							id: "p1",
							role: "development",
							text: "Xe LEGO chạy thử.",
							event_ids: ["w0_e0"],
						},
					],
				};
			}
			if (stage === "segments") {
				assert.ok(context && typeof context === "object" && "story" in context);
				return {
					segments: [
						{
							segment_id: "s1",
							paragraph_id: "p1",
							start_time: 0.1,
							end_time: 2.9,
							narration_text: "Xe LEGO chạy thử.",
							story_role: "development",
							emotion: "curious",
							speaking_rate: 1,
							estimated_duration: 1.5,
							associated_event_ids: ["w0_e0"],
							pause_before: 0,
							pause_after: 0.1,
							intentional_lead_in: false,
							locked: false,
						},
					],
				};
			}
			if (stage === "review") return { issues: [] };
			if (stage === "rewrite") return { text: "Xe chạy thử." };
			throw new Error(`Unexpected stage ${stage}`);
		},
	};
	return { provider, calls };
}

async function sourceFixture({
	projectId,
	audio,
	duration = 4,
}: {
	projectId: string;
	audio: boolean;
	duration?: number;
}) {
	const projectRoot = path.dirname(storyDirectory(projectId));
	const directory = path.join(projectRoot, "narration-sources", "source-test");
	await fs.mkdir(directory, { recursive: true });
	const original = path.join(directory, "original.mp4");
	await FFmpegService.runCommand("ffmpeg", [
		"-y",
		"-f",
		"lavfi",
		"-i",
		`testsrc2=size=96x64:rate=8:duration=${duration}`,
		...(audio
			? [
					"-f",
					"lavfi",
					"-i",
					`sine=frequency=220:duration=${duration}`,
					"-c:a",
					"aac",
				]
			: ["-an"]),
		"-c:v",
		"libx264",
		"-pix_fmt",
		"yuv420p",
		original,
	]);
	const proxy = path.join(directory, "video.mp4");
	await fs.copyFile(original, proxy);
	await fs.writeFile(
		path.join(directory, "source.json"),
		JSON.stringify({ duration, originalPath: original }),
	);
	return { proxy, projectRoot };
}

test("real FFmpeg: checkpointed story -> existing TTS interface -> shorten -> ducked export; voice edits reuse analysis", async () => {
	const projectId = `story-test-${randomUUID()}`;
	const { proxy, projectRoot } = await sourceFixture({
		projectId,
		audio: true,
	});
	const { provider, calls } = fixtureProvider({ audio: true });
	const signal = AbortSignal.timeout(60000);
	const progress = async () => {};
	try {
		const analyzed = await runStoryAction({
			input: {
				projectId,
				action: "analyze",
				videoPath: proxy,
				sourceSignature: "source-1",
				voice: "Hải Đăng",
			},
			provider,
			signal,
			progress,
		});
		assert.equal(analyzed.story!.outcome, "unknown");
		assert.equal(analyzed.analyzed_windows, 1);
		assert.equal(analyzed.events[1].preserve_audio, true);
		let speechCalls = 0;
		const tts = {
			name: "test-only",
			async generateSpeech(request: { text: string; outputPath: string }) {
				speechCalls++;
				const duration = speechCalls === 1 ? 3.8 : 0.6;
				await FFmpegService.runCommand("ffmpeg", [
					"-y",
					"-f",
					"lavfi",
					"-i",
					`sine=frequency=880:duration=${duration}`,
					"-c:a",
					"pcm_s16le",
					request.outputPath,
				]);
				return { audioPath: request.outputPath, duration };
			},
		};
		const voiced = await runStoryAction({
			input: { projectId, action: "tts" },
			tts,
			provider,
			signal,
			progress,
		});
		assert.equal(
			speechCalls,
			2,
			"overlong audio is shortened once before tempo adjustment",
		);
		assert.equal(voiced.segments[0].narration_text, "Xe chạy thử.");
		assert.ok(voiced.segments[0].audio!.duration < 1);
		assert.equal(calls.filter((s) => s === "events").length, 1);
		const exported = await runStoryAction({
			input: {
				projectId,
				action: "render",
				mix: { ...voiced.mix, quality: "preview" },
			},
			provider,
			signal,
			progress,
		});
		assert.ok(exported.render);
		const metadata = await FFmpegService.probeVideo(exported.render.path);
		assert.ok(metadata.hasAudio);
		assert.equal(metadata.width, 96);
		assert.ok(Math.abs(metadata.duration - 4) < 0.1);
		const samples = await FFmpegService.runCommand("ffmpeg", [
			"-i",
			exported.render.path,
			"-ss",
			"3.2",
			"-t",
			"0.5",
			"-vn",
			"-af",
			"volumedetect",
			"-f",
			"null",
			"-",
		]);
		assert.match(
			samples.stderr,
			/mean_volume: -\d+(?:\.\d+)? dB/,
			"original audio remains after narration stops",
		);
		const before = calls.filter((s) => s === "story").length;
		await runStoryAction({
			input: { projectId, action: "tts", voice: "Ngọc Huyền", segmentId: "s1" },
			provider,
			tts,
			signal,
			progress,
		});
		assert.equal(calls.filter((s) => s === "story").length, before);
		assert.equal(calls.filter((s) => s === "events").length, 1);
		const saved = (await readStoryProject(projectId))!;
		const edited = await editStoryProject({
			projectId,
			revision: saved.revision,
			segmentId: "s1",
			patch: { narration_text: "Xe chạy." },
		});
		assert.equal(edited.segments[0].audio, undefined);
		assert.deepEqual(edited.events, saved.events);
		await assert.rejects(
			editStoryProject({
				projectId,
				revision: saved.revision,
				segmentId: "s1",
				patch: { locked: true },
			}),
			/đã thay đổi/,
		);
	} finally {
		assert.ok(path.basename(projectRoot).startsWith("story-test-"));
		await fs.rm(projectRoot, { recursive: true, force: true });
	}
});

test("silent continuous shot and failed story request resume from persisted video analysis", async () => {
	const projectId = `story-test-${randomUUID()}`;
	const { proxy, projectRoot } = await sourceFixture({
		projectId,
		audio: false,
	});
	const { provider, calls } = fixtureProvider({
		audio: false,
		failStory: true,
	});
	const base = {
		provider,
		signal: AbortSignal.timeout(60000),
		progress: async () => {},
	};
	try {
		await assert.rejects(
			runStoryAction({
				...base,
				input: {
					projectId,
					action: "analyze",
					videoPath: proxy,
					sourceSignature: "silent",
				},
			}),
			/Simulated invalid AI JSON/,
		);
		const checkpoint = (await readStoryProject(projectId))!;
		assert.equal(checkpoint.analyzed_windows, 1);
		assert.equal(checkpoint.metadata.hasAudio, false);
		const resumed = await runStoryAction({
			...base,
			input: { projectId, action: "story" },
		});
		assert.ok(resumed.segments.length);
		assert.equal(calls.filter((s) => s === "events").length, 1);
		const settings = { ...resumed.settings, style: "documentary" as const };
		await runStoryAction({
			...base,
			input: { projectId, action: "story", settings },
		});
		assert.equal(
			calls.filter((s) => s === "events").length,
			1,
			"style changes do not resend video",
		);
		await runStoryAction({
			...base,
			input: { projectId, action: "tts" },
			tts: {
				name: "test-only-silent-source",
				async generateSpeech(request) {
					await FFmpegService.runCommand("ffmpeg", [
						"-y",
						"-f",
						"lavfi",
						"-i",
						"sine=frequency=880:duration=0.6",
						request.outputPath,
					]);
					return { audioPath: request.outputPath, duration: 0.6 };
				},
			},
		});
		const rendered = await runStoryAction({
			...base,
			input: { projectId, action: "render" },
		});
		assert.equal(
			(await FFmpegService.probeVideo(rendered.render!.path)).hasAudio,
			true,
			"silent source renders with narration without requiring an original audio stream",
		);
	} finally {
		await fs.rm(projectRoot, { recursive: true, force: true });
	}
});

test("a pending timeline checkpoint resumes without requesting video analysis, story or segments again", async () => {
	const projectId = `story-test-${randomUUID()}`;
	const { proxy, projectRoot } = await sourceFixture({
		projectId,
		audio: false,
	});
	const { provider, calls } = fixtureProvider({ audio: false });
	const base = {
		provider,
		signal: AbortSignal.timeout(60000),
		progress: async () => {},
	};
	try {
		const completed = await runStoryAction({
			...base,
			input: {
				projectId,
				action: "analyze",
				videoPath: proxy,
				sourceSignature: "pending-timeline",
			},
		});
		// Reproduce a committed story at 80% with a complete but uncommitted
		// timeline checkpoint, as left by a sharing lock or a server restart.
		const pending = { ...completed, ai_review: undefined };
		await writeStoryJSON({
			projectId,
			name: "project.json",
			value: {
				...pending,
				revision: pending.revision - 1,
				segments: [],
				review: undefined,
			},
		});
		const projectFile = path.join(storyDirectory(projectId), "project.json");
		await fs.writeFile(`${projectFile}.pending`, JSON.stringify(pending));
		calls.length = 0;
		const resumed = await runStoryAction({
			...base,
			input: { projectId, action: "story" },
		});
		assert.deepEqual(calls, ["review"]);
		assert.deepEqual(resumed.segments, completed.segments);
		assert.deepEqual(resumed.events, completed.events);
		assert.deepEqual(resumed.story, completed.story);
		assert.equal(resumed.analyzed_windows, completed.analyzed_windows);
		assert.deepEqual(
			(await readStoryProject(projectId))?.segments,
			completed.segments,
		);
		await assert.rejects(fs.stat(`${projectFile}.pending`), { code: "ENOENT" });
	} finally {
		assert.ok(path.basename(projectRoot).startsWith("story-test-"));
		await fs.rm(projectRoot, { recursive: true, force: true });
	}
});

test("provider transport retries transient failures and never treats missing credentials as working AI", async () => {
	const keys = ["GEMINI_API_KEY", "OPENAI_LLM_API_KEY", "OPENAI_API_KEY"];
	const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
	try {
		for (const key of keys) delete process.env[key];
		await assert.rejects(
			new ConfiguredStoryProvider().request({
				stage: "story",
				context: {},
				signal: AbortSignal.timeout(1000),
			}),
			/Cấu hình/,
		);
		process.env.OPENAI_LLM_API_KEY = "test-only";
		let count = 0;
		const provider = new ConfiguredStoryProvider(async () => {
			count++;
			if (count === 1) return new Response("busy", { status: 503 });
			return Response.json({
				choices: [{ message: { content: '{"issues":[]}' } }],
			});
		});
		assert.deepEqual(
			await provider.request({
				stage: "review",
				context: {},
				signal: AbortSignal.timeout(5000),
			}),
			{ issues: [] },
		);
		assert.equal(count, 2);
		const malformed = new ConfiguredStoryProvider(async () =>
			Response.json({ choices: [{ message: { content: "not JSON" } }] }),
		);
		await assert.rejects(
			malformed.request({
				stage: "story",
				context: {},
				signal: AbortSignal.timeout(5000),
			}),
			/JSON không hợp lệ/,
		);
	} finally {
		for (const key of keys) {
			if (saved[key] === undefined) delete process.env[key];
			else process.env[key] = saved[key];
		}
	}
});

test("a six-window video resumes at window two and accepts single-frame events without inventing durations", async () => {
	const projectId = `story-test-${randomUUID()}`;
	const { proxy, projectRoot } = await sourceFixture({
		projectId,
		audio: false,
		duration: 176.7,
	});
	const calls = new Map<number, number>();
	const provider: StoryAIProvider = {
		cacheIdentity: "test-six-windows",
		supportsVideoAudio: true,
		async request({ stage, context }) {
			if (stage === "story")
				throw new Error("Test stops after completed video analysis");
			assert.equal(stage, "events");
			assert.ok(context && typeof context === "object" && "window" in context);
			const window = context.window;
			assert.ok(
				window &&
					typeof window === "object" &&
					"start" in window &&
					"end" in window &&
					"index" in window,
			);
			assert.equal(typeof window.start, "number");
			assert.equal(typeof window.end, "number");
			assert.equal(typeof window.index, "number");
			assert.ok(
				typeof window.start === "number" &&
					typeof window.end === "number" &&
					typeof window.index === "number",
			);
			const count = (calls.get(window.index) ?? 0) + 1;
			calls.set(window.index, count);
			const timestamp =
				window.start + Math.min(15.475, (window.end - window.start) / 2);
			return {
				events: [
					{
						start: timestamp,
						end: window.index === 1 && count === 1 ? timestamp - 1 : timestamp,
						event_type: "observation",
						description: "Test fixture: a grounded single-frame observation.",
						objects: [],
						confidence: 0.9,
						source: "video",
						importance: "medium",
						evidence_times: [timestamp],
						preserve_audio: false,
					},
				],
				uncertainties: [],
			};
		},
	};
	const base = {
		provider,
		progress: async () => {},
		signal: AbortSignal.timeout(60000),
	};
	try {
		await assert.rejects(
			runStoryAction({
				...base,
				input: {
					projectId,
					action: "analyze",
					videoPath: proxy,
					sourceSignature: "six-windows",
				},
			}),
			/Sự kiện 1 của cửa sổ 2/,
		);
		assert.equal((await readStoryProject(projectId))!.analyzed_windows, 1);
		await assert.rejects(
			runStoryAction({ ...base, input: { projectId, action: "story" } }),
			/Test stops after completed video analysis/,
		);
		const resumed = (await readStoryProject(projectId))!;
		assert.equal(resumed.windows.length, 6);
		assert.equal(resumed.analyzed_windows, 6);
		assert.equal(
			calls.get(0),
			1,
			"the successful first window is not analyzed again",
		);
		assert.equal(calls.get(1), 2, "only the failed second window is retried");
		assert.equal(resumed.events.length, 6);
		assert.equal(resumed.events[1].start, 45);
		assert.equal(resumed.events[1].end, 45);
		assert.equal(resumed.events[1].instantaneous, true);
	} finally {
		await fs.rm(projectRoot, { recursive: true, force: true });
	}
});

test("shared Rust schema rejects contradictory references before any API call", async () => {
	await assert.rejects(
		storyEngine<StoryDocument>({
			operation: "validate_story",
			story: { title: "x", summary: "x", outcome: "success", paragraphs: [] },
			events: [],
		}),
	);
});

test("background jobs reject concurrent edits, cancel provider work, and keep completed preprocessing", async () => {
	const projectId = `story-test-${randomUUID()}`;
	const { proxy, projectRoot } = await sourceFixture({
		projectId,
		audio: false,
	});
	let notifyStarted!: () => void;
	const started = new Promise<void>((resolve) => {
		notifyStarted = resolve;
	});
	const provider: StoryAIProvider = {
		cacheIdentity: "cancel-test",
		supportsVideoAudio: false,
		async request({ signal }) {
			notifyStarted();
			await new Promise<void>((_resolve, reject) => {
				signal.addEventListener("abort", () => reject(signal.reason), {
					once: true,
				});
			});
			return {};
		},
	};
	try {
		const job = await startStoryJob({
			input: {
				projectId,
				action: "analyze",
				videoPath: proxy,
				sourceSignature: "cancel-source",
			},
			dependencies: { provider },
		});
		assert.equal(job.status, "running");
		await started;
		await assert.rejects(
			editStoryProject({
				projectId,
				revision: 0,
				segmentId: "s1",
				patch: { locked: true },
			}),
			/job hiện tại/,
		);
		await cancelStoryJob(projectId);
		for (let i = 0; i < 100; i++) {
			const state = await getStoryState(projectId);
			if (state.job?.status === "cancelled") break;
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		assert.equal((await getStoryState(projectId)).job!.status, "cancelled");
		assert.ok(
			(await readStoryProject(projectId))!.windows.length,
			"preprocessing checkpoint survives cancellation",
		);
	} finally {
		await cancelStoryJob(projectId);
		await fs.rm(projectRoot, { recursive: true, force: true });
	}
});

test("the existing VieNeu provider aborts without retrying a cancelled request", async () => {
	let calls = 0;
	const provider = new VieNeuTTSProvider({
		cacheDirectory: false,
		fetchImpl: Object.assign(
			async (_url: unknown, init?: RequestInit) => {
				calls++;
				const signal = init!.signal!;
				await new Promise<void>((_resolve, reject) => {
					signal.addEventListener("abort", () => reject(signal.reason), {
						once: true,
					});
				});
				return new Response();
			},
			{ preconnect: fetch.preconnect },
		),
	});
	const controller = new AbortController();
	const pending = provider.generateSpeech({
		text: "Thử giọng.",
		voice: "Hải Đăng",
		outputPath: "unused-test-path.wav",
		signal: controller.signal,
	});
	setTimeout(() => controller.abort(), 30);
	await assert.rejects(pending);
	assert.equal(calls, 1);
});

test("the shared upload route retains original sound only when Story mode is explicitly selected", async () => {
	const projectId = `story-test-${randomUUID()}`;
	const { proxy, projectRoot } = await sourceFixture({
		projectId,
		audio: true,
	});
	try {
		const form = new FormData();
		form.set(
			"video",
			new File([await fs.readFile(proxy)], "source.mp4", { type: "video/mp4" }),
		);
		form.set("projectId", projectId);
		form.set("start", "0.5");
		form.set("duration", "2");
		form.set("purpose", "story");
		const response = await uploadSource(
			new NextRequest("http://localhost/api/localization/sources", {
				method: "POST",
				body: form,
			}),
		);
		assert.equal(response.status, 201);
		const data = await response.json();
		const metadata = JSON.parse(
			await fs.readFile(
				path.join(path.dirname(data.videoPath), "source.json"),
				"utf8",
			),
		);
		const original = await FFmpegService.probeVideo(metadata.originalPath);
		const analysis = await FFmpegService.probeVideo(data.videoPath);
		assert.equal(original.hasAudio, true);
		assert.equal(analysis.hasAudio, true);
		assert.equal(original.width, 96);
		assert.equal(analysis.fps, 8);
		assert.ok(Math.abs(original.duration - 2) < 0.1);
	} finally {
		await fs.rm(projectRoot, { recursive: true, force: true });
	}
});

test("Story API rejects invalid identifiers and malformed JSON before creating a job", async () => {
	const invalidId = await getStoryAPI(
		new NextRequest(
			"http://localhost/api/localization/story?projectId=../secret",
		),
	);
	assert.equal(invalidId.status, 400);
	const malformed = await postStoryAPI(
		new NextRequest("http://localhost/api/localization/story", {
			method: "POST",
			body: "not JSON",
		}),
	);
	assert.equal(malformed.status, 400);
	const unknownAction = await postStoryAPI(
		new NextRequest("http://localhost/api/localization/story", {
			method: "POST",
			body: JSON.stringify({ projectId: "story-test", action: "delete-all" }),
		}),
	);
	assert.equal(unknownAction.status, 400);
});
