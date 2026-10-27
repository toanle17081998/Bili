import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { readAtomicJSON, writeAtomicJSON } from "./atomic-json";
import { readStoryProject, storyDirectory, writeStoryJSON } from "./storage";

function testDirectory() {
	const projectId = `story-test-${randomUUID()}`;
	const directory = storyDirectory(projectId);
	return {
		projectId,
		directory,
		filePath: path.join(directory, "project.json"),
		async cleanup() {
			const root = path.dirname(directory);
			assert.ok(path.basename(root).startsWith("story-test-"));
			await fs.rm(root, { recursive: true, force: true });
		},
	};
}

/** A real Windows reader that permits reads but denies rename/delete sharing. */
async function lockFile(filePath: string) {
	const script = `
$stream = [IO.File]::Open($env:STORY_TEST_LOCK_FILE, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
try {
  [Console]::Out.WriteLine('locked')
  [Console]::Out.Flush()
  $null = [Console]::ReadLine()
} finally { $stream.Dispose() }
`;
	const child = spawn(
		"powershell.exe",
		[
			"-NoProfile",
			"-NonInteractive",
			"-EncodedCommand",
			Buffer.from(script, "utf16le").toString("base64"),
		],
		{
			windowsHide: true,
			env: { ...process.env, STORY_TEST_LOCK_FILE: filePath },
			stdio: ["pipe", "pipe", "pipe"],
		},
	);
	const exited = once(child, "exit");
	let output = "";
	let errors = "";
	child.stderr.on("data", (data) => (errors += data.toString()));
	try {
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error("File lock timed out")),
				5000,
			);
			child.once("error", (error) => {
				clearTimeout(timer);
				reject(error);
			});
			child.once("exit", () => {
				clearTimeout(timer);
				reject(new Error(`File lock process exited: ${errors}`));
			});
			child.stdout.on("data", (data) => {
				output += data.toString();
				if (output.includes("locked")) {
					clearTimeout(timer);
					resolve();
				}
			});
		});
	} catch (error) {
		child.kill();
		await exited.catch(() => {});
		throw error;
	}
	return async () => {
		child.stdin.end("\n");
		await exited;
	};
}

test("concurrent checkpoint writes and polling read complete snapshots in order", async () => {
	const fixture = testDirectory();
	try {
		const value = { revision: 0, payload: "checkpoint".repeat(16000) };
		const operations: Promise<unknown>[] = [];
		for (let revision = 0; revision < 20; revision++) {
			value.revision = revision;
			operations.push(writeAtomicJSON({ filePath: fixture.filePath, value }));
			operations.push(
				readAtomicJSON<typeof value>({ filePath: fixture.filePath }).then(
					(saved) => {
						assert.equal(saved?.revision, revision);
						assert.equal(saved?.payload, value.payload);
					},
				),
			);
		}
		value.revision = 999;
		await Promise.all(operations);
		assert.equal(
			(await readAtomicJSON<typeof value>({ filePath: fixture.filePath }))
				?.revision,
			19,
		);
		assert.deepEqual(await fs.readdir(fixture.directory), ["project.json"]);
	} finally {
		await fixture.cleanup();
	}
});

test("a complete pending checkpoint recovers after restart; invalid pending data never replaces the committed project", async () => {
	const fixture = testDirectory();
	const previous = {
		schema_version: 1,
		project_id: fixture.projectId,
		revision: 10,
		analyzed_windows: 6,
		story: { full_script: "Saved story" },
		segments: [] as { segment_id: string }[],
	};
	try {
		await writeStoryJSON({
			projectId: fixture.projectId,
			name: "project.json",
			value: previous,
		});
		const next = {
			...previous,
			revision: 11,
			segments: [{ segment_id: "s1" }],
		};
		await fs.writeFile(`${fixture.filePath}.pending`, JSON.stringify(next));
		assert.deepEqual(await readStoryProject(fixture.projectId), next);
		assert.deepEqual(
			JSON.parse(await fs.readFile(fixture.filePath, "utf8")),
			next,
		);
		assert.deepEqual(await fs.readdir(fixture.directory), ["project.json"]);
		await fs.writeFile(
			`${fixture.filePath}.pending`,
			JSON.stringify({ ...next, project_id: "wrong-project" }),
		);
		await assert.rejects(
			readStoryProject(fixture.projectId),
			/không được hỗ trợ/,
		);
		assert.deepEqual(
			JSON.parse(await fs.readFile(fixture.filePath, "utf8")),
			next,
		);
		await fs.writeFile(`${fixture.filePath}.pending`, '{"revision":');
		await assert.rejects(readStoryProject(fixture.projectId), SyntaxError);
		assert.deepEqual(
			JSON.parse(await fs.readFile(fixture.filePath, "utf8")),
			next,
		);
	} finally {
		await fixture.cleanup();
	}
});

