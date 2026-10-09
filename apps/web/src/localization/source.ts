import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { NarrationError } from "./narration";
import { loadDubbingTiming } from "./timing";

const shared = globalThis as typeof globalThis & {
	__opencutNarrationSources?: {
		activeSources: Map<string, number>;
		deletingSources: Set<string>;
		sweepStarted: boolean;
	};
};
const sourceState = (shared.__opencutNarrationSources ??= {
	activeSources: new Map(),
	deletingSources: new Set(),
	sweepStarted: false,
});
const { activeSources, deletingSources } = sourceState;

export async function readNarrationDuration(file: string) {
	const metadata = JSON.parse(
		await fs.readFile(path.join(path.dirname(file), "source.json"), "utf8"),
	);
	return z.object({ duration: z.number().positive() }).parse(metadata).duration;
}

export function retainNarrationSource(file: string) {
	if (deletingSources.has(path.dirname(file)))
		throw new NarrationError(
			"Video phân tích đã hết hạn. Vui lòng phân tích lại.",
			404,
		);
	activeSources.set(file, (activeSources.get(file) ?? 0) + 1);
	return () => {
		const count = (activeSources.get(file) ?? 1) - 1;
		if (count > 0) activeSources.set(file, count);
		else {
			activeSources.delete(file);
			return cleanupNarrationSources(path.dirname(path.dirname(file))).catch(
				(error: unknown) =>
					console.error("Cannot expire narration source:", error),
			);
		}
	};
}

export async function cleanupNarrationSources(
	root: string,
	{ now = Date.now(), reserveSlot = false } = {},
) {
	const policy = await loadDubbingTiming();
	const files = await fs
		.readdir(root, { withFileTypes: true })
		.catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return [];
			throw error;
		});
	const directories = files.filter(
		(entry) => entry.isDirectory() && /^source-[a-zA-Z0-9]+$/.test(entry.name),
	);
	const candidates = await Promise.all(
		directories.map(async (entry) => {
			const directory = path.resolve(root, entry.name);
			if (
				!/^source-[a-zA-Z0-9]+$/.test(
					path.relative(path.resolve(root), directory),
				)
			)
				throw new Error("Invalid narration source path");
			const stat = await fs
				.stat(path.join(directory, "video.mp4"))
				.catch(() => null);
			return stat ? { directory, modified: stat.mtimeMs } : null;
		}),
	);
	const entries = candidates.filter((entry) => entry !== null);
	entries.sort((a, b) => a.modified - b.modified);
	let remaining = entries.length;
	for (const entry of entries) {
		if (deletingSources.has(entry.directory)) {
			remaining--;
			continue;
		}
		if (
			[...activeSources.keys()].some(
				(file) => path.dirname(file) === entry.directory,
			)
		)
			continue;
		if (
			now - entry.modified >= policy.narration_source_ttl_ms() ||
			(reserveSlot && remaining >= policy.narration_source_max_entries())
		) {
			deletingSources.add(entry.directory);
			try {
				await fs.rm(entry.directory, { recursive: true, force: true });
			} finally {
				deletingSources.delete(entry.directory);
			}
			remaining--;
		}
	}
	if (reserveSlot && remaining >= policy.narration_source_max_entries())
		throw new NarrationError(
			"Đang sử dụng quá nhiều video phân tích. Vui lòng thử lại sau.",
			429,
		);
}

export async function scheduleNarrationSourceCleanup(root: string) {
	const policy = await loadDubbingTiming();
	setTimeout(() => {
		void cleanupNarrationSources(root).catch((error: unknown) =>
			console.error("Cannot expire narration sources:", error),
		);
	}, policy.narration_source_ttl_ms()).unref();
	await startNarrationSourceSweep();
}

export async function startNarrationSourceSweep() {
	const policy = await loadDubbingTiming();
	if (!sourceState.sweepStarted) {
		sourceState.sweepStarted = true;
		const sweep = async () => {
			const projectsRoot = path.resolve(
				process.cwd(),
				".local_storage",
				"projects",
			);
			const projects = await fs
				.readdir(projectsRoot, { withFileTypes: true })
				.catch(() => []);
			for (const project of projects)
				if (project.isDirectory() && /^[a-zA-Z0-9_-]+$/.test(project.name))
					await cleanupNarrationSources(
						path.join(projectsRoot, project.name, "narration-sources"),
					);
		};
		const run = () => {
			void sweep().catch((error: unknown) =>
				console.error("Cannot sweep narration sources:", error),
			);
		};
		await sweep();
		setInterval(
			run,
			Math.min(policy.narration_source_ttl_ms(), 60 * 60_000),
		).unref();
	}
}

export async function resolveNarrationSource(
	projectId: string,
	videoPath: string,
) {
	const root = await fs
		.realpath(
			path.resolve(
				process.cwd(),
				".local_storage",
				"projects",
				projectId,
				"narration-sources",
			),
		)
		.catch(() => null);
	const file = await fs.realpath(videoPath).catch(() => null);
	if (!root || !file)
		throw new NarrationError(
			"Không tìm thấy video thuyết minh. Vui lòng phân tích lại video.",
			404,
		);
	const relative = path.relative(root, file);
	if (
		relative.startsWith("..") ||
		path.isAbsolute(relative) ||
		!(await fs.stat(file)).isFile()
	)
		throw new NarrationError("Đường dẫn video thuyết minh không hợp lệ.", 400);
	return file;
}
