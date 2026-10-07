import { test } from "node:test";
import assert from "node:assert/strict";
import { LocalizationPipeline } from "./pipeline";
import { FasterWhisperTranscriptionProvider } from "@/providers/transcription";

const CONFIG_KEYS = ["GEMINI_API_KEY", "OPENAI_API_KEY", "OPENAI_LLM_API_KEY"] as const;

async function withConfiguration({
	values,
	run,
}: {
	values: Partial<Record<(typeof CONFIG_KEYS)[number], string>>;
	run: () => void | Promise<void>;
}) {
	const previous = new Map(CONFIG_KEYS.map((key) => [key, process.env[key]]));
	try {
		for (const key of CONFIG_KEYS) {
			if (values[key] === undefined) delete process.env[key];
			else process.env[key] = values[key];
		}
		await run();
	} finally {
		for (const [key, value] of previous) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

function providerName({ pipeline, field }: {
	pipeline: LocalizationPipeline;
	field: "transcriptionProvider" | "llmProvider";
}): string {
	const provider = Reflect.get(pipeline, field);
	assert.equal(typeof provider?.name, "string");
	return provider.name;
}

test("an OpenAI-compatible LLM key selects local transcription and the configured translation provider", async () => {
	await withConfiguration({ values: { OPENAI_LLM_API_KEY: "test-compatible-llm" }, run: async () => {
		const pipeline = new LocalizationPipeline();
		assert.equal(providerName({ pipeline, field: "transcriptionProvider" }), "faster-whisper");
		assert.equal(providerName({ pipeline, field: "llmProvider" }), "openai");
		const original = FasterWhisperTranscriptionProvider.prototype.transcribe;
		let audioReceived = "";
		FasterWhisperTranscriptionProvider.prototype.transcribe = async (audioPath) => {
			audioReceived = audioPath;
			return [{ start: 0, end: 1, text: "Lời thoại gốc" }];
		};
		try {
			const getTranscript = Reflect.get(pipeline, "getTranscript");
			assert.equal(typeof getTranscript, "function");
			const result = await getTranscript.call(pipeline, "provider-test", "unused", "fixture.wav");
			assert.equal(audioReceived, "fixture.wav");
			assert.equal(result[0].text, "Lời thoại gốc");
		} finally {
			FasterWhisperTranscriptionProvider.prototype.transcribe = original;
		}
	} });
});

test("transcription credentials and explicit provider overrides retain their own priority", async () => {
	for (const { values, stt, llm } of [
		{ values: {}, stt: "faster-whisper", llm: "free-translate" },
		{ values: { OPENAI_API_KEY: "test-openai" }, stt: "whisper", llm: "openai" },
		{ values: { GEMINI_API_KEY: "test-gemini", OPENAI_LLM_API_KEY: "test-llm" }, stt: "gemini", llm: "gemini" },
		{ values: { OPENAI_API_KEY: "  ", OPENAI_LLM_API_KEY: "test-llm" }, stt: "faster-whisper", llm: "openai" },
		{ values: { GEMINI_API_KEY: "  ", OPENAI_API_KEY: "  ", OPENAI_LLM_API_KEY: "  " }, stt: "faster-whisper", llm: "free-translate" },
	]) {
		await withConfiguration({ values, run: () => {
			const pipeline = new LocalizationPipeline();
			assert.equal(providerName({ pipeline, field: "transcriptionProvider" }), stt);
			assert.equal(providerName({ pipeline, field: "llmProvider" }), llm);
			const explicit = new LocalizationPipeline({
				transcriptionProvider: { name: "explicit-stt", transcribe: async () => [] },
				llmProvider: { name: "explicit-llm", translateAndRewrite: async () => [] },
			});
			assert.equal(providerName({ pipeline: explicit, field: "transcriptionProvider" }), "explicit-stt");
			assert.equal(providerName({ pipeline: explicit, field: "llmProvider" }), "explicit-llm");
		} });
	}
});
