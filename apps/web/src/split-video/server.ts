import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { FFmpegService } from "@/media/ffmpeg";
import { loadSplitPlanner } from "./server-core";
import type { DownloadedVideo, SplitPart, SplitResult } from "./types";

const TEMP_TTL_MS = 60 * 60_000;
const PROCESS_TIMEOUT_MS = 6 * 60 * 60_000;
const downloadsRoot = () =>
	path.resolve(process.cwd(), ".local_storage/downloads");
const splitsRoot = () => path.resolve(process.cwd(), ".local_storage/splits");
const videoCache = new Map<
	string,
	{ signature: string; video: DownloadedVideo }
>();
const thumbnailJobs = new Map<string, Promise<string>>();
declare global {
	// Process-wide registry must survive Next.js hot reload while FFmpeg runs.
	var opencutActiveSplits:
		| Map<string, { controller: AbortController; finished: Promise<void> }>
		| undefined;
}
const activeJobs = (globalThis.opencutActiveSplits ??= new Map());

async function probeSplitVideo({
	filePath,
	signal,
}: {
	filePath: string;
	signal?: AbortSignal;
}) {
	const probe = await FFmpegService.probeVideo({
		filePath,
		signal,
		frameRatePrecision: "exact",
	});
	const duration = probe.videoDuration ?? Number.NaN;
	const planner = await loadSplitPlanner();
	if (
		!probe.hasVideo ||
		!planner.validVideo({
			duration,
			width: probe.width,
			height: probe.height,
			fps: probe.fps,
			frames: probe.videoFrameCount ?? Number.NaN,
		})
	)
		throw new SplitRequestError({
			message:
				"Video không có khung hình hoặc không đọc được thời lượng phần hình.",
		});
	return { ...probe, duration };
}

export class SplitRequestError extends Error {
	readonly status: number;
	constructor({ message, status = 400 }: { message: string; status?: number }) {
		super(message);
		this.status = status;
	}
}

export async function resolveDownloadedVideo({
	filePath,
}: {
	filePath: string;
}) {
	const root = await fs.realpath(downloadsRoot()).catch(() => {
		throw new SplitRequestError({
			message: "Chưa có video đã tải.",
			status: 404,
		});
	});
	const resolved = await fs.realpath(filePath).catch(() => {
		throw new SplitRequestError({
			message: "Không tìm thấy video đã tải.",
			status: 404,
		});
	});
	if (
		path.dirname(resolved) !== root ||
		path.extname(resolved).toLowerCase() !== ".mp4"
	)
		throw new SplitRequestError({
			message: "Chỉ chọn video MP4 trong thư mục downloads.",
		});
	const stat = await fs.stat(resolved);
	if (!stat.isFile() || !stat.size)
		throw new SplitRequestError({
			message: "File video trống hoặc không hợp lệ.",
		});
	return { file: resolved, stat };
}

async function describeVideo({
	filePath,
	signal,
}: {
	filePath: string;
	signal?: AbortSignal;
}): Promise<DownloadedVideo> {
	const { file, stat } = await resolveDownloadedVideo({ filePath });
	const signature = `${stat.size}:${stat.mtimeMs}`;
	const cached = videoCache.get(file);
	if (cached?.signature === signature) return cached.video;
	const probe = await probeSplitVideo({ filePath: file, signal });
	let name = path.basename(file, ".mp4");
	try {
		const metadata: unknown = JSON.parse(
			await fs.readFile(`${file}.json`, "utf8"),
		);
		if (
			metadata &&
			typeof metadata === "object" &&
			"title" in metadata &&
			typeof metadata.title === "string"
		)
			name = metadata.title;
	} catch {
		/* Downloads made before manifests were added keep their filename. */
	}
	const id = path.basename(file);
	const video: DownloadedVideo = {
		id,
		name,
		path: file,
		...probe,
		size: stat.size,
		streamUrl: `/api/media/stream?file=${encodeURIComponent(file)}`,
		thumbnailUrl: `/api/source/list-downloads?thumbnail=${encodeURIComponent(id)}`,
	};
	videoCache.set(file, { signature, video });
	return video;
}

