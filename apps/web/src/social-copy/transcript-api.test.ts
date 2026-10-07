import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/social-copy/transcript/route";
import { FFmpegService } from "@/media/ffmpeg";
import { FasterWhisperTranscriptionProvider, GeminiTranscriptionProvider } from "@/providers/transcription";

function request(audio?: File) {
	const form = new FormData();
	if (audio) form.append("audio", audio);
	return new NextRequest("http://localhost/api/social-copy/transcript", { method: "POST", body: form });
}

test("transcript API validates uploads before attempting speech recognition", async () => {
	assert.equal((await POST(new NextRequest("http://localhost/api/social-copy/transcript", {
		method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
	}))).status, 400);
	assert.equal((await POST(request())).status, 400);
	assert.equal((await POST(request(new File([], "empty.webm")))).status, 400);
	const oversized = new File([new Uint8Array(25 * 1024 * 1024 + 1)], "large.webm");
	assert.equal((await POST(request(oversized))).status, 413);
});

test("timeline audio is normalized, transcribed without TTS, and temporary files are cleaned on success or failure", async () => {
	const originalRun = FFmpegService.runCommand;
	const originalGemini = GeminiTranscriptionProvider.prototype.transcribe;
	const originalLocal = FasterWhisperTranscriptionProvider.prototype.transcribe;
	const gemini = process.env.GEMINI_API_KEY;
	const openai = process.env.OPENAI_API_KEY;
	let directory = "";
	let fail = false;
	let empty = false;
	let usedLocal = false;
	try {
		FFmpegService.runCommand = async (...parameters: Parameters<typeof FFmpegService.runCommand>) => {
			const [command, args] = parameters;
			assert.equal(command, "ffmpeg");
			assert.ok(args.includes("16000"));
			const output = args[args.length - 1];
			directory = path.dirname(output);
			assert.equal(await fs.readFile(path.join(directory, "timeline.webm"), "utf8"), "timeline-audio");
			await fs.writeFile(output, "normalized-audio");
			return { stdout: "", stderr: "" };
		};
		const transcribe = async (file: string) => {
			assert.equal(await fs.readFile(file, "utf8"), "normalized-audio");
			if (fail) throw new Error("Speech recognition unavailable");
			return empty ? [] : [
				{ start: 0, end: 2, text: "  Thử nghiệm cầu LEGO. " },
				{ start: 2, end: 4, text: "Kiểm tra độ chịu tải." },
			];
		};
		GeminiTranscriptionProvider.prototype.transcribe = transcribe;
		FasterWhisperTranscriptionProvider.prototype.transcribe = async (file) => {
			usedLocal = true;
			return transcribe(file);
		};
		process.env.GEMINI_API_KEY = "test-placeholder";
		const audio = new File(["timeline-audio"], "timeline.webm", { type: "audio/webm" });
		let response = await POST(request(audio));
		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), { content: "Thử nghiệm cầu LEGO.\nKiểm tra độ chịu tải." });
		await assert.rejects(fs.stat(directory), { code: "ENOENT" });

		delete process.env.GEMINI_API_KEY;
		delete process.env.OPENAI_API_KEY;
		response = await POST(request(audio));
		assert.equal(response.status, 200);
		assert.equal(usedLocal, true, "local recognition is available without an AI API key");
		await assert.rejects(fs.stat(directory), { code: "ENOENT" });

		empty = true;
		assert.equal((await POST(request(audio))).status, 422);
		await assert.rejects(fs.stat(directory), { code: "ENOENT" });
		fail = true;
		response = await POST(request(audio));
		assert.equal(response.status, 502);
		assert.match((await response.json()).error, /Speech recognition unavailable/);
		await assert.rejects(fs.stat(directory), { code: "ENOENT" });
	} finally {
		FFmpegService.runCommand = originalRun;
		GeminiTranscriptionProvider.prototype.transcribe = originalGemini;
		FasterWhisperTranscriptionProvider.prototype.transcribe = originalLocal;
		if (gemini === undefined) delete process.env.GEMINI_API_KEY;
		else process.env.GEMINI_API_KEY = gemini;
		if (openai === undefined) delete process.env.OPENAI_API_KEY;
		else process.env.OPENAI_API_KEY = openai;
	}
});
