import type { EditorCore } from "@/core";
import { createSplitPlanner, type SplitPlanner } from "@/split-video/core";
import type {
	CreatedSplitProject,
	DownloadedVideo,
	SplitJob,
	SplitResult,
} from "@/split-video/types";
import type { SplitDraft } from "./drafts";
import { storageService } from "@/services/storage/service";
import { createFilmstripSource } from "@/media/filmstrip";

interface ApiStatus {
	success: boolean;
	error?: string;
}
let plannerPromise: Promise<SplitPlanner> | undefined;
export function loadBrowserSplitPlanner() {
	plannerPromise ??= fetch("/api/source/split/core")
		.then(async (response) => {
			if (!response.ok)
				throw new Error(
					"Không tải được module chia video. Chạy bun run build:split-video.",
				);
			return createSplitPlanner({ bytes: await response.arrayBuffer() });
		})
		.catch((error: unknown) => {
			plannerPromise = undefined;
			throw error;
		});
	return plannerPromise;
}

export async function listDownloadedVideos({
	signal,
}: {
	signal: AbortSignal;
}) {
	const response = await fetch("/api/source/list-downloads", { signal });
	const data: ApiStatus & { videos: DownloadedVideo[]; warnings: string[] } =
		await response.json();
	if (!response.ok || !data.success)
		throw new Error(data.error ?? "Không tải được danh sách video.");
	return data;
}

export async function splitVideo({
	batchId,
	sourceVideoPath,
	cuts,
	baseName,
	signal,
	onJob,
}: {
	batchId: string;
	sourceVideoPath: string;
	cuts: number[];
	baseName: string;
	signal: AbortSignal;
	onJob?: (job: SplitJob) => void;
}): Promise<SplitResult> {
	const response = await fetch("/api/source/split", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		signal,
		body: JSON.stringify({ batchId, sourceVideoPath, cuts, baseName }),
	});
	const data: ApiStatus & { job: SplitJob } = await response.json();
	if (!response.ok || !data.success)
		throw new Error(data.error ?? "Không chia được video.");
	let job = data.job;
	for (;;) {
		signal.throwIfAborted();
		onJob?.(job);
		if ((job.status === "ready" || job.status === "completed") && job.result)
			return job.result;
		if (job.status === "paused" || job.status === "error")
			throw new Error(
				job.error ?? "Phiên chia video tạm dừng. Các mốc đã lưu để tiếp tục.",
			);
		await new Promise<void>((resolve, reject) => {
			const onAbort = () => {
				clearTimeout(timer);
				reject(signal.reason);
			};
			const timer = setTimeout(() => {
				signal.removeEventListener("abort", onAbort);
				resolve();
			}, 1000);
			signal.addEventListener("abort", onAbort, { once: true });
		});
		job = await getSplitJob({ batchId, signal });
	}
}

export async function getSplitJob({
	batchId,
	signal,
}: {
	batchId: string;
	signal?: AbortSignal;
}) {
	const response = await fetch(
		`/api/source/split?batchId=${encodeURIComponent(batchId)}`,
		{ signal, cache: "no-store" },
	);
	const data: ApiStatus & { job: SplitJob } = await response.json();
	if (!response.ok || !data.success)
		throw new Error(data.error ?? "Không đọc được phiên chia video.");
	return data.job;
}
export async function listSplitJobs({ signal }: { signal?: AbortSignal } = {}) {
	const response = await fetch("/api/source/split?jobs=1", {
		signal,
		cache: "no-store",
	});
	const data: ApiStatus & { jobs: SplitJob[] } = await response.json();
	if (!response.ok || !data.success)
		throw new Error(data.error ?? "Không đọc được các phiên chia video.");
	return data.jobs;
}
export async function saveSplitDraft({ draft }: { draft: SplitDraft }) {
	const response = await fetch("/api/source/split", {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		keepalive: true,
		body: JSON.stringify({
			batchId: draft.batchId,
			sourceVideoPath: draft.video.path,
			cuts: draft.cuts.map((cut) => cut.time),
			baseName: draft.baseName,
			revision: draft.revision,
			baseRevision: draft.baseRevision ?? 0,
			editorId: draft.editorId,
			draftStep: draft.step,
		}),
	});
	const data: ApiStatus & { job: SplitJob } = await response.json();
	if (!response.ok || !data.success)
		throw new Error(data.error ?? "Không lưu được bản nháp chia video.");
	return data.job;
}
async function updateSplitJob({
	batchId,
	action,
	project,
}: {
	batchId: string;
	action: "checkpoint" | "complete" | "pause";
	project?: CreatedSplitProject;
}) {
	const response = await fetch("/api/source/split", {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		keepalive: true,
		body: JSON.stringify({ batchId, action, project }),
	});
	const data: ApiStatus & { job: SplitJob } = await response.json();
	if (!response.ok || !data.success)
		throw new Error(data.error ?? "Không lưu được trạng thái chia video.");
	return data.job;
}
export function pauseSplitBatch({ batchId }: { batchId: string }) {
	return updateSplitJob({ batchId, action: "pause" });
}
export function completeSplitBatch({ batchId }: { batchId: string }) {
	return updateSplitJob({ batchId, action: "complete" });
}

export async function cleanupSplitBatch({ batchId }: { batchId: string }) {
	const response = await fetch(
		`/api/source/split?batchId=${encodeURIComponent(batchId)}`,
		{ method: "DELETE", keepalive: true },
	);
	if (!response.ok) throw new Error("Không dọn được file chia video tạm.");
}

