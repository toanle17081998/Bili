import fs from "node:fs/promises";
import path from "node:path";

interface StoryExports extends WebAssembly.Exports {
	memory: WebAssembly.Memory;
	story_alloc: (length: number) => number;
	story_free: (pointer: number, length: number) => void;
	story_run: (pointer: number, length: number) => number;
	story_output_len: () => number;
}
let compiled:
	| { stamp: string; module: Promise<WebAssembly.Module> }
	| undefined;
function isStoryExports(exports: WebAssembly.Exports): exports is StoryExports {
	return (
		exports.memory instanceof WebAssembly.Memory &&
		["story_alloc", "story_free", "story_run", "story_output_len"].every(
			(key) => typeof exports[key] === "function",
		)
	);
}

/** IO bridge only. The shared Rust crate owns validation and all story policy. */
export async function storyEngine<T>(
	input: Record<string, unknown>,
): Promise<T> {
	const modulePath = path.resolve(
		process.cwd(),
		"../../rust/crates/story-narrator/story-narrator.wasm",
	);
	const stat = await fs.stat(modulePath).catch(() => {
		throw new Error(
			"Chưa build Story Narrator. Chạy bun run build:story-narrator tại thư mục gốc.",
		);
	});
	const stamp = `${stat.mtimeMs}:${stat.size}`;
	if (compiled?.stamp !== stamp) {
		compiled = {
			stamp,
			module: fs
				.readFile(modulePath)
				.then((bytes) => WebAssembly.compile(bytes))
				.catch(() => {
					if (compiled?.stamp === stamp) compiled = undefined;
					throw new Error(
						"Không tải được Story Narrator WASM. Chạy bun run build:story-narrator tại thư mục gốc.",
					);
				}),
		};
	}
	const { exports } = await WebAssembly.instantiate(await compiled.module);
	if (!isStoryExports(exports))
		throw new Error("Story Narrator WASM không hợp lệ; hãy build lại.");
	const wasm = exports;
	const bytes = new TextEncoder().encode(JSON.stringify(input));
	const pointer = wasm.story_alloc(bytes.length);
	let output = 0;
	let length = 0;
	try {
		new Uint8Array(wasm.memory.buffer, pointer, bytes.length).set(bytes);
		output = wasm.story_run(pointer, bytes.length);
		length = wasm.story_output_len();
		const result: { ok: boolean; value: T; error: string } = JSON.parse(
			new TextDecoder().decode(
				new Uint8Array(wasm.memory.buffer, output, length),
			),
		);
		if (!result.ok) throw new Error(result.error);
		return result.value;
	} finally {
		wasm.story_free(pointer, bytes.length);
		if (output) wasm.story_free(output, length);
	}
}
