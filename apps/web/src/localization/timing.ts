import fs from "node:fs/promises";
import path from "node:path";

interface TimingExports {
	memory: WebAssembly.Memory;
	speech_alloc(length: number): number;
	speech_free(pointer: number, length: number): void;
	speech_prepare(pointer: number, length: number): number;
	speech_length(): number;
	dubbing_slot_end(start: number, end: number, next: number, duration: number): number;
	dubbing_tempo(audio: number, slot: number): number;
	dubbing_merge(start: number, end: number, nextStart: number, nextEnd: number): number;
	dubbing_split_word(previousEnd: number, nextStart: number): number;
	dubbing_join_speech(start: number, end: number, nextStart: number, nextEnd: number): number;
	dubbing_silence(previousEnd: number, nextStart: number): number;
	translation_request_interval_ms(): number;
	translation_memory_cache_entries(): number;
	translation_cooldown_ms(retryAfterMs: number): number;
	translation_retry_delay_ms(status: number, retry: number, retryAfterMs: number): number;
	translation_llm_batch_can_add(count: number, chars: number, nextChars: number): number;
	translation_llm_output_tokens(): number;
	translation_llm_repair_attempts(): number;
	translation_llm_concurrency(): number;
	translation_llm_same_span(start: number, end: number, otherStart: number, otherEnd: number): number;
	translation_llm_prompt_ptr(): number;
	translation_llm_prompt_len(): number;
	narration_max_duration(): number;
	narration_frame_count(duration: number): number;
	narration_frame_time(duration: number, index: number): number;
	narration_max_segments(): number;
	narration_request_max_bytes(): number;
	narration_valid_text_bytes(total: number, next: number): number;
	narration_proxy_size(): number;
	narration_proxy_fps(): number;
	narration_proxy_max_bytes(): number;
	narration_source_ttl_ms(): number;
	narration_source_max_entries(): number;
	narration_valid_source(width: number, height: number, fps: number): number;
	narration_valid_segment(previousEnd: number, start: number, end: number, duration: number, words: number): number;
	narration_word_count(pointer: number, length: number): number;
	narration_prompt_ptr(): number;
	narration_prompt_len(): number;
	narration_analysis_prompt_ptr(): number;
	narration_analysis_prompt_len(): number;
	narration_output_tokens(duration: number): number;
	background_music_max_bytes(): number;
	background_music_max_duration(): number;
	background_music_valid_duration(duration: number): number;
	background_music_fade_duration(duration: number): number;
}

// This module also loads the Rust script adaptation prompt used by LLM translation.
export class LocalizationWasmError extends Error {}

let modulePromise: Promise<TimingExports> | undefined;
function isTimingExports(exports: WebAssembly.Exports): exports is WebAssembly.Exports & TimingExports {
	return exports.memory instanceof WebAssembly.Memory && [
		exports.speech_alloc, exports.speech_free, exports.speech_prepare, exports.speech_length,
		exports.dubbing_slot_end, exports.dubbing_tempo, exports.dubbing_merge,
		exports.dubbing_split_word, exports.dubbing_join_speech, exports.dubbing_silence,
		exports.translation_request_interval_ms, exports.translation_cooldown_ms,
		exports.translation_retry_delay_ms, exports.translation_memory_cache_entries,
		exports.translation_llm_batch_can_add, exports.translation_llm_output_tokens,
		exports.translation_llm_repair_attempts, exports.translation_llm_same_span,
		exports.translation_llm_concurrency,
		exports.translation_llm_prompt_ptr, exports.translation_llm_prompt_len,
		exports.narration_max_duration, exports.narration_frame_count,
		exports.narration_frame_time, exports.narration_max_segments,
		exports.narration_valid_segment, exports.narration_word_count,
		exports.narration_prompt_ptr, exports.narration_prompt_len,
		exports.narration_analysis_prompt_ptr, exports.narration_analysis_prompt_len, exports.narration_output_tokens,
		exports.background_music_max_bytes, exports.background_music_max_duration,
		exports.background_music_valid_duration, exports.background_music_fade_duration,
		exports.narration_request_max_bytes, exports.narration_valid_text_bytes,
		exports.narration_proxy_size, exports.narration_proxy_fps, exports.narration_proxy_max_bytes,
		exports.narration_source_ttl_ms, exports.narration_source_max_entries, exports.narration_valid_source,
	].every((value) => typeof value === "function");
}

export async function prepareSpeechText(text: string): Promise<string> {
	const wasm = await loadDubbingTiming();
	const bytes = new TextEncoder().encode(text);
	const pointer = wasm.speech_alloc(bytes.length);
	let output = 0;
	let length = 0;
	try {
		new Uint8Array(wasm.memory.buffer, pointer, bytes.length).set(bytes);
		output = wasm.speech_prepare(pointer, bytes.length);
		length = wasm.speech_length();
		return new TextDecoder().decode(new Uint8Array(wasm.memory.buffer, output, length));
	} finally {
		wasm.speech_free(pointer, bytes.length);
		if (output) wasm.speech_free(output, length);
	}
}

export function loadDubbingTiming(): Promise<TimingExports> {
	modulePromise ??= fs.readFile(path.resolve(process.cwd(), "../../rust/crates/localization/timing.wasm"))
		.then((bytes) => WebAssembly.instantiate(bytes))
		.then(({ instance }) => {
			if (!isTimingExports(instance.exports))
				throw new LocalizationWasmError("Localization WASM is outdated. Rebuild it with scripts/build-localization.ps1 and restart the server.");
			return instance.exports;
		})
		.catch((error: unknown) => {
			modulePromise = undefined;
			throw error;
		});
	return modulePromise;
}