export type { CreatedSplitProject } from "@/split-video/types";
export interface SplitImportStage {
	index: number;
	total: number;
	phase: "waiting" | "download" | "thumbnail" | "persist";
	receivedBytes?: number;
	totalBytes?: number;
}

export async function splitProjectsAlreadySaved({
	result,
}: {
	result: SplitResult;
}) {
	for (const part of result.parts) {
		if (
			!(await storageService.loadProject({
				id: `split-${result.batchId}-${part.index}`,
			}))
		)
			return false;
	}
	return result.parts.length > 0;
}
async function importSplitProjects({
	result,
	baseName,
	editor,
	signal,
	onProgress,
	onStage,
}: {
	result: SplitResult;
	baseName: string;
	editor: EditorCore;
	signal: AbortSignal;
	onProgress: (value: {
		completed: number;
		total: number;
		created: CreatedSplitProject[];
	}) => void;
	onStage?: (stage: SplitImportStage) => void;
}) {
	const created: CreatedSplitProject[] = [];
	const failures: string[] = [];
	for (const [offset, part] of result.parts.entries()) {
		if (signal.aborted) break;
		const name = `${baseName.trim()} - Part ${part.index}`;
		const projectId = `split-${result.batchId}-${part.index}`;
		try {
			const existing = await storageService.loadProject({ id: projectId });
			if (existing) {
				const project = {
					id: projectId,
					index: part.index,
					name: existing.project.metadata.name,
				};
				created.push(project);
				await updateSplitJob({
					batchId: result.batchId,
					action: "checkpoint",
					project,
				});
				continue;
			}
			const capacity = await storageService.canStoreFile({ size: part.size });
			if (!capacity.canStore) {
				failures.push(
					"Không đủ dung lượng trình duyệt để lưu các đoạn còn lại.",
				);
				break;
			}
			const response = await fetch(part.downloadUrl, { signal });
			if (!response.ok) throw new Error(`Không tải được đoạn ${part.index}.`);
			onStage?.({
				index: part.index,
				total: result.parts.length,
				phase: "download",
				receivedBytes: 0,
				totalBytes: part.size,
			});
			let receivedBytes = 0;
			let lastReported = 0;
			const monitored = response.body?.pipeThrough(
				new TransformStream<Uint8Array, Uint8Array>({
					transform(chunk, controller) {
						receivedBytes += chunk.byteLength;
						const now = performance.now();
						if (now - lastReported >= 250 || receivedBytes >= part.size) {
							lastReported = now;
							onStage?.({
								index: part.index,
								total: result.parts.length,
								phase: "download",
								receivedBytes,
								totalBytes: part.size,
							});
						}
						controller.enqueue(chunk);
					},
				}),
			);
			const blob = monitored
				? await new Response(monitored, {
						headers: { "Content-Type": "video/mp4" },
					}).blob()
				: await response.blob();
			if (blob.size !== part.size) throw new Error(`File đoạn ${part.index} tải chưa đủ dữ liệu. Mốc cắt và file nguồn vẫn được giữ để thử lại.`);
			const file = new File([blob], `${name}.mp4`, {
				type: "video/mp4",
			});
			signal.throwIfAborted();
			let thumbnailUrl: string | undefined;
			onStage?.({
				index: part.index,
				total: result.parts.length,
				phase: "thumbnail",
			});
			const thumbnailSource = createFilmstripSource({
				file,
				width: 320,
				height: 180,
			});
			try {
				thumbnailUrl = (await thumbnailSource.getFrame({ time: 0 }))?.toDataURL(
					"image/jpeg",
					0.8,
				);
			} catch {
				/* Browser codec availability does not prevent storing the project. */
			} finally {
				thumbnailSource.dispose();
			}
			signal.throwIfAborted();
			onStage?.({
				index: part.index,
				total: result.parts.length,
				phase: "persist",
			});
			const id = await editor.project.createProjectFromVideo({
				id: projectId,
				name,
				asset: {
					id: `split-media-${result.batchId}-${part.index}`,
					name: file.name,
					type: "video",
					file,
					thumbnailUrl,
					duration: part.duration,
					width: part.width,
					height: part.height,
					fps: part.fps,
					hasAudio: part.hasAudio,
				},
			});
			created.push({ id, index: part.index, name });
			await updateSplitJob({
				batchId: result.batchId,
				action: "checkpoint",
				project: { id, index: part.index, name },
			});
		} catch (error: unknown) {
			if (signal.aborted) break;
			failures.push(
				`${name}: ${error instanceof Error ? error.message : "Không lưu được project."}`,
			);
			if (storageService.isQuotaExceededError({ error })) break;
		} finally {
			onProgress({
				completed: offset + 1,
				total: result.parts.length,
				created: [...created],
			});
		}
	}
	return { created, failures, cancelled: signal.aborted };
}

export async function createProjectsFromSplits(
	options: Parameters<typeof importSplitProjects>[0],
) {
	if (!navigator.locks) return importSplitProjects(options);
	options.onStage?.({ index: 1, total: options.result.parts.length, phase: "waiting" });
	return navigator.locks.request(
		`split-import-${options.result.batchId}`,
		{ signal: options.signal },
		async (lock) => {
			if (!lock)
				throw new Error(
					"Phiên này đang được lưu ở tab khác. Các mốc cắt vẫn được giữ lại.",
				);
			return importSplitProjects(options);
		},
	);
}
