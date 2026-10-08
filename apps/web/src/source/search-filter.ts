import type { SearchResult } from "./types";

interface FilterExports extends WebAssembly.Exports {
	memory: WebAssembly.Memory;
	filter_alloc(length: number): number;
	filter_free(pointer: number, length: number): void;
	filter_match(
		duration: number,
		minimum: number,
		maximum: number,
		pointer: number,
		length: number,
	): number;
}
let modulePromise: Promise<WebAssembly.Module> | undefined;

function isFilterExports(
	exports: WebAssembly.Exports,
): exports is FilterExports {
	return (
		exports.memory instanceof WebAssembly.Memory &&
		typeof exports.filter_alloc === "function" &&
		typeof exports.filter_free === "function" &&
		typeof exports.filter_match === "function"
	);
}

export async function filterSearchResults({
	results,
	minimum,
	maximum,
	channel,
}: {
	results: SearchResult[];
	minimum: string;
	maximum: string;
	channel: string;
}) {
	modulePromise ??= fetch("/search-filter.wasm")
		.then(async (response) => {
			if (!response.ok) throw new Error("Không tải được bộ lọc video.");
			return WebAssembly.compile(await response.arrayBuffer());
		})
		.catch((error) => {
			modulePromise = undefined;
			throw error;
		});
	const instance = await WebAssembly.instantiate(await modulePromise);
	const wasm = instance.exports;
	if (!isFilterExports(wasm)) throw new Error("Invalid search filter module");
	return results.filter((video) => {
		const bytes = new TextEncoder().encode(
			`${video.uploader.replaceAll("\0", " ")}\0${channel.replaceAll("\0", " ")}`,
		);
		const pointer = wasm.filter_alloc(bytes.length);
		try {
			new Uint8Array(wasm.memory.buffer, pointer, bytes.length).set(bytes);
			return (
				wasm.filter_match(
					video.duration,
					minimum === "" ? -1 : Number(minimum),
					maximum === "" ? -1 : Number(maximum),
					pointer,
					bytes.length,
				) === 1
			);
		} finally {
			wasm.filter_free(pointer, bytes.length);
		}
	});
}