test("a filesystem failure is surfaced and does not poison later operations on the same file", async () => {
	const fixture = testDirectory();
	try {
		await fs.mkdir(path.dirname(fixture.directory), { recursive: true });
		await fs.writeFile(fixture.directory, "not a directory");
		await assert.rejects(
			writeAtomicJSON({ filePath: fixture.filePath, value: { revision: 1 } }),
		);
		await fs.rm(fixture.directory);
		await writeAtomicJSON({
			filePath: fixture.filePath,
			value: { revision: 2 },
		});
		assert.deepEqual(await readAtomicJSON({ filePath: fixture.filePath }), {
			revision: 2,
		});
	} finally {
		await fixture.cleanup();
	}
});

test(
	"Windows: retry a real EPERM rename while polling, then commit without losing the old file",
	{ skip: process.platform !== "win32", timeout: 30000 },
	async () => {
		const fixture = testDirectory();
		let release: (() => Promise<void>) | undefined;
		try {
			await writeAtomicJSON({
				filePath: fixture.filePath,
				value: { revision: 10 },
			});
			release = await lockFile(fixture.filePath);
			const probe = path.join(fixture.directory, "probe.tmp");
			await fs.writeFile(probe, "probe");
			await assert.rejects(
				fs.rename(probe, fixture.filePath),
				(error: unknown) => {
					assert.ok(error instanceof Error && "code" in error);
					assert.ok(["EPERM", "EACCES", "EBUSY"].includes(String(error.code)));
					return true;
				},
			);
			await fs.rm(probe);
			const saving = writeAtomicJSON({
				filePath: fixture.filePath,
				value: { revision: 11 },
			});
			const polling = readAtomicJSON({ filePath: fixture.filePath });
			await delay(300);
			assert.deepEqual(
				JSON.parse(await fs.readFile(fixture.filePath, "utf8")),
				{ revision: 10 },
			);
			await release();
			release = undefined;
			await saving;
			assert.deepEqual(await polling, { revision: 11 });
			assert.deepEqual(await fs.readdir(fixture.directory), ["project.json"]);
		} finally {
			await release?.();
			await fixture.cleanup();
		}
	},
);

test(
	"Windows: a persistent lock reports failure but keeps both committed and pending checkpoints for retry",
	{ skip: process.platform !== "win32", timeout: 30000 },
	async () => {
		const fixture = testDirectory();
		let release: (() => Promise<void>) | undefined;
		try {
			await writeAtomicJSON({
				filePath: fixture.filePath,
				value: { revision: 10 },
			});
			release = await lockFile(fixture.filePath);
			await assert.rejects(
				writeAtomicJSON({
					filePath: fixture.filePath,
					value: { revision: 11 },
				}),
				/đang bị khóa.*Bản lưu chờ đã được giữ lại/,
			);
			assert.deepEqual(
				JSON.parse(await fs.readFile(fixture.filePath, "utf8")),
				{ revision: 10 },
			);
			assert.deepEqual(
				JSON.parse(await fs.readFile(`${fixture.filePath}.pending`, "utf8")),
				{ revision: 11 },
			);
			await release();
			release = undefined;
			assert.deepEqual(await readAtomicJSON({ filePath: fixture.filePath }), {
				revision: 11,
			});
			assert.deepEqual(await fs.readdir(fixture.directory), ["project.json"]);
		} finally {
			await release?.();
			await fixture.cleanup();
		}
	},
);
