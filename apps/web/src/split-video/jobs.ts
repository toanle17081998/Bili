import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
	getSplitDirectory,
	planSplitSource,
	removeSplitBatch,
	splitVideoOnServer,
	SplitRequestError,
	hasSplitResult,
	retainSplitResult,
	removeRetainedSplitResult,
} from "./server";
import type { CreatedSplitProject, SplitJob } from "./types";

interface Worker {
	controller: AbortController;
	finished: Promise<void>;
}
declare global {
	// Keep long-running jobs and their file-write queues alive through Next.js hot reload.
	var opencutSplitWorkers: Map<string, Worker> | undefined;
	// Serializes atomic checkpoint writes across hot-reloaded route modules.
	var opencutSplitJobWrites: Map<string, Promise<unknown>> | undefined;
	var opencutSplitTransitions: Map<string, Promise<unknown>> | undefined;
}
const workers = (globalThis.opencutSplitWorkers ??= new Map());
const writes = (globalThis.opencutSplitJobWrites ??= new Map());
const transitions = (globalThis.opencutSplitTransitions ??= new Map());
const root = () => path.resolve(process.cwd(), ".local_storage/split-jobs");

function jobFile({ batchId }: { batchId: string }) {
	getSplitDirectory({ batchId });
	return path.join(root(), `${batchId}.json`);
}

async function transition<T>({
	batchId,
	operation,
}: {
	batchId: string;
	operation: () => Promise<T>;
}): Promise<T> {
	const previous = transitions.get(batchId) ?? Promise.resolve();
	const pending = previous.catch(() => {}).then(operation);
	transitions.set(batchId, pending);
	try {
		return await pending;
	} finally {
		if (transitions.get(batchId) === pending) transitions.delete(batchId);
	}
}
async function assertNotDiscarded({ batchId }: { batchId: string }) {
	try {
		await fs.access(jobFile({ batchId }).replace(/\.json$/, ".discarded"));
	} catch (error: unknown) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT")
			return;
		throw error;
	}
	throw new SplitRequestError({
		message:
			"Phiên chia này đã bị xóa. Không ghi đè hoặc tạo lại từ bản nháp cũ.",
		status: 410,
	});
}
async function readJob({
	batchId,
}: {
	batchId: string;
}): Promise<SplitJob | null> {
	try {
		return JSON.parse(await fs.readFile(jobFile({ batchId }), "utf8"));
	} catch (error: unknown) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT")
			return null;
		throw error;
	}
}
async function updateJob({
	batchId,
	update,
}: {
	batchId: string;
	update: (current: SplitJob | null) => SplitJob;
}) {
	const previous = writes.get(batchId) ?? Promise.resolve();
	const pending = previous
		.catch(() => {})
		.then(async () => {
			const current = await readJob({ batchId });
			const next = update(current);
			await fs.mkdir(root(), { recursive: true });
			const file = jobFile({ batchId });
			const temporary = `${file}.${randomUUID()}.tmp`;
			try {
				await fs.writeFile(temporary, JSON.stringify(next));
				await fs.rename(temporary, file);
			} finally {
				await fs.rm(temporary, { force: true });
			}
			return next;
		});
	writes.set(batchId, pending);
	try {
		return await pending;
	} finally {
		if (writes.get(batchId) === pending) writes.delete(batchId);
	}
}
function requireJob({
	job,
	origin,
}: {
	job: SplitJob | null;
	origin: string;
}): SplitJob {
	if (!job || job.origin !== origin)
		throw new SplitRequestError({
			message: "Không tìm thấy phiên chia video trên địa chỉ này.",
			status: 404,
		});
	return job;
}

