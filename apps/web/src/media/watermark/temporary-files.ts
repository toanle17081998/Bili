import fs from "node:fs/promises";
import path from "node:path";

const PREVIEW_TTL_MS = 60 * 60_000;

export async function removeTemporaryJob({
	root,
	directory,
}: {
	root: string;
	directory: string;
}) {
	const relative = path.relative(path.resolve(root), path.resolve(directory));
	if (!/^job-[a-zA-Z0-9]+$/.test(relative))
		throw new Error("Invalid temporary job path");
	await fs.rm(directory, {
		recursive: true,
		force: true,
		maxRetries: 5,
		retryDelay: 100,
	});
}

export async function expireTemporaryJobs({
	root,
	now = Date.now(),
}: {
	root: string;
	now?: number;
}) {
	const entries = await fs.readdir(root, { withFileTypes: true });
	await Promise.all(
		entries
			.filter(
				(entry) => entry.isDirectory() && /^job-[a-zA-Z0-9]+$/.test(entry.name),
			)
			.map(async (entry) => {
				const directory = path.join(root, entry.name);
				const stat = await fs.stat(directory).catch(() => null);
				if (stat && now - stat.mtimeMs >= PREVIEW_TTL_MS)
					await removeTemporaryJob({ root, directory });
			}),
	);
}

export function scheduleTemporaryJobExpiry({
	root,
	directory,
}: {
	root: string;
	directory: string;
}) {
	setTimeout(() => {
		void removeTemporaryJob({ root, directory }).catch((error: unknown) =>
			console.error("Cannot remove expired watermark preview:", error),
		);
	}, PREVIEW_TTL_MS).unref();
}
