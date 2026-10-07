import fs from "node:fs/promises";
import path from "node:path";
import type { TranscriptSegment } from "@/localization/schemas";

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

export async function loadSocialCopyPolicy() {
	modulePromise ??= fs
		.readFile(path.resolve(process.cwd(), "../../rust/social-copy/social-copy.wasm"))
		.then((bytes) => WebAssembly.compile(bytes))
		.catch(() => {
			modulePromise = undefined;
			throw new Error("Chưa build phần caption. Chạy npm run build:social-copy ở thư mục gốc.");
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
			return new TextDecoder().decode(new Uint8Array(wasm.memory.buffer, output, length));
		} finally {
			wasm.social_free(pointer, input.length);
			if (output) wasm.social_free(output, length);
		}
	};
}

export async function getSocialTranscriptionPrompt(): Promise<string> {
	const policy = await loadSocialCopyPolicy();
	return policy({ operation: 3, fields: [] });
}

export async function getSocialTranscriptContent(segments: TranscriptSegment[]): Promise<string> {
	const policy = await loadSocialCopyPolicy();
	return policy({ operation: 4, fields: segments.flatMap((segment) => [
		String(segment.start), segment.text.replaceAll("\0", " "),
	]) });
}
