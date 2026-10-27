import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

// Keep readers and writers in one queue even when Next reloads a route module.
const runtime = globalThis as typeof globalThis & {
	__storyFileOperations?: Map<string, Promise<unknown>>;
};
const operations = (runtime.__storyFileOperations ??= new Map());
const retryDelays = [25, 50, 100, 200, 400, 500, 500, 500, 500];

function isLocked(error: unknown) {
	return (
		error instanceof Error &&
		"code" in error &&
		["EPERM", "EACCES", "EBUSY"].includes(String(error.code))
	);
}

async function retryFileOperation<T>(operation: () => Promise<T>): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await operation();
		} catch (error) {
			if (!isLocked(error) || attempt === retryDelays.length) throw error;
			await delay(retryDelays[attempt]);
		}
	}
}

async function withFile<T>({
	filePath,
	operation,
}: {
	filePath: string;
	operation: () => Promise<T>;
}): Promise<T> {
	const absolute = path.resolve(filePath);
	const key = process.platform === "win32" ? absolute.toLowerCase() : absolute;
	const previous = operations.get(key) ?? Promise.resolve();
	const pending = previous.catch(() => {}).then(operation);
	operations.set(key, pending);
	try {
		return await pending;
	} finally {
		if (operations.get(key) === pending) operations.delete(key);
	}
}

async function readOptional(filePath: string) {
	try {
		return await retryFileOperation(() => fs.readFile(filePath, "utf8"));
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT")
			return undefined;
		throw error;
	}
}

async function commitPending(filePath: string) {
	try {
		await retryFileOperation(() => fs.rename(`${filePath}.pending`, filePath));
	} catch (error) {
		if (isLocked(error))
			throw new Error(
				`Chưa thể lưu ${path.basename(filePath)} vì tệp đang bị khóa. Bản lưu chờ đã được giữ lại. Đóng ứng dụng đang giữ tệp rồi thử lại để tiếp tục.`,
				{ cause: error },
			);
		throw error;
	}
}

/** Node filesystem IO: atomic replacement, Windows sharing locks and recovery. */
export async function readAtomicJSON<T>({
	filePath,
	validate = (value) => value,
}: {
	filePath: string;
	validate?: (value: T) => T;
}): Promise<T | null> {
	return withFile({
		filePath,
		async operation() {
			const pending = await readOptional(`${filePath}.pending`);
			if (pending !== undefined) {
				// A pending file is published only after its entire JSON was written.
				const value = validate(JSON.parse(pending));
				await commitPending(filePath);
				return value;
			}
			const saved = await readOptional(filePath);
			return saved === undefined ? null : validate(JSON.parse(saved));
		},
	});
}

export async function writeAtomicJSON({
	filePath,
	value,
}: {
	filePath: string;
	value: unknown;
}) {
	// Snapshot before queuing: job progress objects may change while IO waits.
	const contents = JSON.stringify(value, null, 2);
	await withFile({
		filePath,
		async operation() {
			const pending = await readOptional(`${filePath}.pending`);
			if (pending !== undefined) {
				JSON.parse(pending);
				await commitPending(filePath);
			}
			await fs.mkdir(path.dirname(filePath), { recursive: true });
			const temporary = `${filePath}.${randomUUID()}.tmp`;
			try {
				await fs.writeFile(temporary, contents, { flag: "wx" });
				await retryFileOperation(() =>
					fs.rename(temporary, `${filePath}.pending`),
				);
				// Keep the complete pending checkpoint if replacement stays locked.
				// Never unlink the committed file to work around a sharing violation.
				await commitPending(filePath);
			} finally {
				// Cleanup must not hide a save failure or turn a committed save into one.
				await retryFileOperation(() => fs.rm(temporary, { force: true })).catch(
					() => {},
				);
			}
		},
	});
}
