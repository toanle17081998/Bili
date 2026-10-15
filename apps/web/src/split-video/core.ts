import type { SplitRange } from "./types";

interface SplitExports {
	memory: WebAssembly.Memory;
	split_alloc(count: number): number;
	split_free(pointer: number, count: number): void;
	split_plan(duration: number, pointer: number, count: number): number;
	split_output_ptr(): number;
	split_output_count(): number;
	split_min_source_duration(): number;
	split_max_parts(): number;
	split_valid_video(
		duration: number,
		width: number,
		height: number,
		fps: number,
		frames: number,
	): number;
}

const ERRORS: Record<number, string> = {
	1: "Chọn video có thời lượng từ 10 giây trở lên.",
	2: "Mỗi lần chia tối đa 100 project.",
	3: "Điểm cắt phải nằm giữa đầu và cuối video.",
	4: "Điểm cắt bị trùng hoặc tạo đoạn ngắn hơn 0,05 giây.",
};

export class SplitValidationError extends Error {}

function isSplitExports(
	value: WebAssembly.Exports,
): value is WebAssembly.Exports & SplitExports {
	return (
		value.memory instanceof WebAssembly.Memory &&
		[
			"split_alloc",
			"split_free",
			"split_plan",
			"split_output_ptr",
			"split_output_count",
			"split_min_source_duration",
			"split_max_parts",
			"split_valid_video",
		].every((name) => typeof value[name] === "function")
	);
}

export async function createSplitPlanner({ bytes }: { bytes: BufferSource }) {
	const { instance } = await WebAssembly.instantiate(bytes);
	if (!isSplitExports(instance.exports))
		throw new Error(
			"Split-video WASM không hợp lệ. Chạy bun run build:split-video.",
		);
	const core = instance.exports;
	return {
		minSourceDuration: core.split_min_source_duration(),
		maxParts: core.split_max_parts(),
		validVideo({
			duration,
			width,
			height,
			fps,
			frames,
		}: {
			duration: number;
			width: number;
			height: number;
			fps: number;
			frames: number;
		}) {
			return core.split_valid_video(duration, width, height, fps, frames) === 1;
		},
		plan({
			duration,
			cuts,
		}: {
			duration: number;
			cuts: number[];
		}): SplitRange[] {
			// Bound the transport allocation; the Rust planner validates the cut count.
			if (cuts.length >= core.split_max_parts())
				throw new SplitValidationError(ERRORS[2]);
			const pointer = core.split_alloc(cuts.length);
			try {
				new Float64Array(core.memory.buffer, pointer, cuts.length).set(cuts);
				const code = core.split_plan(duration, pointer, cuts.length);
				if (code)
					throw new SplitValidationError(
						ERRORS[code] ?? "Điểm cắt không hợp lệ.",
					);
				const output = new Float64Array(
					core.memory.buffer,
					core.split_output_ptr(),
					core.split_output_count() * 2,
				);
				return Array.from({ length: output.length / 2 }, (_, index) => ({
					start: output[index * 2],
					end: output[index * 2 + 1],
				}));
			} finally {
				core.split_free(pointer, cuts.length);
			}
		},
	};
}

export type SplitPlanner = Awaited<ReturnType<typeof createSplitPlanner>>;