async function saveSplitDraftUnlocked({
	batchId,
	sourceVideoPath,
	cuts,
	baseName,
	origin,
	revision,
	draftStep,
	baseRevision = 0,
	editorId,
}: {
	batchId: string;
	sourceVideoPath: string;
	cuts: number[];
	baseName: string;
	origin: string;
	revision: number;
	draftStep: "cuts" | "confirm";
	baseRevision?: number;
	editorId?: string;
}) {
	await assertNotDiscarded({ batchId });
	const existing = await readJob({ batchId });
	if (existing && existing.status !== "draft")
		return requireJob({ job: existing, origin });
	const { video, ranges } = await planSplitSource({ sourceVideoPath, cuts });
	return updateJob({
		batchId,
		update: (current) => {
			if (current) {
				requireJob({ job: current, origin });
				if (current.status !== "draft") return current;
				if (
					current.editorId !== editorId &&
					current.draftRevision !== baseRevision
				) {
					throw new SplitRequestError({
						message:
							"Tab khác đã sửa các mốc cắt. Bản nháp hiện tại được giữ lại; mở lại phiên mới nhất hoặc dùng bản nháp riêng.",
						status: 409,
					});
				}
				if (current.draftRevision >= revision) return current;
			}
			const now = new Date().toISOString();
			return {
				batchId,
				origin,
				video,
				sourceVideoPath,
				cuts,
				baseName,
				status: "draft",
				draftStep,
				draftRevision: revision,
				editorId,
				completedParts: 0,
				totalParts: ranges.length,
				createdProjects: [],
				createdAt: current?.createdAt ?? now,
				updatedAt: now,
			};
		},
	});
}

async function runJob({
	job,
	controller,
}: {
	job: SplitJob;
	controller: AbortController;
}) {
	try {
		await updateJob({
			batchId: job.batchId,
			update: (current) => ({
				...requireJob({ job: current, origin: job.origin }),
				status: "splitting",
				updatedAt: new Date().toISOString(),
			}),
		});
		let lastProgress = 0;
		const result = await splitVideoOnServer({
			batchId: job.batchId,
			sourceVideoPath: job.sourceVideoPath,
			cuts: job.cuts,
			signal: controller.signal,
			onEncoderProgress: (progress) => {
				const now = Date.now();
				if (
					now - lastProgress < 1000 &&
					progress.seconds < progress.partDuration
				)
					return;
				lastProgress = now;
				void updateJob({
					batchId: job.batchId,
					update: (current) => {
						const latest = requireJob({ job: current, origin: job.origin });
						return latest.status === "splitting"
							? {
									...latest,
									encoderProgress: progress,
									updatedAt: new Date().toISOString(),
								}
							: latest;
					},
				}).catch(console.error);
			},
			onProgress: async ({ completed, total }) => {
				await updateJob({
					batchId: job.batchId,
					update: (current) => ({
						...requireJob({ job: current, origin: job.origin }),
						completedParts: completed,
						totalParts: total,
						updatedAt: new Date().toISOString(),
					}),
				});
			},
		});
		await retainSplitResult({ result });
		await updateJob({
			batchId: job.batchId,
			update: (current) => ({
				...requireJob({ job: current, origin: job.origin }),
				status: controller.signal.aborted ? "paused" : "ready",
				result,
				updatedAt: new Date().toISOString(),
			}),
		});
	} catch (error: unknown) {
		await updateJob({
			batchId: job.batchId,
			update: (current) => ({
				...requireJob({ job: current, origin: job.origin }),
				status: controller.signal.aborted ? "paused" : "error",
				updatedAt: new Date().toISOString(),
				error: controller.signal.aborted
					? "Đã dừng. Các mốc cắt vẫn được giữ lại."
					: error instanceof SplitRequestError
						? error.message
						: "Không cắt được video. Các mốc cắt đã lưu; bạn có thể thử lại.",
			}),
		});
		if (!controller.signal.aborted)
			console.error("Background video split failed:", error);
	}
}

