import fs from "node:fs/promises";
import path from "node:path";
import type { SocialCopyResult, SocialPosts, SocialTone } from "./types";
import { PostsSchema } from "./schemas";
import {
	getOpenAILLMApiKey,
	getOpenAILLMBaseUrl,
	getOpenAILLMModel,
	hasOpenAILLMConfig,
} from "@/providers/openai-compatible";
export { SocialCopyRequestSchema } from "./schemas";

interface SocialExports {
	memory: WebAssembly.Memory;
	social_alloc(length: number): number;
	social_free(pointer: number, length: number): void;
	social_run(operation: number, pointer: number, length: number): number;
	social_output_len(): number;
}

let modulePromise: Promise<WebAssembly.Module> | undefined;
function isSocialExports(
	exports: WebAssembly.Exports,
): exports is WebAssembly.Exports & SocialExports {
	return (
		exports.memory instanceof WebAssembly.Memory &&
		[
			exports.social_alloc,
			exports.social_free,
			exports.social_run,
			exports.social_output_len,
		].every((value) => typeof value === "function")
	);
}

async function loadPolicy() {
	modulePromise ??= fs
		.readFile(path.resolve(process.cwd(), "../../rust/social-copy/social-copy.wasm"))
		.then((bytes) => WebAssembly.compile(bytes))
		.catch(() => {
			modulePromise = undefined;
			throw new Error(
				"Chưa build phần caption. Chạy npm run build:social-copy ở thư mục gốc.",
			);
		});
	const instance = await WebAssembly.instantiate(await modulePromise);
	const wasm = instance.exports;
	if (!isSocialExports(wasm))
		throw new Error("Module caption không hợp lệ. Vui lòng build lại.");
	return ({ operation, fields }: { operation: number; fields: string[] }) => {
		const input = new TextEncoder().encode(fields.join("\0"));
		const pointer = wasm.social_alloc(input.length);
		let output = 0;
		let length = 0;
		try {
			new Uint8Array(wasm.memory.buffer, pointer, input.length).set(input);
			output = wasm.social_run(operation, pointer, input.length);
			length = wasm.social_output_len();
			return new TextDecoder().decode(
				new Uint8Array(wasm.memory.buffer, output, length),
			);
		} finally {
			wasm.social_free(pointer, input.length);
			if (output) wasm.social_free(output, length);
		}
	};
}

async function requestAI({
	prompt,
	signal,
}: {
	prompt: string;
	signal?: AbortSignal;
}): Promise<SocialPosts> {
	const timeout = AbortSignal.timeout(60000);
	const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
	let response: Response;
	let raw: string | undefined;
	if (process.env.GEMINI_API_KEY) {
		response = await fetch(
			"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-goog-api-key": process.env.GEMINI_API_KEY,
				},
				body: JSON.stringify({
					contents: [{ parts: [{ text: prompt }] }],
					generationConfig: { responseMimeType: "application/json" },
				}),
				signal: requestSignal,
			},
		);
		if (response.ok) {
			const data = await response.json();
			raw = data.candidates?.[0]?.content?.parts
				?.map((part: { text?: string }) => part.text ?? "")
				.join("");
		}
	} else {
		response = await fetch(`${getOpenAILLMBaseUrl()}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${getOpenAILLMApiKey()}`,
			},
			body: JSON.stringify({
				model: getOpenAILLMModel(),
				messages: [{ role: "user", content: prompt }],
				response_format: { type: "json_object" },
			}),
			signal: requestSignal,
		});
		if (response.ok) {
			const data = await response.json();
			raw = data.choices?.[0]?.message?.content;
		}
	}
	if (!response.ok)
		throw new Error(
			`Dịch vụ AI trả lỗi ${response.status}. Kiểm tra API key hoặc thử lại sau.`,
		);
	if (!raw) throw new Error("AI chưa trả nội dung caption. Vui lòng thử lại.");
	const parsed = PostsSchema.safeParse(JSON.parse(raw));
	if (!parsed.success)
		throw new Error(
			"Nội dung AI trả về chưa đủ 3 nền tảng hoặc sai định dạng. Vui lòng tạo lại.",
		);
	return parsed.data;
}

export async function generateSocialCopy({
	input,
	signal,
}: {
	input: { title: string; content: string; tone: SocialTone };
	signal?: AbortSignal;
}): Promise<SocialCopyResult> {
	const policy = await loadPolicy();
	const fields = [input.title, input.content, input.tone];
	if (!process.env.GEMINI_API_KEY && !hasOpenAILLMConfig()) {
		return {
			posts: PostsSchema.parse(JSON.parse(policy({ operation: 1, fields }))),
			mode: "draft",
		};
	}
	const posts = await requestAI({
		prompt: policy({ operation: 0, fields }),
		signal,
	});
	const normalized = policy({
		operation: 2,
		fields: [posts.tiktok, posts.facebook, posts.youtube].flatMap((post) => [
			post.title,
			post.caption,
			post.hashtags.join(" "),
		]),
	});
	return { posts: PostsSchema.parse(JSON.parse(normalized)), mode: "ai" };
}
