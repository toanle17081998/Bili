import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { BilibiliProvider } from "@/source/bilibili";
import { FFmpegService } from "@/media/ffmpeg";
import { LocalizationPipeline } from "@/localization/pipeline";
import { prepareBackgroundMusic } from "@/localization/background-music";
import { separateVocals } from "@/media/vocal-separation";
import { detectLogoAndSubtitle } from "./vision-detector";
import { DEFAULT_SUBTITLE_BOX } from "./layout";
import {
	getOutputDirectory,
	resolveMusicPlaylist,
} from "./music-picker";
import { renderAutoVideo } from "./renderer";

export type AutoJobStatus = "queued" | "running" | "done" | "failed" | "cancelled";
export type AutoAudioMode =
	| "mute_original"
	| "keep_sfx_add_music"
	| "keep_original_bgm";

export interface AutoJobOptions {
	quality?: number;
	voice: string;
	voiceVolume: number;
	audioMode?: AutoAudioMode;
	originalVolume?: number;
	musicFile?: string;
	musicFiles?: string[];
	musicVolume: number;
	subtitleColor: string;
	subtitleMaxLines: number;
	removeLogo?: boolean;
	coverSubtitle?: boolean;
	subtitleBlur?: number;
	subtitleBgOpacity?: number;
	subtitleFontSizePx?: number;
	stripWidthPercent?: number;
	stripHeightPercent?: number;
}

export interface AutoJob {
	id: string;
	bvid: string;
	title: string;
	options: AutoJobOptions;
	status: AutoJobStatus;
	stage: string;
	progress: number;
	outputPath?: string;
	error?: string;
	createdAt: string;
	updatedAt: string;
}

interface Runtime {
	jobs: AutoJob[];
	loaded: boolean;
	running: {
		id: string;
		controller: AbortController;
		requeueOnAbort?: boolean;
	} | null;
}

const globalState = globalThis as typeof globalThis & {
	__autoQueue?: Runtime;
};
const runtime = (globalState.__autoQueue ??= {
	jobs: [],
	loaded: false,
	running: null,
});

const root = () => path.join(process.cwd(), ".local_storage", "auto-queue");
const stateFile = () => path.join(root(), "state.json");

async function save() {
	await fs.mkdir(root(), { recursive: true });
	await fs.writeFile(stateFile(), JSON.stringify(runtime.jobs, null, 2), "utf8");
}

async function load() {
	if (runtime.loaded) return;
	runtime.loaded = true;
	try {
		const jobs = JSON.parse(await fs.readFile(stateFile(), "utf8")) as AutoJob[];
		runtime.jobs = jobs.map((job) =>
			job.status === "running"
				? {
						...job,
						status: "failed",
						stage: "Bị gián đoạn",
						error: "Máy chủ đã dừng khi đang xử lý. Hãy thêm lại video.",
					}
				: job,
		);
	} catch {
		runtime.jobs = [];
	}
}

function update(job: AutoJob, patch: Partial<AutoJob>) {
	Object.assign(job, patch, { updatedAt: new Date().toISOString() });
	void save().catch((error) => console.error("Auto queue save failed:", error));
}

export function safeFileName(value: string): string {
	return (
		value
			.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 80) || "video"
	);
}

async function audioOnly(source: string, directory: string) {
	const vocals = path.join(directory, "auto-source.wav");
	await FFmpegService.runCommand("ffmpeg", [
		"-y", "-i", source, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", vocals,
	]);
	return { vocals, background: vocals };
}