async function startSplitJobUnlocked({
	batchId,
	sourceVideoPath,
	cuts,
	baseName,
	origin,
}: {
	batchId: string;
	sourceVideoPath: string;
	cuts: number[];
	baseName: string;
	origin: string;
}) {
	await assertNotDiscarded({ batchId });
	if (!cuts.length || !baseName.trim())
		throw new SplitRequestError({
			message: "Thêm điểm cắt và đặt tên project trước khi tạo.",
		});
	const existing = await readJob({ batchId });
	if (existing) {
		requireJob({ job: existing, origin });
		if (
			existing.sourceVideoPath !== sourceVideoPath ||
			JSON.stringify(existing.cuts) !== JSON.stringify(cuts)
		)
			throw new SplitRequestError({
				message: "Phiên này đã có mốc cắt khác. Mở một bản nháp mới.",
				status: 409,
			});
		if (workers.has(batchId) || existing.status === "completed")
			return existing;
		if (existing.result) {
			try {
				if (!(await hasSplitResult({ batchId })))
					throw new Error("Result expired");
				return await updateJob({
					batchId,
					update: (current) => ({
						...requireJob({ job: current, origin }),
						status: "ready",
						error: undefined,
					}),
				});
			} catch {
				/* Re-encode expired files from the preserved source and cuts. */
			}
		}
	}
	const { video, ranges } = await planSplitSource({ sourceVideoPath, cuts });
	if (workers.size >= 2)
		throw new SplitRequestError({
			message:
				"Đang cắt hai video khác. Bản nháp của bạn vẫn được giữ lại; thử tiếp tục sau.",
			status: 429,
		});
	const controller = new AbortController();
	let finish = () => {};
	const finished = new Promise<void>((resolve) => {
		finish = resolve;
	});
	const worker = { controller, finished };
	workers.set(batchId, worker);
	try {
		await removeSplitBatch({ batchId });
		const now = new Date().toISOString();
		const job = await updateJob({
			batchId,
			update: (current) => ({
				batchId,
				origin,
				video,
				sourceVideoPath,
				cuts,
				baseName,
				status: "queued",
				draftStep: "confirm",
				draftRevision: current?.draftRevision ?? Date.now(),
				editorId: current?.editorId,
				completedParts: 0,
				totalParts: ranges.length,
				createdProjects: current?.createdProjects ?? [],
				createdAt: current?.createdAt ?? now,
				updatedAt: now,
			}),
		});
		void runJob({ job, controller })
			.catch(console.error)
			.finally(() => {
				if (workers.get(batchId) === worker) workers.delete(batchId);
				finish();
			});
		return job;
	} catch (error) {
		if (workers.get(batchId) === worker) workers.delete(batchId);
		finish();
		throw error;
	}
}

async function getSplitJobUnlocked({
	batchId,
	origin,
}: {
	batchId: string;
	origin: string;
}) {
	await assertNotDiscarded({ batchId });
	let job = requireJob({ job: await readJob({ batchId }), origin });
	if (
		(job.status === "queued" || job.status === "splitting") &&
		!workers.has(batchId)
	) {
		job = await updateJob({
			batchId,
			update: (current) => {
				const latest = requireJob({ job: current, origin });
				if (
					workers.has(batchId) ||
					(latest.status !== "queued" && latest.status !== "splitting")
				)
					return latest;
				return {
					...latest,
					status: "error",
					error:
						"Server đã khởi động lại. Các mốc cắt vẫn còn; bấm tiếp tục để cắt lại.",
				};
			},
		});
	}
	if (job.status === "ready") {
		try {
			if (!(await hasSplitResult({ batchId })))
				throw new Error("Result expired");
			if (job.result) await retainSplitResult({ result: job.result });
		} catch {
			job = await updateJob({
				batchId,
				update: (current) => {
					const latest = requireJob({ job: current, origin });
					return latest.status !== "ready"
						? latest
						: {
								...latest,
								status: "error",
								error:
									"File cắt tạm đã hết hạn. Các mốc vẫn còn; bấm tiếp tục để tạo lại file.",
							};
				},
			});
		}
	}
	return job;
}

export async function listSplitJobs({ origin }: { origin: string }) {
	const entries = await fs
		.readdir(root())
		.catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return [];
			throw error;
		});
	const jobs: SplitJob[] = [];
	for (const entry of entries) {
		if (!/^[a-f0-9-]{36}\.json$/i.test(entry)) continue;
		const batchId = entry.slice(0, -5);
		const job = await readJob({ batchId });
		if (job?.origin === origin) {
			try {
				jobs.push(await getSplitJob({ batchId, origin }));
			} catch (error: unknown) {
				if (
					!(
						error instanceof SplitRequestError &&
						(error.status === 404 || error.status === 410)
					)
				)
					throw error;
			}
		}
	}
	return jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function checkpointSplitProjectUnlocked({
	batchId,
	origin,
	project,
}: {
	batchId: string;
	origin: string;
	project: CreatedSplitProject;
}) {
	await assertNotDiscarded({ batchId });
	return updateJob({
		batchId,
		update: (current) => {
			const job = requireJob({ job: current, origin });
			if (!job.result || project.index < 1 || project.index > job.totalParts)
				throw new SplitRequestError({
					message: "Project không thuộc phiên chia video này.",
				});
			const createdProjects = [
				...job.createdProjects.filter((item) => item.index !== project.index),
				project,
			].sort((a, b) => a.index - b.index);
			return { ...job, createdProjects, updatedAt: new Date().toISOString() };
		},
	});
}