export async function listDownloadedVideos({
	signal,
}: { signal?: AbortSignal } = {}) {
	const entries = await fs
		.readdir(downloadsRoot(), { withFileTypes: true })
		.catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return [];
			throw error;
		});
	const files = entries.filter(
		(entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".mp4"),
	);
	const videos: DownloadedVideo[] = [];
	const warnings: string[] = [];
	for (let offset = 0; offset < files.length; offset += 4) {
		await Promise.all(
			files.slice(offset, offset + 4).map(async (entry) => {
				try {
					videos.push(
						await describeVideo({
							filePath: path.join(downloadsRoot(), entry.name),
							signal,
						}),
					);
				} catch {
					if (signal?.aborted) throw signal.reason;
					warnings.push(`Không đọc được ${entry.name}.`);
				}
			}),
		);
	}
	return {
		videos: videos.sort((a, b) => a.name.localeCompare(b.name)),
		warnings,
	};
}

export async function getDownloadThumbnail({ id }: { id: string }) {
	if (path.basename(id) !== id)
		throw new SplitRequestError({ message: "Tên video không hợp lệ." });
	const { file, stat } = await resolveDownloadedVideo({
		filePath: path.join(downloadsRoot(), id),
	});
	const key = createHash("sha256")
		.update(`${file}:${stat.size}:${stat.mtimeMs}`)
		.digest("hex");
	const root = path.resolve(process.cwd(), ".local_storage/split-thumbnails");
	const output = path.join(root, `${key}.jpg`);
	try {
		await fs.access(output);
		return output;
	} catch {
		/* Generate once per source revision. */
	}
	let job = thumbnailJobs.get(key);
	if (!job) {
		job = (async () => {
			await fs.mkdir(root, { recursive: true });
			await FFmpegService.runCommand(
				"ffmpeg",
				[
					"-y",
					"-i",
					file,
					"-frames:v",
					"1",
					"-vf",
					"scale=320:-2",
					"-threads",
					"1",
					output,
				],
				{ signal: AbortSignal.timeout(30_000) },
			);
			return output;
		})().finally(() => thumbnailJobs.delete(key));
		thumbnailJobs.set(key, job);
	}
	return job;
}

export function getSplitDirectory({ batchId }: { batchId: string }) {
	if (
		!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
			batchId,
		)
	)
		throw new SplitRequestError({
			message: "Mã phiên chia video không hợp lệ.",
		});
	return path.join(splitsRoot(), batchId);
}

export function getSplitResultDirectory({ batchId }: { batchId: string }) {
	getSplitDirectory({ batchId });
	return path.resolve(process.cwd(), ".local_storage/split-results", batchId);
}

export async function retainSplitResult({ result }: { result: SplitResult }) {
	const directory = getSplitResultDirectory({ batchId: result.batchId });
	try {
		const cached: SplitResult = JSON.parse(await fs.readFile(path.join(directory, "result.json"), "utf8"));
		if (JSON.stringify(cached) === JSON.stringify(result) && await validSplitResultFiles({ directory, result })) return;
	} catch {
		/* Pin a ready batch before temporary media cleanup. */
	}
	await fs.mkdir(directory, { recursive: true });
	await fs.rm(path.join(directory, "result.json"), { force: true });
	for (const part of result.parts) {
		const from = path.join(
			getSplitDirectory({ batchId: result.batchId }),
			`part-${part.index}.mp4`,
		);
		const to = path.join(directory, `part-${part.index}.mp4`);
		const temporary = `${to}.${randomUUID()}.tmp`;
		try {
			try { await fs.link(from, temporary); } catch { await fs.copyFile(from, temporary); }
			if ((await fs.stat(temporary)).size !== part.size) throw new Error("Retained split file size mismatch");
			await fs.rename(temporary, to);
		} finally { await fs.rm(temporary, { force: true }); }
	}
	const manifest = path.join(directory, "result.json");
	const temporary = `${manifest}.${randomUUID()}.tmp`;
	try { await fs.writeFile(temporary, JSON.stringify(result)); await fs.rename(temporary, manifest); }
	finally { await fs.rm(temporary, { force: true }); }
}