async function prepareMultiTrackMusic({
	playlist,
	outputPath,
	duration,
	signal,
}: {
	playlist: string[];
	outputPath: string;
	duration: number;
	signal?: AbortSignal;
}) {
	if (!playlist.length) return;
	const validTracks: { path: string; duration: number }[] = [];
	let accumulated = 0;
	for (const trackPath of playlist) {
		try {
			const p = await FFmpegService.probeVideo({ filePath: trackPath, signal });
			if (p.hasAudio && p.duration > 1) {
				validTracks.push({ path: trackPath, duration: p.duration });
				accumulated += p.duration;
				if (accumulated >= duration) break;
			}
		} catch (error) {
			if (signal?.aborted) throw error;
		}
	}
	if (!validTracks.length) return;

	// No fade-in at the start (music begins at full volume). Tracks overlap with a
	// short crossfade where they meet, and the mix fades out only at the very end.
	const shortest = Math.min(...validTracks.map((t) => t.duration));
	const crossfade = Math.max(0.5, Math.min(3, shortest / 3));
	const sequence: string[] = [];
	let effective = 0;
	let idx = 0;
	while (effective < duration && sequence.length < 200) {
		const next = validTracks[idx % validTracks.length];
		sequence.push(next.path);
		effective += sequence.length === 1 ? next.duration : next.duration - crossfade;
		idx++;
	}
	const endFade = Math.min(3, Math.max(0.5, duration * 0.03));
	const inputs = sequence.flatMap((file) => ["-i", file]);
	const filterParts = sequence.map(
		(_, i) =>
			`[${i}:a]aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS[m${i}]`,
	);
	let chained = "[m0]";
	for (let i = 1; i < sequence.length; i++) {
		const out = `[x${i}]`;
		filterParts.push(
			`${chained}[m${i}]acrossfade=d=${crossfade.toFixed(2)}:c1=tri:c2=tri${out}`,
		);
		chained = out;
	}
	filterParts.push(
		`${chained}apad,atrim=duration=${duration},afade=t=out:st=${Math.max(0, duration - endFade).toFixed(2)}:d=${endFade.toFixed(2)}[mout]`,
	);
	await FFmpegService.runCommand(
		"ffmpeg",
		[
			"-y",
			...inputs,
			"-filter_complex",
			filterParts.join(";"),
			"-map",
			"[mout]",
			"-ar",
			"48000",
			"-ac",
			"2",
			"-c:a",
			"libmp3lame",
			"-b:a",
			"160k",
			outputPath,
		],
		{ signal },
	);
}