async function completeSplitJobUnlocked({
	batchId,
	origin,
}: {
	batchId: string;
	origin: string;
}) {
	const job = await updateJob({
		batchId,
		update: (current) => {
			const job = requireJob({ job: current, origin });
			if (job.createdProjects.length !== job.totalParts)
				throw new SplitRequestError({
					message: "Chưa lưu đủ project. Giữ file cắt để bạn tiếp tục.",
				});
			return {
				...job,
				status: "completed",
				updatedAt: new Date().toISOString(),
			};
		},
	});
	await removeSplitBatch({ batchId });
	await removeRetainedSplitResult({ batchId });
	return job;
}

async function pauseSplitJobUnlocked({
	batchId,
	origin,
}: {
	batchId: string;
	origin: string;
}) {
	const existing = requireJob({ job: await readJob({ batchId }), origin });
	if (existing.status === "completed") return existing;
	const worker = workers.get(batchId);
	if (worker) {
		worker.controller.abort();
		await worker.finished;
	}
	return updateJob({
		batchId,
		update: (current) => ({
			...requireJob({ job: current, origin }),
			status: "paused",
			updatedAt: new Date().toISOString(),
			error: "Đã dừng. Các mốc cắt và project đã lưu vẫn còn.",
		}),
	});
}

async function discardSplitJobUnlocked({
	batchId,
	origin,
}: {
	batchId: string;
	origin: string;
}) {
	const job = await readJob({ batchId });
	if (job) {
		requireJob({ job, origin });
		await pauseSplitJobUnlocked({ batchId, origin });
	}
	await removeSplitBatch({ batchId });
	await removeRetainedSplitResult({ batchId });
	await fs.mkdir(root(), { recursive: true });
	await fs.writeFile(
		jobFile({ batchId }).replace(/\.json$/, ".discarded"),
		JSON.stringify({ origin, discardedAt: new Date().toISOString() }),
	);
	await fs.rm(jobFile({ batchId }), { force: true });
}

export function saveSplitDraft(
	options: Parameters<typeof saveSplitDraftUnlocked>[0],
) {
	return transition({
		batchId: options.batchId,
		operation: () => saveSplitDraftUnlocked(options),
	});
}
export function startSplitJob(
	options: Parameters<typeof startSplitJobUnlocked>[0],
) {
	return transition({
		batchId: options.batchId,
		operation: () => startSplitJobUnlocked(options),
	});
}
export function pauseSplitJob(
	options: Parameters<typeof pauseSplitJobUnlocked>[0],
) {
	return transition({
		batchId: options.batchId,
		operation: () => pauseSplitJobUnlocked(options),
	});
}
export function completeSplitJob(
	options: Parameters<typeof completeSplitJobUnlocked>[0],
) {
	return transition({
		batchId: options.batchId,
		operation: () => completeSplitJobUnlocked(options),
	});
}
export function discardSplitJob(
	options: Parameters<typeof discardSplitJobUnlocked>[0],
) {
	return transition({
		batchId: options.batchId,
		operation: () => discardSplitJobUnlocked(options),
	});
}
export function checkpointSplitProject(
	options: Parameters<typeof checkpointSplitProjectUnlocked>[0],
) {
	return transition({
		batchId: options.batchId,
		operation: () => checkpointSplitProjectUnlocked(options),
	});
}
export function getSplitJob(
	options: Parameters<typeof getSplitJobUnlocked>[0],
) {
	return transition({
		batchId: options.batchId,
		operation: () => getSplitJobUnlocked(options),
	});
}
