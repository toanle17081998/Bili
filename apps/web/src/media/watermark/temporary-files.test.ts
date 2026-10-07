import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expireTemporaryJobs, removeTemporaryJob } from "./temporary-files";

test("preview expiry removes abandoned jobs but keeps recent jobs and unrelated files", async () => {
	const root = await fs.mkdtemp(
		path.join(os.tmpdir(), "opencut-watermark-storage-"),
	);
	try {
		for (const name of ["job-expired", "job-recent", "unrelated"])
			await fs.mkdir(path.join(root, name));
		await fs.writeFile(path.join(root, "job-expired", "clean.mp4"), "preview");
		const old = new Date(Date.now() - 2 * 60 * 60_000);
		await fs.utimes(path.join(root, "job-expired"), old, old);
		await expireTemporaryJobs({ root });
		assert.deepEqual((await fs.readdir(root)).sort(), [
			"job-recent",
			"unrelated",
		]);
		await assert.rejects(
			removeTemporaryJob({
				root,
				directory: path.join(root, "..", "job-outside"),
			}),
		);
		await assert.rejects(removeTemporaryJob({ root, directory: root }));
		await assert.rejects(
			removeTemporaryJob({ root, directory: path.join(root, "unrelated") }),
		);
	} finally {
		assert.ok(
			root.startsWith(path.join(os.tmpdir(), "opencut-watermark-storage-")),
		);
		await fs.rm(root, { recursive: true, force: true });
	}
});