async function validSplitResultFiles({ directory, result }: { directory: string; result: SplitResult }) {
	try {
		for (const part of result.parts) if ((await fs.stat(path.join(directory, `part-${part.index}.mp4`))).size !== part.size) return false;
		return result.parts.length > 0;
	} catch { return false; }
}

export async function removeRetainedSplitResult({
	batchId,
}: {
	batchId: string;
}) {
	await fs.rm(getSplitResultDirectory({ batchId }), {
		recursive: true,
		force: true,
	});
}

export async function hasSplitResult({ batchId }: { batchId: string }) {
	try {
		const directory = getSplitResultDirectory({ batchId });
		const result: SplitResult = JSON.parse(await fs.readFile(path.join(directory, "result.json"), "utf8"));
		if (await validSplitResultFiles({ directory, result })) return true;
	} catch {
		/* Check older temporary batches. */
	}
	try {
		await fs.access(path.join(getSplitDirectory({ batchId }), "result.json"));
		return true;
	} catch {
		return false;
	}
}

export async function cleanupExpiredSplits() {
	const entries = await fs
		.readdir(splitsRoot(), { withFileTypes: true })
		.catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return [];
			throw error;
		});
	for (const entry of entries) {
		if (!entry.isDirectory() || activeJobs.has(entry.name)) continue;
		try {
			const directory = getSplitDirectory({ batchId: entry.name });
			const stat = await fs.stat(directory);
			if (Date.now() - stat.mtimeMs > TEMP_TTL_MS)
				await fs.rm(directory, { recursive: true, force: true });
		} catch (error: unknown) {
			if (
				!(error instanceof Error && "code" in error && error.code === "ENOENT")
			)
				console.warn("Skipping expired split cleanup:", error);
		}
	}
}

export async function removeSplitBatch({ batchId }: { batchId: string }) {
	const directory = getSplitDirectory({ batchId });
	const job = activeJobs.get(batchId);
	if (job) {
		job.controller.abort();
		await job.finished;
	}
	await fs.rm(directory, { recursive: true, force: true });
}

