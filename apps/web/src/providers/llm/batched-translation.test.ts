import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { OpenAILLMProvider, GeminiLLMProvider } from "./index";
import { TranslationCooldownError } from "./free-translate";
import type { TranscriptSegment } from "@/localization/schemas";
import { translationPrompt, translateInBatches } from "./batched-translation";

test("the shipped Rust prompt requests playful adaptation while preserving facts and dubbing constraints", async () => {
	const source = { start: 0, end: 3, text: "齿轮卡住了" };
	const prompt = await translationPrompt({ inputs: [{ id: 7, source }], context: ["Testing a machine"] });
	for (const instruction of ["trẻ trung, hơi bựa", "không dịch từng chữ", "thiếu ngữ cảnh", "không bịa sự việc", "số liệu", "không thêm câu đùa làm tràn thời lượng", "Không gộp, bỏ hay tách đoạn"]) {
		assert.ok(prompt.includes(instruction), instruction);
	}
	const payload = JSON.parse(prompt.slice(prompt.indexOf('{"context":')));
	assert.deepEqual(payload.context, ["Testing a machine"]);
	assert.deepEqual(payload.segments, [{ id: 7, text: source.text, targetDuration: 3 }]);
});

const InputSchema = z.object({ id: z.number(), text: z.string(), targetDuration: z.number() });
const transcript = (count: number): TranscriptSegment[] => Array.from({ length: count }, (_, index) => ({
	start: index * 3, end: index * 3 + 2, text: `原文 ${index}`,
}));
const reply = (content: unknown) => Response.json({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) }, finish_reason: "stop" }] });
test("translation overlaps two batches, bounds concurrency, and restores order after out-of-order completion", async () => {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => { release = resolve; });
	const calls: number[][] = [];
	const finished: number[] = [];
	let active = 0;
	let peak = 0;
	const job = translateInBatches({ segments: transcript(19), namespace: "test", cacheDirectory: false,
		request: async ({ inputs }) => {
			calls.push(inputs.map(({ id }) => id));
			peak = Math.max(peak, ++active);
			if (inputs[0].id === 0) await gate;
			finished.push(inputs[0].id);
			active--;
			return inputs.map(({ id }) => ({ id, vietnameseText: `Dịch ${id}` }));
		},
	});
	try {
		await new Promise((resolve) => setTimeout(resolve, 100));
		assert.ok(calls.length >= 2, "a second batch must start before the first finishes");
		assert.equal(peak, 2);
		assert.ok(finished.includes(6));
	} finally { release(); await job; }
	const result = await job;
	assert.equal(peak, 2);
	assert.deepEqual(result.map(({ vietnameseText }) => vietnameseText), transcript(19).map((_, id) => `Dịch ${id}`));
});

test("an upstream failure drains in-flight translation without starting later batches", async () => {
	const calls: number[] = [];
	let inFlightFinished = false;
	await assert.rejects(translateInBatches({ segments: transcript(19), namespace: "test", cacheDirectory: false,
		request: async ({ inputs }) => {
			calls.push(inputs[0].id);
			if (inputs[0].id === 0) throw new Error("upstream limited");
			await new Promise((resolve) => setTimeout(resolve, 20));
			inFlightFinished = true;
			return inputs.map(({ id }) => ({ id, vietnameseText: `Dịch ${id}` }));
		},
	}), /upstream limited/);
	assert.deepEqual(calls, [0, 6]);
	assert.equal(inFlightFinished, true);
});

function inputsFromRequest(options?: RequestInit) {
	const envelope = JSON.parse(String(options?.body));
	assert.equal(envelope.response_format.type, "json_object");
	const prompt = String(envelope.messages[0].content);
	assert.match(prompt, /JSON OBJECT/);
	return InputSchema.array().parse(JSON.parse(prompt.slice(prompt.indexOf('{"context":'))).segments);
}

test("large transcripts use bounded JSON-object batches and restore source order/timing from IDs", async () => {
	const batches: number[][] = [];
	const source = transcript(13);
	const provider = new OpenAILLMProvider({ apiKey: "test-placeholder", cacheDirectory: false,
		fetchImpl: async (_url, options) => {
			const rows = inputsFromRequest(options);
			batches.push(rows.map((row) => row.id));
			return reply({ segments: rows.toReversed().map(({ id }) => ({ id, vietnameseText: `Bản dịch ${id}` })) });
		},
	});
	const result = await provider.translateAndRewrite(source);
	assert.deepEqual(batches.map((batch) => batch.length), [6, 6, 1]);
	assert.equal(result.length, source.length);
	for (let index = 0; index < source.length; index++) {
		assert.equal(result[index].sourceText, source[index].text);
		assert.equal(result[index].sourceStart, source[index].start);
		assert.equal(result[index].sourceEnd, source[index].end);
		assert.equal(result[index].targetDuration, 2);
		assert.equal(result[index].vietnameseText, `Bản dịch ${index}`);
	}
});

test("only missing IDs are retried and valid translations are retained", async () => {
	const calls: number[][] = [];
	const provider = new OpenAILLMProvider({ apiKey: "test-placeholder", cacheDirectory: false,
		fetchImpl: async (_url, options) => {
			const inputs = inputsFromRequest(options);
			calls.push(inputs.map((input) => input.id));
			if (calls.length === 2) return reply({ error: "invalid generated response" });
			return reply({ segments: inputs.filter((input) => calls.length !== 1 || input.id !== 3)
				.map(({ id }) => ({ id, vietnameseText: `Dịch ${id}` })) });
		},
	});
	const result = await provider.translateAndRewrite(transcript(6));
	assert.equal(result.length, 6);
	assert.deepEqual(calls, [[0, 1, 2, 3, 4, 5], [3], [3]]);
	assert.equal(result[3].vietnameseText, "Dịch 3");
});

