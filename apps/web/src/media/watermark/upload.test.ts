import { test } from "node:test";
import assert from "node:assert/strict";
import { readWatermarkUpload, UploadLimitError } from "./upload";

function chunkedRequest({
	bytes,
	onCancel,
}: {
	bytes: number;
	onCancel?: () => void;
}) {
	const stream = new ReadableStream<Uint8Array>({
		pull(controller) {
			controller.enqueue(new Uint8Array(bytes));
		},
		cancel() {
			onCancel?.();
		},
	});
	return new Request("http://localhost/upload", {
		method: "POST",
		body: stream,
		duplex: "half",
		headers: { "content-type": "multipart/form-data; boundary=test" },
	} as RequestInit);
}

test("upload bounds chunked requests without Content-Length and cancels ingestion", async () => {
	let cancelled = false;
	const request = chunkedRequest({
		bytes: 40,
		onCancel: () => {
			cancelled = true;
		},
	});
	assert.equal(request.headers.get("content-length"), null);
	await assert.rejects(
		readWatermarkUpload({
			request,
			maxBytes: 60,
			signal: new AbortController().signal,
		}),
		UploadLimitError,
	);
	assert.equal(cancelled, true);
});

test("upload bounds oversized non-video multipart fields", async () => {
	const form = new FormData();
	form.append("regions", "x".repeat(1000));
	const request = new Request("http://localhost/upload", {
		method: "POST",
		body: form,
	});
	await assert.rejects(
		readWatermarkUpload({
			request,
			maxBytes: 100,
			signal: new AbortController().signal,
		}),
		UploadLimitError,
	);
});

test("upload parses valid multipart data", async () => {
	const form = new FormData();
	form.append(
		"video",
		new Blob(["video"], { type: "video/mp4" }),
		"source.mp4",
	);
	form.append("regions", "[]");
	const parsed = await readWatermarkUpload({
		request: new Request("http://localhost/upload", {
			method: "POST",
			body: form,
		}),
		maxBytes: 2048,
		signal: new AbortController().signal,
	});
	assert.equal(parsed.get("regions"), "[]");
	const video = parsed.get("video");
	assert.ok(video instanceof File);
	assert.equal(video.size, 5);
});

test("abort interrupts a stalled upload", async () => {
	const controller = new AbortController();
	let cancelled = false;
	const request = new Request("http://localhost/upload", {
		method: "POST",
		duplex: "half",
		body: new ReadableStream({
			cancel() {
				cancelled = true;
			},
		}),
		headers: { "content-type": "multipart/form-data; boundary=test" },
	} as RequestInit);
	const pending = readWatermarkUpload({
		request,
		maxBytes: 100,
		signal: controller.signal,
	});
	controller.abort();
	await assert.rejects(pending);
	assert.equal(cancelled, true);
});
