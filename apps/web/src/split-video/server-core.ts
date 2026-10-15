import fs from "node:fs/promises";
import path from "node:path";
import { createSplitPlanner } from "./core";

export async function readSplitWasm() {
	const relative = "rust/crates/split-video/split-video.wasm";
	let file = path.resolve(process.cwd(), relative);
	try {
		await fs.access(file);
	} catch {
		file = path.resolve(process.cwd(), "../..", relative);
	}
	return fs.readFile(file);
}

let plannerPromise: ReturnType<typeof createSplitPlanner> | undefined;
export function loadSplitPlanner() {
	plannerPromise ??= readSplitWasm()
		.then((bytes) => createSplitPlanner({ bytes }))
		.catch((error: unknown) => {
			plannerPromise = undefined;
			throw error;
		});
	return plannerPromise;
}
