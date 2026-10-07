import fs from "node:fs/promises";
import path from "node:path";
import type { VideoProbeResult } from "@/media/ffmpeg";
import type { WatermarkRegion } from "./types";

const ERRORS: Record<number, string> = {
	1: "Không đọc được kích thước hoặc thời lượng video.",
	2: "Tọa độ phải là pixel nguyên; vùng logo rộng và cao ít nhất 4 px.",
	3: "Vùng logo phải nằm trong video, cách mép ít nhất 1 px.",
	4: "Khoảng thời gian không hợp lệ hoặc vượt quá thời lượng video.",
	5: "Chọn từ 1 đến 16 vùng logo.",
};

export class WatermarkValidationError extends Error {}

async function loadCore() {
	const relative = "rust/crates/watermark/watermark.wasm";
	let file = path.resolve(process.cwd(), relative);
	try {
		await fs.access(file);
	} catch {
		file = path.resolve(process.cwd(), "../..", relative);
	}
	const { instance } = await WebAssembly.instantiate(await fs.readFile(file));
	const {
		memory,
		watermark_plan_region: plan,
		watermark_region_count: count,
		watermark_output_ptr: pointer,
		watermark_output_len: length,
	} = instance.exports;
	if (
		!(memory instanceof WebAssembly.Memory) ||
		typeof plan !== "function" ||
		typeof count !== "function" ||
		typeof pointer !== "function" ||
		typeof length !== "function"
	) {
		throw new Error("Invalid watermark Rust module");
	}
	return { memory, plan, count, pointer, length };
}

let corePromise: ReturnType<typeof loadCore> | undefined;

export async function planWatermarkFilters({
	video,
	regions,
}: {
	video: Pick<VideoProbeResult, "width" | "height" | "duration">;
	regions: WatermarkRegion[];
}): Promise<string[]> {
	corePromise ??= loadCore().catch((error: unknown) => {
		corePromise = undefined;
		throw error;
	});
	const core = await corePromise;
	const check = (code: number) => {
		if (code !== 0)
			throw new WatermarkValidationError(
				ERRORS[code] ?? "Vùng logo không hợp lệ.",
			);
	};
	check(Number(core.count(regions.length)));
	return regions.map((region) => {
		check(
			Number(
				core.plan(
					video.width,
					video.height,
					video.duration,
					region.x,
					region.y,
					region.width,
					region.height,
					region.start,
					region.end,
				),
			),
		);
		return new TextDecoder().decode(
			new Uint8Array(
				core.memory.buffer,
				Number(core.pointer()),
				Number(core.length()),
			),
		);
	});
}
