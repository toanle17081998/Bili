import fs from "node:fs/promises";
import path from "node:path";

export const AUDIO_EXTENSIONS = new Set([
	".mp3",
	".wav",
	".m4a",
	".aac",
	".ogg",
	".flac",
]);

export const DEFAULT_MUSIC_DIRECTORY = "D:\\videomxh\\nhacold";
export const DEFAULT_OUTPUT_DIRECTORY = "D:\\videomxh";

export function getMusicDirectory(): string {
	return process.env.AUTO_MUSIC_DIR?.trim() || DEFAULT_MUSIC_DIRECTORY;
}

export function getOutputDirectory(): string {
	return process.env.AUTO_OUTPUT_DIR?.trim() || DEFAULT_OUTPUT_DIRECTORY;
}

export interface MusicFileItem {
	name: string;
	path: string;
}

export function filterAudioFiles({ names }: { names: string[] }): string[] {
	return names
		.filter((name) => AUDIO_EXTENSIONS.has(path.extname(name).toLowerCase()))
		.sort((a, b) => a.localeCompare(b, "vi"));
}

export async function listMusicFiles({
	directory = getMusicDirectory(),
}: {
	directory?: string;
} = {}): Promise<MusicFileItem[]> {
	let names: string[];
	try {
		names = await fs.readdir(directory);
	} catch {
		return [];
	}
	return filterAudioFiles({ names }).map((name) => ({
		name,
		path: path.join(directory, name),
	}));
}

export async function pickRandomMusic({
	directory = getMusicDirectory(),
	random = Math.random,
}: {
	directory?: string;
	random?: () => number;
} = {}): Promise<string | null> {
	const files = await listMusicFiles({ directory });
	if (!files.length) return null;
	const index = Math.min(files.length - 1, Math.floor(random() * files.length));
	return files[index].path;
}

export async function resolveMusicSelection({
	musicFile,
	directory = getMusicDirectory(),
	random = Math.random,
}: {
	musicFile?: string;
	directory?: string;
	random?: () => number;
} = {}): Promise<string | null> {
	const normalized = musicFile?.trim();
	if (normalized === "none") return null;
	if (normalized && normalized !== "random") {
		const safeName = path.basename(normalized);
		if (
			safeName === normalized &&
			AUDIO_EXTENSIONS.has(path.extname(safeName).toLowerCase())
		) {
			const candidate = path.join(directory, safeName);
			try {
				const stat = await fs.stat(candidate);
				if (stat.isFile() && stat.size > 0) return candidate;
			} catch {
				// Fall through to random if specified file no longer exists
			}
		}
	}
	return pickRandomMusic({ directory, random });
}

function shuffle<T>(items: T[], random: () => number): T[] {
	const arr = [...items];
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.min(i, Math.floor(random() * (i + 1)));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

/**
 * Resolves an ordered playlist of music file paths:
 * - If "none", returns [].
 * - Any explicitly chosen valid track names are placed first (in the order selected).
 * - Remaining tracks in the directory are appended in shuffled order so long videos
 *   automatically transition to new songs instead of looping a single track.
 */
export async function resolveMusicPlaylist({
	musicFile,
	musicFiles,
	directory = getMusicDirectory(),
	random = Math.random,
}: {
	musicFile?: string;
	musicFiles?: string[];
	directory?: string;
	random?: () => number;
} = {}): Promise<string[]> {
	const normalized = musicFile?.trim();
	if (normalized === "none") return [];

	const available = await listMusicFiles({ directory });
	if (!available.length) return [];
	const byName = new Map(available.map((item) => [item.name, item.path]));

	const explicitNames = [
		...(Array.isArray(musicFiles) ? musicFiles : []),
		...(normalized && normalized !== "random" ? [normalized] : []),
	];
	const chosenPaths: string[] = [];
	const chosenSet = new Set<string>();
	for (const raw of explicitNames) {
		const safeName = path.basename(raw.trim());
		const found = byName.get(safeName);
		if (found && !chosenSet.has(found)) {
			chosenPaths.push(found);
			chosenSet.add(found);
		}
	}

	const remaining = available
		.map((item) => item.path)
		.filter((p) => !chosenSet.has(p));
	return [...chosenPaths, ...shuffle(remaining, random)];
}