async function runJob(job: AutoJob, signal: AbortSignal) {
	const step = (stage: string, progress: number) => {
		signal.throwIfAborted();
		update(job, { stage, progress });
	};
	const workRoot = path.join(root(), "work", job.id);
	await fs.mkdir(workRoot, { recursive: true });
	try {
		step("Đang tải video", 5);
		const imported = await new BilibiliProvider().importVideo(
			job.bvid,
			job.options.quality,
		);
		const probe = await FFmpegService.probeVideo({
			filePath: imported.localMediaPath,
			signal,
		});

		step("Nhận diện, dịch & lồng tiếng Việt", 15);
		const audioMode: AutoAudioMode = job.options.audioMode ?? "mute_original";
		const needsVocalSeparation =
			audioMode === "keep_sfx_add_music" || audioMode === "keep_original_bgm";
		const projectsRoot = path.join(process.cwd(), ".local_storage", "projects");
		const projectDir = path.join(projectsRoot, job.bvid);
		const cachedDubPath = path.join(projectDir, "latest-dubbing.json");
		let localized: Awaited<ReturnType<LocalizationPipeline["run"]>> | null = null;
		try {
			const cached = JSON.parse(await fs.readFile(cachedDubPath, "utf8"));
			const cachedVoiceUrl = cached?.voiceovers?.[0]?.audioUrl;
			const cachedVoiceFile = cachedVoiceUrl
				? new URL(cachedVoiceUrl, "http://localhost").searchParams.get("file")
				: null;
			if (cached?.voice === job.options.voice && cachedVoiceFile) {
				await fs.access(cachedVoiceFile);
				localized = cached;
			}
		} catch {
			localized = null;
		}
		if (!localized) {
			const pipeline = new LocalizationPipeline({
				vocalSeparator: needsVocalSeparation ? separateVocals : audioOnly,
			});
			localized = await pipeline.run({
				projectId: job.bvid,
				videoPath: imported.localMediaPath,
				workDir: projectsRoot,
				voice: job.options.voice,
				mode: "dubbing",
				onProgress: (message, percent) =>
					update(job, { stage: message, progress: 15 + Math.round(percent * 0.45) }),
			});
		}
		let originalAudioPath: string | null = null;
		if (needsVocalSeparation) {
			step("Tách bỏ giọng gốc, giữ SFX / nhạc nền gốc", 60);
			const stems = await separateVocals(imported.localMediaPath, projectDir);
			originalAudioPath = stems.background;
		}
		const voiceUrl = localized.voiceovers[0]?.audioUrl;
		const voicePath = voiceUrl
			? new URL(voiceUrl, "http://localhost").searchParams.get("file")
			: null;
		if (!voicePath) throw new Error("Không tạo được giọng lồng tiếng.");

		const shouldRemoveLogo = job.options.removeLogo !== false;
		const shouldCoverSubtitle = job.options.coverSubtitle !== false;
		let logos = [] as Awaited<ReturnType<typeof detectLogoAndSubtitle>>["logos"];
		let subtitleBox = DEFAULT_SUBTITLE_BOX;

		if (shouldRemoveLogo || shouldCoverSubtitle) {
			step("AI dò logo & tọa độ phụ đề gốc", 65);
			const interiorCues = localized.subtitles.filter((s) => {
				const mid = (s.start + s.end) / 2;
				return mid >= probe.duration * 0.12 && mid <= probe.duration * 0.88;
			});
			const sourceCues = interiorCues.length >= 2 ? interiorCues : localized.subtitles;
			const sampleTimes: number[] = [];
			for (const ratio of [0.15, 0.32, 0.5, 0.68, 0.85]) {
				const centerIdx = Math.floor(sourceCues.length * ratio);
				const window = sourceCues.slice(
					Math.max(0, centerIdx - 2),
					Math.min(sourceCues.length, centerIdx + 3),
				);
				const best = window
					.slice()
					.sort((a, b) => b.text.length - a.text.length)[0];
				if (best) {
					const mid = (best.start + best.end) / 2;
					if (!sampleTimes.some((t) => Math.abs(t - mid) < 0.8)) {
						sampleTimes.push(mid);
					}
				}
			}
			const vision = await detectLogoAndSubtitle({
				videoPath: imported.localMediaPath,
				duration: probe.duration,
				sampleTimes,
				signal,
			});
			if (shouldRemoveLogo) logos = vision.logos;
			if (shouldCoverSubtitle) subtitleBox = vision.subtitle;
		}

		let musicPath: string | null = null;
		if (audioMode !== "keep_original_bgm") {
			step("Chuẩn bị nhạc nền", 75);
			const playlist = await resolveMusicPlaylist({
				musicFile: job.options.musicFile,
				musicFiles: job.options.musicFiles,
			});
			if (playlist.length > 0) {
				musicPath = path.join(workRoot, "music.mp3");
				await prepareMultiTrackMusic({
					playlist,
					outputPath: musicPath,
					duration: probe.duration,
					signal,
				});
			}
		}

		step("Render video 9:16", 80);
		const temp = path.join(workRoot, "output.mp4");
		await renderAutoVideo({
			videoPath: imported.localMediaPath,
			voicePath,
			musicPath,
			originalAudioPath,
			cues: localized.subtitles.map((cue) => ({
				start: cue.start,
				end: cue.end,
				text: cue.text,
			})),
			logos,
			subtitleBox,
			settings: {
				voiceVolume: job.options.voiceVolume,
				musicVolume: job.options.musicVolume,
				originalVolume: job.options.originalVolume ?? 0.35,
				subtitleColor: job.options.subtitleColor,
				subtitleMaxLines: job.options.subtitleMaxLines,
				coverSubtitle: shouldCoverSubtitle,
				subtitleBlur: job.options.subtitleBlur ?? 30,
				subtitleBgOpacity: job.options.subtitleBgOpacity ?? 0,
				subtitleFontSizePx: job.options.subtitleFontSizePx,
				stripWidthPercent: job.options.stripWidthPercent ?? 94,
				stripHeightPercent: job.options.stripHeightPercent ?? 16,
			},
			outputPath: temp,
			workDir: workRoot,
			signal,
		});

		step("Lưu vào thư mục đích", 97);
		const outputDir = getOutputDirectory();
		await fs.mkdir(outputDir, { recursive: true });
		let target = path.join(
			outputDir,
			`${job.bvid}_${safeFileName(job.title)}.mp4`,
		);
		if (job.outputPath && path.dirname(job.outputPath) === outputDir) {
			// Re-render of a finished job: overwrite the previous file instead of creating a duplicate.
			target = job.outputPath;
		} else {
			try {
				await fs.access(target);
				target = target.replace(/\.mp4$/, `_${Date.now()}.mp4`);
			} catch {
				/* free file name */
			}
		}
		await fs.copyFile(temp, target);
		update(job, { status: "done", stage: "Hoàn tất", progress: 100, outputPath: target });
	} finally {
		await fs.rm(workRoot, { recursive: true, force: true }).catch(() => {});
	}
}