export async function splitVideoOnServer({
	batchId,
	sourceVideoPath,
	cuts,
	signal,
	onProgress,
	onEncoderProgress,
}: {
	batchId: string;
	sourceVideoPath: string;
	cuts: number[];
	signal?: AbortSignal;
	onProgress?: (progress: {
		completed: number;
		total: number;
	}) => Promise<void>;
	onEncoderProgress?: (progress: {
		part: number;
		seconds: number;
		partDuration: number;
		speed?: number;
		fps?: number;
	}) => void;
}): Promise<SplitResult> {
	const directory = getSplitDirectory({ batchId });
	if (activeJobs.size >= 2)
		throw new SplitRequestError({
			message: "Đang chia video khác. Vui lòng thử lại sau.",
			status: 429,
		});
	if (activeJobs.has(batchId))
		throw new SplitRequestError({
			message: "Phiên chia video này đang chạy.",
			status: 409,
		});
	const controller = new AbortController();
	const jobSignal = AbortSignal.any([
		controller.signal,
		AbortSignal.timeout(PROCESS_TIMEOUT_MS),
		...(signal ? [signal] : []),
	]);
	let finish = () => {};
	const finished = new Promise<void>((resolve) => {
		finish = resolve;
	});
	activeJobs.set(batchId, { controller, finished });
	let ownsDirectory = false;
	try {
		if (!cuts.length)
			throw new SplitRequestError({ message: "Thêm ít nhất một điểm cắt." });
		const video = await describeVideo({
			filePath: sourceVideoPath,
			signal: jobSignal,
		});
		const ranges = (await loadSplitPlanner()).plan({
			duration: video.duration,
			cuts,
		});
		jobSignal.throwIfAborted();
		await fs.mkdir(splitsRoot(), { recursive: true });
		await cleanupExpiredSplits();
		await fs.mkdir(directory).catch((error: NodeJS.ErrnoException) => {
			if (error.code === "EEXIST")
				throw new SplitRequestError({
					message: "Phiên chia video đã tồn tại.",
					status: 409,
				});
			throw error;
		});
		ownsDirectory = true;
		const parts: SplitPart[] = [];
		for (const [index, range] of ranges.entries()) {
			const output = path.join(directory, `part-${index + 1}.mp4`);
			await FFmpegService.runCommand(
				"ffmpeg",
				[
					"-y",
					"-progress",
					"pipe:1",
					"-stats_period",
					"1",
					"-nostats",
					"-ss",
					String(range.start),
					"-i",
					video.path,
					"-t",
					String(range.end - range.start),
					"-map",
					"0:v:0",
					"-map",
					"0:a:0?",
					"-sn",
					"-dn",
					"-vf",
					"pad=ceil(iw/2)*2:ceil(ih/2)*2",
					"-c:v",
					"libx264",
					"-preset",
					"fast",
					"-crf",
					"18",
					"-pix_fmt",
					"yuv420p",
					"-threads",
					"2",
					"-c:a",
					"aac",
					"-b:a",
					"192k",
					"-movflags",
					"+faststart",
					output,
				],
				{
					signal: jobSignal,
					onProgress: (progress) =>
						onEncoderProgress?.({
							part: index + 1,
							seconds: progress.seconds,
							partDuration: range.end - range.start,
							speed: progress.speed,
							fps: progress.fps,
						}),
				},
			);
			const probe = await probeSplitVideo({
				filePath: output,
				signal: jobSignal,
			});
			if (
				Math.abs(probe.duration - (range.end - range.start)) >
				Math.max(0.15, 2 / probe.fps)
			)
				throw new SplitRequestError({
					message: `Đoạn ${index + 1} có thời lượng không đúng điểm cắt.`,
					status: 500,
				});
			parts.push({
				...range,
				...probe,
				index: index + 1,
				size: (await fs.stat(output)).size,
				downloadUrl: `/api/source/split?batchId=${batchId}&part=${index + 1}`,
			});
			await onProgress?.({ completed: parts.length, total: ranges.length });
		}
		jobSignal.throwIfAborted();
		const result = { batchId, parts };
		await fs.writeFile(
			path.join(directory, "result.json"),
			JSON.stringify(result),
		);
		const timer = setTimeout(() => {
			void removeSplitBatch({ batchId }).catch(console.error);
		}, TEMP_TTL_MS);
		timer.unref();
		return result;
	} catch (error) {
		if (ownsDirectory) await fs.rm(directory, { recursive: true, force: true });
		throw error;
	} finally {
		activeJobs.delete(batchId);
		finish();
	}
}

export async function planSplitSource({
	sourceVideoPath,
	cuts,
}: {
	sourceVideoPath: string;
	cuts: number[];
}) {
	const video = await describeVideo({ filePath: sourceVideoPath });
	const ranges = (await loadSplitPlanner()).plan({
		duration: video.duration,
		cuts,
	});
	return { video, ranges };
}

export async function openSplitPart({
	batchId,
	part,
}: {
	batchId: string;
	part: number;
}) {
	const directory = getSplitDirectory({ batchId });
	if (!Number.isInteger(part) || part < 1 || part > 100)
		throw new SplitRequestError({ message: "Đoạn video không hợp lệ." });
	try {
		const retained = getSplitResultDirectory({ batchId });
		try {
			const result: SplitResult = JSON.parse(await fs.readFile(path.join(retained, "result.json"), "utf8"));
			const expected = result.parts.find((item) => item.index === part);
			const file = path.join(retained, `part-${part}.mp4`);
			if (!expected || (await fs.stat(file)).size !== expected.size) throw new Error("Retained split is incomplete");
			return await fs.open(file, "r");
		} catch {
			/* Older batches may not have been retained yet. */
		}
		await fs.access(path.join(directory, "result.json"));
		return await fs.open(path.join(directory, `part-${part}.mp4`), "r");
	} catch {
		throw new SplitRequestError({
			message: "Đoạn video đã hết hạn hoặc chưa cắt xong.",
			status: 404,
		});
	}
}
