import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { FFmpegService } from "@/media/ffmpeg";
import {
	resolveNarrationSource,
	retainNarrationSource,
} from "@/localization/source";
import { createDefaultTTSProvider } from "@/providers/tts/service";
import type { TTSProvider } from "@/providers/tts/types";
import { storyEngine } from "./engine";
import { ConfiguredStoryProvider, type StoryAIProvider } from "./provider";
import { inspectStoryVideo, readStoryWindow, renderStoryVideo } from "./media";
import {
	readStoryJob,
	readStoryProject,
	saveStoryProject,
	storyDirectory,
	writeStoryJSON,
} from "./storage";
import type {
	StoryDefaults,
	StoryDocument,
	StoryEvent,
	StoryJob,
	StoryProject,
	StorySegment,
} from "./types";

export class StoryRequestError extends Error {
	// eslint-disable-next-line opencut/prefer-object-params -- Keep the existing Error(message, status) convention.
	constructor(
		message: string,
		readonly status = 422,
	) {
		super(message);
	}
}
export interface StoryAction {
	projectId: string;
	action: "analyze" | "story" | "review" | "tts" | "rewrite" | "render";
	videoPath?: string;
	sourceSignature?: string;
	timelineStart?: number;
	sourceElementId?: string;
	settings?: unknown;
	voice?: string;
	segmentId?: string;
	revision?: number;
	mix?: StoryProject["mix"];
}
type Running = { job: StoryJob; controller: AbortController };
const globalJobs = globalThis as typeof globalThis & {
	__storyJobs?: Map<string, Running>;
};
const jobs = (globalJobs.__storyJobs ??= new Map<string, Running>());

export async function getStoryState(projectId: string) {
	const [project, storedJob, defaults] = await Promise.all([
		readStoryProject(projectId),
		readStoryJob(projectId),
		storyEngine<StoryDefaults>({ operation: "defaults" }),
	]);
	let job: StoryJob | null = jobs.get(projectId)?.job ?? storedJob;
	if (job?.status === "running" && !jobs.has(projectId))
		job = {
			...job,
			status: "failed",
			error:
				"Tiến trình máy chủ đã dừng. Chạy lại để tiếp tục các bước đã lưu.",
		};
	return { project, job, defaults };
}
export async function cancelStoryJob(projectId: string) {
	jobs.get(projectId)?.controller.abort();
}

async function requireProject({
	projectId,
	revision,
}: {
	projectId: string;
	revision?: number;
}) {
	const project = await readStoryProject(projectId);
	if (!project)
		throw new StoryRequestError("Phân tích video trước khi tiếp tục.", 404);
	if (revision !== undefined && project.revision !== revision)
		throw new StoryRequestError(
			"Project đã thay đổi. Tải lại bản mới trước khi lưu.",
			409,
		);
	return project;
}
export async function editStoryProject({
	projectId,
	revision,
	segmentId,
	patch,
	story,
}: {
	projectId: string;
	revision: number;
	segmentId?: string;
	patch?: Record<string, unknown>;
	story?: unknown;
}) {
	if (jobs.has(projectId))
		throw new StoryRequestError(
			"Chờ hoặc hủy job hiện tại trước khi chỉnh sửa.",
			409,
		);
	// Reserve the project through the full read/validate/write transaction.
	jobs.set(projectId, {
		job: {
			id: randomUUID(),
			status: "running",
			stage: "Lưu chỉnh sửa",
			progress: 0,
		},
		controller: new AbortController(),
	});
	try {
		const project = await requireProject({ projectId, revision });
		const updated = await storyEngine<StoryProject>(
			story
				? { operation: "save_story", project, story }
				: { operation: "edit", project, segment_id: segmentId, patch },
		);
		await saveStoryProject(updated);
		return updated;
	} finally {
		jobs.delete(projectId);
	}
}