async function pump() {
	if (runtime.running) return;
	const job = runtime.jobs.find((item) => item.status === "queued");
	if (!job) return;
	const controller = new AbortController();
	runtime.running = { id: job.id, controller };
	update(job, { status: "running", stage: "Bắt đầu", progress: 1 });
	try {
		await runJob(job, controller.signal);
	} catch (error) {
		if (controller.signal.aborted) {
			if (runtime.running?.requeueOnAbort) {
				update(job, {
					status: "queued",
					stage: "Đang chờ trong hàng đợi (đã cập nhật cấu hình)",
					progress: 0,
					error: undefined,
				});
			} else {
				update(job, { status: "cancelled", stage: "Đã hủy" });
			}
		} else {
			console.error("Auto queue job failed:", error);
			update(job, {
				status: "failed",
				stage: "Lỗi",
				error: error instanceof Error ? error.message : "Xử lý thất bại.",
			});
		}
	} finally {
		runtime.running = null;
		void pump();
	}
}

export async function listAutoJobs(): Promise<AutoJob[]> {
	await load();
	void pump();
	return [...runtime.jobs].reverse();
}

export async function enqueueAutoJob({
	bvid,
	title,
	options,
}: {
	bvid: string;
	title: string;
	options: AutoJobOptions;
}): Promise<AutoJob> {
	await load();
	const active = runtime.jobs.find(
		(job) =>
			job.bvid === bvid && (job.status === "queued" || job.status === "running"),
	);
	if (active) return active;
	const now = new Date().toISOString();
	const job: AutoJob = {
		id: randomUUID(),
		bvid,
		title,
		options,
		status: "queued",
		stage: "Đang chờ trong hàng đợi",
		progress: 0,
		createdAt: now,
		updatedAt: now,
	};
	runtime.jobs.push(job);
	await save();
	void pump();
	return job;
}

export async function removeAutoJob(id: string): Promise<boolean> {
	await load();
	const job = runtime.jobs.find((item) => item.id === id);
	if (!job) return false;
	if (job.status === "running") {
		runtime.running?.controller.abort();
		return true;
	}
	if (job.status === "queued") {
		update(job, { status: "cancelled", stage: "Đã hủy" });
		return true;
	}
	runtime.jobs = runtime.jobs.filter((item) => item.id !== id);
	await save();
	return true;
}

export async function retryAutoJob(id: string): Promise<AutoJob | null> {
	await load();
	const job = runtime.jobs.find((item) => item.id === id);
	if (!job) return null;
	if (job.status === "running" || job.status === "queued") return job;
	update(job, {
		status: "queued",
		stage: "Đang chờ trong hàng đợi",
		progress: 0,
		error: undefined,
	});
	void pump();
	return job;
}

export async function requeueDoneJobs(): Promise<number> {
	await load();
	let count = 0;
	for (const job of runtime.jobs) {
		if (job.status !== "done") continue;
		job.status = "queued";
		job.stage = "Đang chờ render lại (áp dụng hiệu ứng âm thanh mới)";
		job.progress = 0;
		job.error = undefined;
		job.updatedAt = new Date().toISOString();
		count++;
	}
	await save();
	void pump();
	return count;
}

export async function updateAutoJobOptions({
	id,
	options,
	applyToAllQueued = false,
}: {
	id: string;
	options: AutoJobOptions;
	applyToAllQueued?: boolean;
}): Promise<AutoJob | null> {
	await load();
	const target = runtime.jobs.find((item) => item.id === id);
	if (!target) return null;

	if (applyToAllQueued) {
		for (const item of runtime.jobs) {
			if (item.status === "queued" && item.id !== id) {
				item.options = { ...item.options, ...options };
				item.updatedAt = new Date().toISOString();
			}
		}
	}

	target.options = { ...target.options, ...options };
	if (target.status === "running" && runtime.running?.id === target.id) {
		runtime.running.requeueOnAbort = true;
		runtime.running.controller.abort();
		await save();
		return target;
	}
	if (
		target.status === "failed" ||
		target.status === "cancelled" ||
		target.status === "done"
	) {
		update(target, {
			options: target.options,
			status: "queued",
			stage: "Đang chờ trong hàng đợi (đã cập nhật cấu hình)",
			progress: 0,
			error: undefined,
		});
		void pump();
		return target;
	}
	update(target, { options: target.options });
	void pump();
	return target;
}
