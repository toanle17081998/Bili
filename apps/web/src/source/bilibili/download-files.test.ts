import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { publishDownloadedFile } from "./download-files";

test("transient Windows locks retry the same completed file and publish it intact", async () => {
	const prefix = path.join(os.tmpdir(), "bili-publish-");
	const directory = await fs.mkdtemp(prefix);
	try {
		const temporaryPath = path.join(directory, "video.download.mp4");
		const finalPath = path.join(directory, "video.mp4");
		await fs.writeFile(temporaryPath, "completed video");
		let attempts = 0;
		const waits: number[] = [];
		await publishDownloadedFile({
			temporaryPath, finalPath,
			rename: async (...parameters) => {
				if (++attempts < 3) throw Object.assign(new Error("locked"), { code: attempts === 1 ? "EBUSY" : "EPERM" });
				await fs.rename(...parameters);
			},
			wait: async (milliseconds) => { waits.push(milliseconds); },
		});
		assert.equal(attempts, 3);
		assert.equal(waits.length, 2);
		assert.equal(await fs.readFile(finalPath, "utf8"), "completed video");
		await assert.rejects(fs.access(temporaryPath), { code: "ENOENT" });
	} finally {
		assert.ok(directory.startsWith(prefix));
		await fs.rm(directory, { recursive: true, force: true });
	}
});

test("a persistent lock preserves the completed download and any previous final file", async () => {
	const prefix = path.join(os.tmpdir(), "bili-publish-locked-");
	const directory = await fs.mkdtemp(prefix);
	try {
		const temporaryPath = path.join(directory, "video.download.mp4");
		const finalPath = path.join(directory, "video.mp4");
		await fs.writeFile(temporaryPath, "new completed video");
		await fs.writeFile(finalPath, "previous video");
		let attempts = 0;
		await assert.rejects(publishDownloadedFile({
			temporaryPath, finalPath,
			rename: async () => { attempts++; throw Object.assign(new Error("locked"), { code: "EACCES" }); },
			wait: async () => {},
		}), /đã tải xong.*được giữ lại/);
		assert.ok(attempts > 1 && attempts <= 10);
		assert.equal(await fs.readFile(temporaryPath, "utf8"), "new completed video");
		assert.equal(await fs.readFile(finalPath, "utf8"), "previous video");
		let waits = 0;
		await assert.rejects(publishDownloadedFile({
			temporaryPath, finalPath,
			rename: async () => { throw Object.assign(new Error("disk full"), { code: "ENOSPC" }); },
			wait: async () => { waits++; },
		}), { code: "ENOSPC" });
		assert.equal(waits, 0, "non-lock failures are returned immediately");
	} finally {
		assert.ok(directory.startsWith(prefix));
		await fs.rm(directory, { recursive: true, force: true });
	}
});

test("Windows: publishing succeeds after a real reader releases its file lock", { skip: process.platform !== "win32", timeout: 15000 }, async () => {
	const prefix = path.join(os.tmpdir(), "bili-publish-windows-");
	const directory = await fs.mkdtemp(prefix);
	let release: (() => Promise<unknown>) | undefined;
	let publishing: Promise<void> | undefined;
	try {
		const temporaryPath = path.join(directory, "video.download.mp4");
		const finalPath = path.join(directory, "video.mp4");
		await fs.writeFile(temporaryPath, "completed video");
		const script = `
$stream = [IO.File]::Open($env:BILI_TEST_LOCK_FILE, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
try {
  [Console]::Out.WriteLine('locked')
  [Console]::Out.Flush()
  $null = [Console]::ReadLine()
} finally { $stream.Dispose() }
`;
		const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
			windowsHide: true,
			env: { ...process.env, BILI_TEST_LOCK_FILE: temporaryPath },
			stdio: ["pipe", "pipe", "pipe"],
		});
		const closed = once(child, "close");
		release = async () => { child.stdin.end("\n"); return closed; };
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error("File lock timed out")), 5000);
			child.once("error", (error) => { clearTimeout(timer); reject(error); });
			child.once("close", () => { clearTimeout(timer); reject(new Error("File lock process exited")); });
			child.stdout.once("data", () => { clearTimeout(timer); resolve(); });
		});
		publishing = publishDownloadedFile({ temporaryPath, finalPath });
		await delay(150);
		await fs.access(temporaryPath);
		await assert.rejects(fs.access(finalPath), { code: "ENOENT" });
		await release();
		release = undefined;
		await publishing;
		assert.equal(await fs.readFile(finalPath, "utf8"), "completed video");
	} finally {
		await release?.();
		await publishing?.catch(() => {});
		assert.ok(directory.startsWith(prefix));
		await fs.rm(directory, { recursive: true, force: true });
	}
});