export async function startStoryJob({
	input,
	dependencies = {},
}: {
	input: StoryAction;
	dependencies?: { provider?: StoryAIProvider; tts?: TTSProvider };
}) {
	const defaults = await storyEngine<StoryDefaults>({ operation: "defaults" });
	if (jobs.has(input.projectId))
		throw new StoryRequestError(
			"Project đang có job chạy. Chờ hoặc hủy job đó.",
			409,
		);
	if (jobs.size >= defaults.limits.max_jobs)
		throw new StoryRequestError("Đang xử lý video khác. Thử lại sau.", 429);
	const controller = new AbortController();
	const job: StoryJob = {
		id: randomUUID(),
		status: "running",
		stage: "Chuẩn bị",
		progress: 0,
	};
	jobs.set(input.projectId, { job, controller });
	try {
		await writeStoryJSON({
			projectId: input.projectId,
			name: "job.json",
			value: job,
		});
	} catch (error) {
		jobs.delete(input.projectId);
		throw error;
	}
	const signal = AbortSignal.any([
		controller.signal,
		AbortSignal.timeout(defaults.limits.job_timeout_ms),
	]);
	const progress = async ({
		stage,
		percent,
	}: {
		stage: string;
		percent: number;
	}) => {
		signal.throwIfAborted();
		job.stage = stage;
		job.progress = percent;
		await writeStoryJSON({
			projectId: input.projectId,
			name: "job.json",
			value: job,
		});
	};
	void runStoryAction({ input, signal, progress, ...dependencies })
		.then(() => {
			job.status = "complete";
			job.stage = "Hoàn tất";
			job.progress = 100;
		})
		.catch((error: unknown) => {
			job.status = controller.signal.aborted ? "cancelled" : "failed";
			job.error = signal.aborted
				? controller.signal.aborted
					? "Đã hủy. Các bước hoàn tất đã được lưu."
					: "Quá thời gian xử lý. Chạy lại để tiếp tục."
				: error instanceof Error
					? error.message
					: "Không xử lý được Story Narrator.";
		})
		.finally(async () => {
			try {
				await writeStoryJSON({
					projectId: input.projectId,
					name: "job.json",
					value: job,
				});
			} catch (error) {
				console.error("Cannot save story job status", error);
			} finally {
				jobs.delete(input.projectId);
			}
		});
	return job;
}

