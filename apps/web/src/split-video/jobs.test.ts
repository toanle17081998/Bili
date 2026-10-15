import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { FFmpegService } from "@/media/ffmpeg";
import { POST, GET, PUT, PATCH, DELETE } from "@/app/api/source/split/route";

test("split requests acknowledge a durable background job and survive the client leaving", async () => {
	const batchId = randomUUID();
	const editorId = randomUUID();
	const source = path.resolve(
		process.cwd(),
		".local_storage/downloads",
		`split-resume-test-${batchId}.mp4`,
	);
	await fs.mkdir(path.dirname(source), { recursive: true });
	try {
		await FFmpegService.runCommand("ffmpeg", [
			"-y",
			"-f",
			"lavfi",
			"-i",
			"color=blue:s=160x96:d=12:r=30",
			"-c:v",
			"libx264",
			source,
		]);
		const draft = await PUT(
			new NextRequest("http://127.0.0.1:3000/api/source/split", {
				method: "PUT",
				body: JSON.stringify({
					batchId,
					sourceVideoPath: source,
					cuts: [4, 8],
					baseName: "Resume test",
					revision: 10,
					editorId,
					draftStep: "confirm",
				}),
			}),
		);
		assert.equal(draft.status, 200);
		await PUT(
			new NextRequest("http://127.0.0.1:3000/api/source/split", {
				method: "PUT",
				body: JSON.stringify({
					batchId,
					sourceVideoPath: source,
					cuts: [3],
					baseName: "Older draft",
					revision: 9,
					draftStep: "cuts",
				}),
			}),
		);
		const restored = await GET(
			new NextRequest(
				`http://127.0.0.1:3000/api/source/split?batchId=${batchId}`,
			),
		);
		assert.deepEqual(
			(await restored.json()).job.cuts,
			[4, 8],
			"late autosave must not erase newer cuts",
		);
		await PUT(
			new NextRequest("http://127.0.0.1:3000/api/source/split", {
				method: "PUT",
				body: JSON.stringify({
					batchId,
					sourceVideoPath: source,
					cuts: [4, 8],
					baseName: "Resume test",
					revision: 11,
					baseRevision: 10,
					editorId,
					draftStep: "confirm",
				}),
			}),
		);
		const conflict = await PUT(
			new NextRequest("http://127.0.0.1:3000/api/source/split", {
				method: "PUT",
				body: JSON.stringify({
					batchId,
					sourceVideoPath: source,
					cuts: [3],
					baseName: "Stale tab",
					revision: 12,
					baseRevision: 10,
					editorId: randomUUID(),
					draftStep: "cuts",
				}),
			}),
		);
		assert.equal(
			conflict.status,
			409,
			"a stale tab cannot assign a fresh timestamp and erase newer work",
		);
		const controller = new AbortController();
		const simultaneous = await Promise.all([
			POST(
				new NextRequest("http://127.0.0.1:3000/api/source/split", {
					method: "POST",
					signal: controller.signal,
					body: JSON.stringify({
						batchId,
						sourceVideoPath: source,
						cuts: [4, 8],
						baseName: "Resume test",
					}),
				}),
			),
			POST(
				new NextRequest("http://127.0.0.1:3000/api/source/split", {
					method: "POST",
					body: JSON.stringify({
						batchId,
						sourceVideoPath: source,
						cuts: [4, 8],
						baseName: "Resume test",
					}),
				}),
			),
		]);
		const response = simultaneous[0];
		assert.equal(
			simultaneous[1].status,
			202,
			"double starts share the same worker rather than cancel one another",
		);
		assert.equal(
			response.status,
			202,
			"the request must return before long FFmpeg work rather than tie it to the open tab",
		);
		controller.abort();
		let status: {
			status?: string;
			cuts?: number[];
			result?: { parts: unknown[] };
		} = {};
		for (let attempt = 0; attempt < 100; attempt++) {
			const state = await GET(
				new NextRequest(
					`http://127.0.0.1:3000/api/source/split?batchId=${batchId}`,
				),
			);
			assert.equal(state.status, 200);
			const data = await state.json();
			status = data.job;
			if (status.status === "ready") break;
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		assert.equal(status.status, "ready");
		assert.deepEqual(status.cuts, [4, 8]);
		assert.equal(status.result?.parts.length, 3);
		const listed = await GET(
			new NextRequest("http://127.0.0.1:3000/api/source/split?jobs=1"),
		);
		assert.ok(
			(await listed.json()).jobs.some(
				(job: { batchId: string }) => job.batchId === batchId,
			),
		);
		const paused = await PATCH(
			new NextRequest("http://127.0.0.1:3000/api/source/split", {
				method: "PATCH",
				body: JSON.stringify({ action: "pause", batchId }),
			}),
		);
		assert.equal(paused.status, 200);
		assert.deepEqual(
			(await paused.json()).job.cuts,
			[4, 8],
			"explicit stop also keeps the user's cut points",
		);
		const resumed = await POST(
			new NextRequest("http://127.0.0.1:3000/api/source/split", {
				method: "POST",
				body: JSON.stringify({
					batchId,
					sourceVideoPath: source,
					cuts: [4, 8],
					baseName: "Resume test",
				}),
			}),
		);
		assert.equal(
			(await resumed.json()).job.status,
			"ready",
			"ready files are reused on resume",
		);
	} finally {
		await DELETE(
			new NextRequest(
				`http://127.0.0.1:3000/api/source/split?batchId=${batchId}&discard=1`,
				{ method: "DELETE" },
			),
		);
		const staleAfterDiscard = await PUT(
			new NextRequest("http://127.0.0.1:3000/api/source/split", {
				method: "PUT",
				body: JSON.stringify({
					batchId,
					sourceVideoPath: source,
					cuts: [4, 8],
					baseName: "Late unload",
					revision: 100,
					editorId,
					draftStep: "confirm",
				}),
			}),
		);
		assert.equal(
			staleAfterDiscard.status,
			410,
			"a keepalive autosave cannot resurrect an explicitly discarded draft",
		);
		await fs.rm(source, { force: true });
	}
});
