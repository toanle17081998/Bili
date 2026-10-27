import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { FFmpegService } from "@/media/ffmpeg";
import { storyEngine } from "./engine";
import { readStoryFrameIndex } from "./frame-index";
import { readStoryProject, saveStoryProject, storyDirectory } from "./storage";
import { inspectStoryVideo } from "./media";
import { runStoryAction } from "./service";
import type { StoryAIProvider } from "./provider";
import type { StoryEvent, StoryProject } from "./types";

test("cached window 6/6 decodes its final real JPEG when audio outlasts the video and keeps all five checkpoints", async () => {
	const projectId = `story-test-${randomUUID()}`;
	const root = storyDirectory(projectId);
	const projectRoot = path.dirname(root);
	const mediaRoot = path.join(root, "test-media");
	await fs.mkdir(mediaRoot, { recursive: true });
	const videoPath = path.join(mediaRoot, "analysis.mp4");
	const signal = AbortSignal.timeout(60000);
	try {
		// Same stream boundary as the reported video: video duration 176.625s,
		// last frame PTS 176.500s, audio/container extends beyond the video.
		await FFmpegService.runCommand(
			"ffmpeg",
			[
				"-y",
				"-f",
				"lavfi",
				"-i",
				"testsrc2=size=96x64:rate=8:duration=176.625",
				"-f",
				"lavfi",
				"-i",
				"sine=frequency=220:duration=176.703667",
				"-c:v",
				"libx264",
				"-preset",
				"ultrafast",
				"-c:a",
				"aac",
				videoPath,
			],
			{ signal },
		);
		const inspected = await inspectStoryVideo({ videoPath, signal });
		assert.ok(inspected.metadata.duration > inspected.metadata.videoDuration!);
		const project = await storyEngine<StoryProject>({
			operation: "prepare",
			project_id: projectId,
			metadata: inspected.metadata,
			video_path: videoPath,
			original_path: videoPath,
			source_signature: "test-audio-tail",
			analysis_key: "test-audio-tail",
			timeline_start: 0,
			source_element_id: "test-source",
			voice: "Hải Đăng",
		});
		project.windows = inspected.windows;
		project.scenes = inspected.scenes;
		project.analyzed_windows = 5;
		const previousEvents: StoryEvent[] = Array.from(
			{ length: 5 },
			(_, index) => ({
				id: `w${index}_e0`,
				start: index * 30,
				end: index * 30 + 1,
				event_type: "observation",
				description: "Previously completed test fixture.",
				objects: [],
				confidence: 0.9,
				source: "video",
				importance: "medium",
				evidence_times: [index * 30],
				preserve_audio: false,
			}),
		);
		project.events = previousEvents;
		assert.ok(
			project.windows[5].frame_times.at(-1)! > 176.5,
			"the old cached plan asks for a frame after EOF",
		);
		await saveStoryProject(project);
		let modelCalls = 0;
		const provider: StoryAIProvider = {
			cacheIdentity: "test-audio-tail",
			supportsVideoAudio: false,
			async request({ stage, media }) {
				if (stage === "story")
					throw new Error("Test stops after last checkpoint");
				assert.equal(stage, "events");
				modelCalls++;
				assert.ok(media?.length);
				assert.equal(media.at(-1)!.time, 176.5);
				for (const frame of media)
					assert.equal(
						Buffer.from(frame.data, "base64").subarray(0, 2).toString("hex"),
						"ffd8",
					);
				return {
					events: [
						{
							id: "ignored-model-id",
							start: 176.5,
							end: 176.5,
							event_type: "observation",
							description: "Last actual test frame.",
							objects: [],
							confidence: 0.9,
							source: "video",
							importance: "medium",
							evidence_times: [176.5],
							preserve_audio: false,
						},
					],
					uncertainties: [],
				};
			},
		};
		await assert.rejects(
			runStoryAction({
				input: { projectId, action: "story" },
				provider,
				signal,
				progress: async () => {},
			}),
			/Test stops after last checkpoint/,
		);
		const saved = (await readStoryProject(projectId))!;
		assert.equal(saved.analyzed_windows, 6);
		assert.equal(modelCalls, 1);
		assert.deepEqual(saved.events.slice(0, 5), previousEvents);
		assert.deepEqual(saved.windows.slice(0, 5), project.windows.slice(0, 5));
		assert.equal(saved.windows[5].frame_times.at(-1), 176.5);
		assert.equal(saved.events.at(-1)!.id, "w5_e0");

		const cachePath = path.join(mediaRoot, "frame-index.json");
		const before = await fs.readFile(cachePath, "utf8");
		assert.equal(
			(await readStoryFrameIndex({ videoPath, signal })).at(-1),
			176.5,
		);
		assert.equal(
			await fs.readFile(cachePath, "utf8"),
			before,
			"the valid decoded frame index is reused",
		);
		await fs.writeFile(cachePath, "invalid cache JSON");
		assert.equal(
			(await readStoryFrameIndex({ videoPath, signal })).at(-1),
			176.5,
			"a corrupt cache is regenerated from actual media",
		);
	} finally {
		assert.ok(path.basename(projectRoot).startsWith("story-test-"));
		await fs.rm(projectRoot, { recursive: true, force: true });
	}
});