/** Platform runtime: media IO, provider calls and atomic checkpoints. Policy is Rust. */
export async function runStoryAction({
	input,
	signal,
	progress,
	provider = new ConfiguredStoryProvider(),
	tts,
}: {
	input: StoryAction;
	signal: AbortSignal;
	progress: (input: { stage: string; percent: number }) => Promise<void>;
	provider?: StoryAIProvider;
	tts?: TTSProvider;
}) {
	const directory = storyDirectory(input.projectId);
	const defaults = await storyEngine<StoryDefaults>({ operation: "defaults" });
	await fs.mkdir(directory, { recursive: true });
	let project = await readStoryProject(input.projectId);
	if (
		input.revision !== undefined &&
		project &&
		input.revision !== project.revision
	)
		throw new StoryRequestError("Project đã thay đổi. Tải lại bản mới.", 409);
	const checkpoint = async () => {
		signal.throwIfAborted();
		project!.revision++;
		await saveStoryProject(project!);
	};
	if (input.action === "analyze" || input.action === "story") {
		if (input.action === "analyze") {
			if (!input.videoPath || !input.sourceSignature)
				throw new StoryRequestError("Thiếu video đã chọn.");
			const source = await resolveNarrationSource(
				input.projectId,
				input.videoPath,
			);
			const release = retainNarrationSource(source);
			try {
				const metadata = JSON.parse(
					await fs.readFile(
						path.join(path.dirname(source), "source.json"),
						"utf8",
					),
				);
				if (!metadata.originalPath)
					throw new StoryRequestError(
						"Chuẩn bị nguồn ở chế độ Story để giữ âm thanh gốc.",
					);
				const original = await resolveNarrationSource(
					input.projectId,
					metadata.originalPath,
				);
				const identity = createHash("sha256")
					.update(
						JSON.stringify([
							input.sourceSignature,
							provider.cacheIdentity,
							"story-v1",
						]),
					)
					.digest("hex");
				const assets = path.join(directory, identity);
				await fs.mkdir(assets, { recursive: true });
				const videoPath = path.join(assets, "analysis.mp4");
				const originalPath = path.join(assets, "original.mp4");
				if (project?.analysis_key !== identity) {
					await progress({ stage: "Lưu nguồn video và âm thanh", percent: 3 });
					if (project)
						await writeStoryJSON({
							projectId: input.projectId,
							name: `snapshot-${randomUUID()}.json`,
							value: project,
						});
					await fs.copyFile(source, videoPath);
					await fs.copyFile(original, originalPath);
				}
				const probe = await FFmpegService.probeVideo({
					filePath: originalPath,
					signal,
				});
				project = await storyEngine<StoryProject>({
					operation: "prepare",
					project,
					project_id: input.projectId,
					metadata: probe,
					settings: input.settings ?? project?.settings,
					voice: input.voice || project?.voice || defaults.voice,
					video_path: videoPath,
					original_path: originalPath,
					analysis_key: identity,
					source_signature: input.sourceSignature,
					timeline_start: input.timelineStart ?? 0,
					source_element_id: input.sourceElementId ?? "",
				});
			} finally {
				await release();
			}
		} else {
			if (!project)
				throw new StoryRequestError("Chưa có phân tích video để dùng lại.");
			const previous = project;
			project = await storyEngine<StoryProject>({
				...project,
				operation: "prepare",
				project,
				settings: input.settings ?? project.settings,
			});
			if (previous.story && !project.story)
				await writeStoryJSON({
					projectId: input.projectId,
					name: `snapshot-${randomUUID()}.json`,
					value: previous,
				});
		}
		await checkpoint();
		if (!project!.windows.length) {
			await progress({
				stage: "Đọc metadata và phát hiện chuyển cảnh",
				percent: 5,
			});
			const inspected = await inspectStoryVideo({
				videoPath: project!.video_path,
				duration: project!.duration,
				signal,
			});
			project!.scenes = inspected.scenes;
			project!.windows = inspected.windows;
			await checkpoint();
		}
		for (let i = project!.analyzed_windows; i < project!.windows.length; i++) {
			let window = project!.windows[i];
			await progress({
				stage: `Phân tích diễn biến ${i + 1}/${project!.windows.length}`,
				percent: 10 + (50 * i) / project!.windows.length,
			});
			const temporary = await fs.mkdtemp(path.join(directory, "window-"));
			try {
				const prepared = await readStoryWindow({
					project: project!,
					window,
					directory: temporary,
					supportsVideoAudio: provider.supportsVideoAudio,
					signal,
				});
				window = prepared.window;
				project!.windows[i] = window;
				if (prepared.uncertainty) {
					project!.uncertainties.push(prepared.uncertainty);
					project!.analyzed_windows = i + 1;
					await checkpoint();
					continue;
				}
				const media = prepared.media;
				const audioAvailable =
					project!.metadata.hasAudio && provider.supportsVideoAudio;
				const result = await provider.request({
					stage: "events",
					context: {
						window,
						duration: project!.duration,
						previous_events: project!.events.slice(-40),
						audio_available: audioAvailable,
					},
					media,
					signal,
				});
				const parsed = await storyEngine<{
					events: StoryEvent[];
					uncertainties: string[];
				}>({
					operation: "validate_events",
					result,
					window,
					duration: project!.duration,
					audio_available: audioAvailable,
					video_available: provider.supportsVideoAudio,
				});
				project!.events.push(...parsed.events);
				project!.uncertainties.push(...parsed.uncertainties);
				project!.analyzed_windows = i + 1;
				if (
					!provider.supportsVideoAudio &&
					project!.metadata.hasAudio &&
					!project!.warnings.length
				)
					project!.warnings.push(
						"Provider hiện tại chỉ nhận ảnh. Chưa kiểm chứng tiếng động hoặc lời nói; cần nghe nguồn và duyệt các khoảng giữ âm trước khi xuất.",
					);
				await checkpoint();
			} finally {
				await fs.rm(temporary, { recursive: true, force: true });
			}
		}
		if (!project!.story) {
			await progress({
				stage: "Hiểu câu chuyện tổng thể và xây dựng kịch bản",
				percent: 65,
			});
			const story = await provider.request({
				stage: "story",
				context: {
					duration: project!.duration,
					events: project!.events,
					uncertainties: project!.uncertainties,
					settings: project!.settings,
				},
				signal,
			});
			project!.story = await storyEngine<StoryDocument>({
				operation: "validate_story",
				events: project!.events,
				story,
			});
			await checkpoint();
		}
		if (!project!.segments.length) {
			await progress({ stage: "Đồng bộ câu chuyện với timeline", percent: 80 });
			const result = await provider.request({
				stage: "segments",
				context: project,
				signal,
			});
			if (!result || typeof result !== "object" || !("segments" in result))
				throw new StoryRequestError("AI chưa trả timeline hợp lệ.");
			project!.segments = await storyEngine<StorySegment[]>({
				...project,
				operation: "validate_segments",
				segments: result.segments,
			});
			project!.review = await storyEngine({ ...project, operation: "review" });
			await checkpoint();
		}
	}
	if (!project)
		throw new StoryRequestError("Chưa có project Story Narrator.", 404);
	const qualityReview = async () => {
		project!.review = await storyEngine({ ...project, operation: "review" });
		if (!project!.ai_review) {
			await progress({
				stage: "Kiểm tra mạch truyện, bằng chứng và nhịp kể",
				percent: 90,
			});
			const result = await provider.request({
				stage: "review",
				context: project,
				signal,
			});
			project!.ai_review = await storyEngine({
				operation: "validate_review",
				result,
				segments: project!.segments,
			});
		}
		await checkpoint();
	};
	if (["analyze", "story", "review", "tts", "rewrite"].includes(input.action))
		await qualityReview();
	if (input.action === "rewrite") {
		const segment = project.segments.find(
			(s) => s.segment_id === input.segmentId,
		);
		if (!segment) throw new StoryRequestError("Không tìm thấy segment.");
		if (segment.locked)
			throw new StoryRequestError("Mở khóa segment trước khi tạo lại lời.");
		const result = await provider.request({
			stage: "rewrite",
			context: {
				project,
				segment,
				slot_duration:
					segment.end_time -
					segment.start_time -
					segment.pause_before -
					segment.pause_after,
			},
			signal,
		});
		const text = await storyEngine<string>({
			operation: "rewrite_text",
			result,
		});
		project = await storyEngine<StoryProject>({
			operation: "edit",
			project,
			segment_id: segment.segment_id,
			patch: { narration_text: text },
		});
		await checkpoint();
		await qualityReview();
	}
	if (input.action === "tts") {
		if (project.settings.language !== "vi")
			throw new StoryRequestError(
				"TTS VieNeu hiện có hỗ trợ tiếng Việt. Chọn ngôn ngữ vi để tạo giọng.",
			);
		project = await storyEngine<StoryProject>({
			operation: "voice",
			project,
			voice: input.voice || project.voice,
		});
		await checkpoint();
		if (
			!project.review?.can_synthesize ||
			project.ai_review?.issues.some((issue) => issue.severity === "error")
		)
			throw new StoryRequestError(
				"Sửa các lỗi trong Script Quality Review trước khi tạo TTS.",
			);
		const voiceProvider = tts ?? createDefaultTTSProvider();
		const targets = input.segmentId
			? project.segments.filter((s) => s.segment_id === input.segmentId)
			: project.segments;
		if (!targets.length)
			throw new StoryRequestError("Không tìm thấy segment để tạo giọng.");
		const targetIds = targets.map((s) => s.segment_id);
		for (const [index, id] of targetIds.entries()) {
			let segment = project.segments.find((s) => s.segment_id === id)!;
			if (segment.audio && !input.segmentId) continue;
			await progress({
				stage: `Tạo và đo TTS ${index + 1}/${targetIds.length}`,
				percent: 5 + (85 * index) / targetIds.length,
			});
			let slot =
				segment.end_time -
				segment.start_time -
				segment.pause_before -
				segment.pause_after;
			for (let attempt = 0; attempt <= defaults.limits.max_shorten; attempt++) {
				const token = randomUUID();
				const rawPath = path.join(directory, `tts-${token}.wav`);
				const result = await voiceProvider.generateSpeech({
					text: segment.narration_text,
					voice: project.voice,
					speed: segment.speaking_rate,
					outputPath: rawPath,
					signal,
				});
				const measured = await FFmpegService.probeVideo({
					filePath: result.audioPath,
					signal,
				});
				let fitted = await storyEngine<{ action: string; tempo: number }>({
					operation: "fit",
					actual_duration: measured.duration,
					slot_duration: slot,
					attempt,
					locked: segment.locked,
					speaking_rate: segment.speaking_rate,
				});
				if (fitted.action === "shorten") {
					const rewritten = await provider.request({
						stage: "rewrite",
						context: {
							project,
							segment,
							slot_duration: slot,
							actual_duration: measured.duration,
						},
						signal,
					});
					const text = await storyEngine<string>({
						operation: "rewrite_text",
						result: rewritten,
					});
					project = await storyEngine<StoryProject>({
						operation: "edit",
						project,
						segment_id: id,
						patch: { narration_text: text },
					});
					segment = project.segments.find((s) => s.segment_id === id)!;
					await checkpoint();
					await qualityReview();
					if (
						!project.review?.can_synthesize ||
						project.ai_review?.issues.some(
							(issue) => issue.severity === "error",
						)
					)
						throw new StoryRequestError(
							"Lời rút gọn cần sửa theo Quality Review.",
						);
					continue;
				}
				if (fitted.action === "overflow" && !segment.locked) {
					project = await storyEngine<StoryProject>({
						operation: "extend_slot",
						project,
						segment_id: id,
						actual_duration: measured.duration,
					});
					segment = project.segments.find((s) => s.segment_id === id)!;
					slot =
						segment.end_time -
						segment.start_time -
						segment.pause_before -
						segment.pause_after;
					fitted = await storyEngine({
						operation: "fit",
						actual_duration: measured.duration,
						slot_duration: slot,
						attempt: 1,
						locked: segment.locked,
						speaking_rate: segment.speaking_rate,
					});
					await checkpoint();
					if (fitted.action !== "overflow") {
						await qualityReview();
						if (
							!project.review?.can_synthesize ||
							project.ai_review?.issues.some(
								(issue) => issue.severity === "error",
							)
						)
							throw new StoryRequestError(
								"Khoảng thời gian mới cần duyệt lại theo Quality Review.",
							);
					}
				}
				if (fitted.action === "overflow")
					throw new StoryRequestError(
						`Đoạn ${id}: TTS ${measured.duration.toFixed(2)}s vượt slot ${slot.toFixed(2)}s sau khi thử rút gọn. Rút ngắn lời hoặc sửa mốc thời gian; các đoạn khác đã được lưu.`,
					);
				const fittedPath = path.join(directory, `voice-${token}.wav`);
				await FFmpegService.runCommand(
					"ffmpeg",
					[
						"-y",
						"-i",
						result.audioPath,
						"-af",
						`atempo=${fitted.tempo}`,
						"-c:a",
						"pcm_s16le",
						fittedPath,
					],
					{ signal },
				);
				const actual = await FFmpegService.probeVideo({
					filePath: fittedPath,
					signal,
				});
				if (actual.duration > slot + 0.015)
					throw new StoryRequestError(
						`Đoạn ${id} vẫn vượt slot sau điều chỉnh. Cần rút ngắn lời.`,
					);
				segment.audio = {
					path: fittedPath,
					url: mediaURL(fittedPath),
					duration: actual.duration,
					original_duration: measured.duration,
					tempo: fitted.tempo,
					text: segment.narration_text,
					voice: project.voice,
					speaking_rate: segment.speaking_rate,
				};
				delete project.render;
				project.revision++;
				await checkpoint();
				break;
			}
		}
	}
	if (input.action === "render") {
		project.review = await storyEngine({ ...project, operation: "review" });
		if (
			project.ai_review?.issues.some((issue) => issue.severity === "error") ||
			!project.ai_review
		)
			throw new StoryRequestError("Chạy Quality Review trước khi xuất video.");
		if (input.mix) project.mix = input.mix;
		await progress({
			stage: "Đang mix audio, ducking và xuất video",
			percent: 10,
		});
		const output = path.join(directory, `render-${randomUUID()}.mp4`);
		try {
			await renderStoryVideo({ project, output, signal });
		} catch (error) {
			await fs.rm(output, { force: true });
			throw error;
		}
		const captionsPath = output.replace(/\.mp4$/, ".vtt");
		await fs.writeFile(
			captionsPath,
			await storyEngine<string>({
				operation: "captions",
				segments: project.segments,
			}),
		);
		project.render = {
			path: output,
			url: mediaURL(output),
			revision: project.revision + 1,
			captions_url: mediaURL(captionsPath),
		};
		await checkpoint();
	}
	return project;
}
function mediaURL(file: string) {
	return `/api/media/stream?file=${encodeURIComponent(file)}`;
}