test("legacy translations envelopes match repeated source text using the source timestamps", async () => {
	const source = transcript(2).map((segment) => ({ ...segment, text: "重复" }));
	let calls = 0;
	const provider = new OpenAILLMProvider({ apiKey: "test-placeholder", cacheDirectory: false,
		fetchImpl: async () => {
			calls++;
			return reply({ translations: source.toReversed().map((segment) => ({
				sourceText: segment.text, sourceStart: segment.start, sourceEnd: segment.end,
				vietnameseText: `Lặp tại ${segment.start}`,
			})) });
		},
	});
	const result = await provider.translateAndRewrite(source);
	assert.equal(calls, 1);
	assert.deepEqual(result.map((item) => item.vietnameseText), ["Lặp tại 0", "Lặp tại 3"]);
});

test("truncated JSON preserves complete rows, including braces and quotes inside translated text", async () => {
	const calls: number[][] = [];
	const provider = new OpenAILLMProvider({ apiKey: "test-placeholder", cacheDirectory: false,
		fetchImpl: async (_url, options) => {
			const inputs = inputsFromRequest(options);
			calls.push(inputs.map((input) => input.id));
			if (calls.length === 1) return reply('{"segments":[{"id":0,"vietnameseText":"A {B} và \\"C\\"."},{"id":1,"vietnameseText":"bị cắt');
			return reply({ segments: [{ id: 1, vietnameseText: "Dòng còn thiếu" }] });
		},
	});
	const result = await provider.translateAndRewrite(transcript(2));
	assert.equal(result[0].vietnameseText, 'A {B} và "C".');
	assert.equal(result[1].vietnameseText, "Dòng còn thiếu");
	assert.deepEqual(calls, [[0, 1], [1]]);
});

test("duplicate or foreign IDs are not silently assigned to another source segment", async () => {
	const calls: number[][] = [];
	const provider = new OpenAILLMProvider({ apiKey: "test-placeholder", cacheDirectory: false,
		fetchImpl: async (_url, options) => {
			calls.push(inputsFromRequest(options).map((input) => input.id));
			return reply({ segments: calls.length === 1 ? [
				{ id: 0, vietnameseText: "A" }, { id: 0, vietnameseText: "B" },
				{ id: 1, vietnameseText: "Dòng một" }, { id: 99, vietnameseText: "Không liên quan" },
			] : [{ id: 0, vietnameseText: "Dòng không" }] });
		},
	});
	const result = await provider.translateAndRewrite(transcript(2));
	assert.deepEqual(calls, [[0, 1], [0]]);
	assert.deepEqual(result.map((item) => item.vietnameseText), ["Dòng không", "Dòng một"]);
});

test("invalid content has bounded repairs; upstream 429 is returned immediately with Retry-After", async () => {
	let calls = 0;
	const invalid = new OpenAILLMProvider({ apiKey: "test-placeholder", cacheDirectory: false,
		fetchImpl: async () => { calls++; return reply({ unused: true }); },
	});
	await assert.rejects(invalid.translateAndRewrite(transcript(2)), /đoạn 1 tại 0\.0s/);
	assert.equal(calls, 3);
	const limited = new OpenAILLMProvider({ apiKey: "test-placeholder", cacheDirectory: false,
		fetchImpl: async () => { calls++; return new Response("unavailable", { status: 429, headers: { "Retry-After": "120" } }); },
	});
	await assert.rejects(limited.translateAndRewrite(transcript(2)), (error: unknown) =>
		error instanceof TranslationCooldownError && error.status === 429 && error.retryAfterMs === 120000);
	assert.equal(calls, 4);
});

test("a later run reuses successfully cached rows even when the preceding run failed", async () => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "opencode", "llm-cache-"));
	try {
		let calls = 0;
		const first = new OpenAILLMProvider({ apiKey: "test-placeholder", cacheDirectory: directory,
			fetchImpl: async () => { calls++; return reply(calls === 1 ? { segments: [{ id: 0, vietnameseText: "Đã dịch" }] } : { error: "bad response" }); },
		});
		await assert.rejects(first.translateAndRewrite(transcript(2)), /đoạn 2/);
		const batches: number[][] = [];
		const second = new OpenAILLMProvider({ apiKey: "test-placeholder", cacheDirectory: directory,
			fetchImpl: async (_url, options) => {
				batches.push(inputsFromRequest(options).map((input) => input.id));
				return reply({ segments: [{ id: 1, vietnameseText: "Dịch tiếp" }] });
			},
		});
		const result = await second.translateAndRewrite(transcript(2));
		assert.deepEqual(batches, [[1]]);
		assert.deepEqual(result.map((item) => item.vietnameseText), ["Đã dịch", "Dịch tiếp"]);
	} finally { await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test("Gemini uses the same ID protocol and bounded translation path", async () => {
	const provider = new GeminiLLMProvider({ apiKey: "test-placeholder", cacheDirectory: false,
		fetchImpl: async (url, options) => {
			assert.ok(!String(url).includes("key="));
			const envelope = JSON.parse(String(options?.body));
			const prompt = String(envelope.contents[0].parts[0].text);
			const inputs = InputSchema.array().parse(JSON.parse(prompt.slice(prompt.indexOf('{"context":'))).segments);
			return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ segments: inputs.map(({ id }) => ({ id, vietnameseText: `Gemini ${id}` })) }) }] } }] });
		},
	});
	assert.equal((await provider.translateAndRewrite(transcript(3))).length, 3);
});
