import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { FFmpegService } from "@/media/ffmpeg";
import { POST as uploadSource } from "@/app/api/localization/sources/route";
import { POST as previewVideo } from "@/app/api/localization/preview/route";
import {
	POST as processVideo,
	GET as getResult,
} from "@/app/api/localization/process/route";
import {
	resolveNarrationSource,
	cleanupNarrationSources,
	retainNarrationSource,
	readNarrationDuration,
} from "./source";

function request(body: unknown) {
	return new NextRequest("http://localhost/api/localization/test", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

test("narration APIs validate identifiers and do not accept arbitrary source files", async () => {
	for (const handler of [previewVideo, processVideo]) {
		assert.equal(
			(
				await handler(
					request({ projectId: "test", notes: "x".repeat(1024 * 1024) }),
				)
			).status,
			413,
		);
		assert.equal(
			(
				await handler(
					new NextRequest("http://localhost/api/localization/test", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: ":",
					}),
				)
			).status,
			400,
		);
		assert.equal(
			(await handler(request({ projectId: "../escape", mode: "narration" })))
				.status,
			400,
		);
		assert.equal(
			(await handler(request({ projectId: "test", mode: "other" }))).status,
			400,
		);
		assert.equal(
			(
				await handler(
					request({
						projectId: "test",
						mode: "narration",
						videoPath: import.meta.path,
					}),
				)
			).status,
			404,
		);
	}
	assert.equal((await uploadSource(request({}))).status, 415);
});

test("uploaded narration sources preserve selected trim, need reviewed scripts and isolate result modes", async () => {
	const projectId = `narration-test-${randomUUID()}`;
	const directory = path.resolve(
		process.cwd(),
		".local_storage",
		"projects",
		projectId,
	);
	try {
		await fs.mkdir(directory, { recursive: true });
		const inputPath = path.join(directory, "input.mp4");
		await FFmpegService.runCommand("ffmpeg", [
			"-y",
			"-f",
			"lavfi",
			"-i",
			"testsrc2=size=96x64:rate=10:duration=8",
			"-an",
			"-c:v",
			"libx264",
			inputPath,
		]);
		const form = new FormData();
		form.set("projectId", projectId);
		form.set("start", "2");
		form.set("duration", "4.4");
		form.set(
			"video",
			new File([await fs.readFile(inputPath)], "silent.mp4", {
				type: "video/mp4",
			}),
		);
		const response = await uploadSource(
			new NextRequest("http://localhost/api/localization/sources", {
				method: "POST",
				body: form,
			}),
		);
		const uploaded = await response.json();
		assert.equal(response.status, 201, uploaded.error);
		assert.equal(
			await resolveNarrationSource(projectId, uploaded.videoPath),
			uploaded.videoPath,
		);
		await assert.rejects(
			resolveNarrationSource(projectId, inputPath),
			/không hợp lệ/,
		);
		const probe = await FFmpegService.probeVideo(uploaded.videoPath);
		assert.equal(await readNarrationDuration(uploaded.videoPath), 4.4);
		assert.notEqual(
			probe.duration,
			4.4,
			"proxy duration is independent from the selected clip",
		);
		assert.equal(probe.hasAudio, false);
		assert.equal(probe.fps, 2);
		assert.ok(probe.width <= 512 && probe.height <= 512);
		assert.deepEqual(await fs.readdir(path.dirname(uploaded.videoPath)), [
			"source.json",
			"video.mp4",
		]);
		const unreviewed = await processVideo(
			request({ projectId, mode: "narration", videoPath: uploaded.videoPath }),
		);
		assert.equal(unreviewed.status, 422);
		await fs.writeFile(
			path.join(directory, "latest-project.json"),
			JSON.stringify({ id: projectId, mode: "narration" }),
		);
		assert.equal(
			(
				await getResult(
					new NextRequest(
						`http://localhost/api/localization/process?projectId=${projectId}`,
					),
				)
			).status,
			404,
		);
		await fs.writeFile(
			path.join(directory, "latest-narration.json"),
			JSON.stringify({ id: projectId, mode: "narration" }),
		);
		assert.equal(
			(
				await getResult(
					new NextRequest(
						`http://localhost/api/localization/process?projectId=${projectId}&mode=narration`,
					),
				)
			).status,
			200,
		);
		await fs.writeFile(
			path.join(directory, "latest-project.json"),
			JSON.stringify({ id: projectId }),
		);
		assert.equal(
			(
				await getResult(
					new NextRequest(
						`http://localhost/api/localization/process?projectId=${projectId}`,
					),
				)
			).status,
			200,
			"legacy dubbing results remain accessible",
		);
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
});

test("narration source expiry leaves files leased by active analysis or synthesis untouched", async () => {
	const root = path.resolve(
		process.cwd(),
		".local_storage",
		"projects",
		`expiry-${randomUUID()}`,
	);
	try {
		for (const name of ["source-old", "source-active"]) {
			const directory = path.join(root, name);
			await fs.mkdir(directory, { recursive: true });
			await fs.writeFile(path.join(directory, "video.mp4"), "test");
			await fs.utimes(path.join(directory, "video.mp4"), 0, 0);
			await fs.utimes(directory, new Date(), new Date());
		}
		const release = retainNarrationSource(
			path.join(root, "source-active", "video.mp4"),
		);
		await cleanupNarrationSources(root);
		assert.deepEqual(await fs.readdir(root), ["source-active"]);
		await release();
		await cleanupNarrationSources(root);
		assert.deepEqual(await fs.readdir(root), []);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});
