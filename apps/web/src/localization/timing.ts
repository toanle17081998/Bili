import fs from "node:fs/promises";
import path from "node:path";

interface TimingExports {
	dubbing_slot_end(start: number, end: number, next: number, duration: number): number;
	dubbing_tempo(audio: number, slot: number): number;
	dubbing_merge(start: number, end: number, nextStart: number, nextEnd: number): number;
	dubbing_split_word(previousEnd: number, nextStart: number): number;
}

let modulePromise: Promise<TimingExports> | undefined;
export function loadDubbingTiming(): Promise<TimingExports> {
	modulePromise ??= fs.readFile(path.resolve(process.cwd(), "../../rust/crates/localization/timing.wasm"))
		.then((bytes) => WebAssembly.instantiate(bytes))
		.then(({ instance }) => instance.exports as unknown as TimingExports);
	return modulePromise;
}
