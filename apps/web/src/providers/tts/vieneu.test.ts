import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FFmpegService } from "@/media/ffmpeg";
import { VieNeuTTSProvider } from "./vieneu";
import { SpeechProviderError } from "./types";

async function withDirectory(run: (directory: string) => Promise<void>) {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "opencode", "vieneu-test-"));
	try { await run(directory); }
	finally { await fs.rm(directory, { recursive: true, force: true }); }
}

test("VieNeu sends OpenAI-compatible request and writes decodable WAV", async () => {
	await withDirectory(async (directory) => {
		const fixture = path.join(directory, "fixture.wav");
		await FFmpegService.runCommand("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.25", fixture]);
		const audio = await fs.readFile(fixture);
		const fetchImpl: typeof fetch = Object.assign(async (url: string | URL | Request, options?: RequestInit) => {
			assert.equal(String(url), "http://localhost:8000/v1/audio/speech");
			const headers = new Headers(options?.headers);
			assert.equal(headers.get("Authorization"), "Bearer x");
			assert.equal(headers.get("Content-Type"), "application/json");
			const body = JSON.parse(String(options?.body));
			assert.equal(body.model, "vieneu-v3-turbo");
			assert.equal(body.voice, "Ngọc Huyền");
			assert.equal(body.input, "Xin chào");
			assert.equal(body.response_format, "wav");
			return new Response(audio, { headers: { "Content-Type": "audio/wav" } });
		}, { preconnect: fetch.preconnect });
		const provider = new VieNeuTTSProvider({ fetchImpl, wait: async () => {} });
		const outputPath = path.join(directory, "voice.wav");
		const result = await provider.generateSpeech({ text: "Xin chào", voice: "vi-VN-HoaiMyNeural", outputPath });
		assert.ok(result.duration > 0);
		assert.deepEqual(await fs.readFile(outputPath), audio);
	});
});

test("VieNeu maps Edge TTS voice IDs and falls back to default for unknown voices", async () => {
	await withDirectory(async (directory) => {
		const fixture = path.join(directory, "fixture.wav");
		await FFmpegService.runCommand("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.1", fixture]);
		const audio = await fs.readFile(fixture);
		const seenVoices: string[] = [];
		const fetchImpl: typeof fetch = Object.assign(async (_url: string | URL | Request, options?: RequestInit) => {
			const body = JSON.parse(String(options?.body));
			seenVoices.push(body.voice);
			return new Response(audio);
		}, { preconnect: fetch.preconnect });
		const provider = new VieNeuTTSProvider({ fetchImpl, wait: async () => {} });
		await provider.generateSpeech({ text: "A", voice: "vi-VN-HoaiMyNeural", outputPath: path.join(directory, "a.wav") });
		await provider.generateSpeech({ text: "B", voice: "vi-VN-NamMinhNeural", outputPath: path.join(directory, "b.wav") });
		await provider.generateSpeech({ text: "C", voice: "Mai Anh", outputPath: path.join(directory, "c.wav") });
		await provider.generateSpeech({ text: "D", voice: "unknown-voice", outputPath: path.join(directory, "d.wav") });
		await provider.generateSpeech({ text: "E", outputPath: path.join(directory, "e.wav") });
		await provider.generateSpeech({ text: "F", voice: "Quỳnh Anh", outputPath: path.join(directory, "f.wav") });
		assert.deepEqual(seenVoices, ["Ngọc Huyền", "Hải Đăng", "Mai Anh", "Hải Đăng", "Hải Đăng", "Quỳnh Anh"]);
	});
});

test("VieNeu getVoices returns 25 preset voices", async () => {
	const provider = new VieNeuTTSProvider();
	const voices = await provider.getVoices();
	assert.ok(voices.length >= 25);
	const names = voices.map((v) => v.name);
	assert.ok(names.includes("Hải Đăng"));
	assert.ok(names.includes("Quỳnh Anh"));
	assert.ok(names.includes("Mai Anh"));
});

test("VieNeu retries 429 with exponential backoff and honors Retry-After", async () => {
	await withDirectory(async (directory) => {
		const fixture = path.join(directory, "fixture.wav");
		await FFmpegService.runCommand("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.1", fixture]);
		const audio = await fs.readFile(fixture);
		const waits: number[] = [];
		let calls = 0;
		const fetchImpl: typeof fetch = Object.assign(async () => {
			calls++;
			if (calls <= 2) return new Response("busy", { status: 429, headers: { "Retry-After": "1" } });
			return new Response(audio);
		}, { preconnect: fetch.preconnect });
		const provider = new VieNeuTTSProvider({ fetchImpl, wait: async (ms) => { waits.push(ms); } });
		const result = await provider.generateSpeech({ text: "Xin chào", outputPath: path.join(directory, "voice.wav") });
		assert.ok(result.duration > 0);
		assert.equal(calls, 3);
		assert.deepEqual(waits, [1000, 2000]);
	});
});

test("VieNeu gives up after MAX_RETRIES on persistent 429", async () => {
	const fetchImpl: typeof fetch = Object.assign(async () =>
		new Response("busy", { status: 429, headers: { "Retry-After": "0" } }),
		{ preconnect: fetch.preconnect });
	const provider = new VieNeuTTSProvider({ fetchImpl, wait: async () => {} });
	await assert.rejects(provider.generateSpeech({ text: "Xin chào", outputPath: "/tmp/x.wav" }), (error: unknown) =>
		error instanceof SpeechProviderError && error.status === 429);
});

test("VieNeu rejects empty text and surfaces server errors with Retry-After", async () => {
	const empty = new VieNeuTTSProvider({ fetchImpl: fetch, wait: async () => {} });
	await assert.rejects(empty.generateSpeech({ text: "   ", outputPath: "/tmp/x.wav" }), (error: unknown) =>
		error instanceof SpeechProviderError && error.status === 400);

	const fetchImpl: typeof fetch = Object.assign(async () =>
		new Response("rate limited", { status: 429, headers: { "Retry-After": "5" } }),
		{ preconnect: fetch.preconnect });
	const limited = new VieNeuTTSProvider({ fetchImpl, wait: async () => {} });
	await assert.rejects(limited.generateSpeech({ text: "Xin chào", outputPath: "/tmp/x.wav" }), (error: unknown) =>
		error instanceof SpeechProviderError && error.status === 429 && error.retryAfterMs === 5000);

	const down: typeof fetch = Object.assign(async () => { throw new TypeError("fetch failed"); }, { preconnect: fetch.preconnect });
	const offline = new VieNeuTTSProvider({ fetchImpl: down, wait: async () => {} });
	await assert.rejects(offline.generateSpeech({ text: "Xin chào", outputPath: "/tmp/x.wav" }), (error: unknown) =>
		error instanceof SpeechProviderError && error.status === 0);
});
