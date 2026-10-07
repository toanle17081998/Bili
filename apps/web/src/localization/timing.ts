import fs from "node:fs/promises";
import path from "node:path";

interface TimingExports {
	memory: WebAssembly.Memory;
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
	translation_llm_same_span(start: number, end: number, otherStart: number, otherEnd: number): number;
	translation_llm_prompt_ptr(): number;
	translation_llm_prompt_len(): number;
}

let modulePromise: Promise<TimingExports> | undefined;
function isTimingExports(exports: WebAssembly.Exports): exports is WebAssembly.Exports & TimingExports {
	return exports.memory instanceof WebAssembly.Memory && [
		exports.dubbing_slot_end, exports.dubbing_tempo, exports.dubbing_merge,
		exports.dubbing_split_word, exports.dubbing_join_speech, exports.dubbing_silence,
		exports.translation_request_interval_ms, exports.translation_cooldown_ms,
		exports.translation_retry_delay_ms, exports.translation_memory_cache_entries,
		exports.translation_llm_batch_can_add, exports.translation_llm_output_tokens,
		exports.translation_llm_repair_attempts, exports.translation_llm_same_span,
		exports.translation_llm_prompt_ptr, exports.translation_llm_prompt_len,
	].every((value) => typeof value === "function");
}

export function loadDubbingTiming(): Promise<TimingExports> {
	modulePromise ??= fs.readFile(path.resolve(process.cwd(), "../../rust/crates/localization/timing.wasm"))
		.then((bytes) => WebAssembly.instantiate(bytes))
		.then(({ instance }) => {
			if (!isTimingExports(instance.exports))
				throw new Error("Localization WASM is outdated. Rebuild it with scripts/build-localization.ps1 and restart the server.");
			return instance.exports;
		})
		.catch((error: unknown) => {
			modulePromise = undefined;
			throw error;
		});
	return modulePromise;
}
