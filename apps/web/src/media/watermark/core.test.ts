import { test } from "node:test";
import assert from "node:assert/strict";
import { planWatermarkFilters, WatermarkValidationError } from "./core";
import type { WatermarkRegion } from "./types";

const video = { width: 160, height: 96, duration: 2 };
const region: WatermarkRegion = {
	x: 108,
	y: 10,
	width: 28,
	height: 16,
	start: 0.75,
	end: 1.25,
};

test("Rust creates pixel reconstruction filters with half-open time windows", async () => {
	const filters = await planWatermarkFilters({
		video,
		regions: [region, { ...region, x: 20 }],
	});
	assert.equal(filters.length, 2);
	assert.equal(
		filters[0],
		"delogo=x=108:y=10:w=28:h=16:enable='gte(t,0.750000)*lt(t,1.250000)'",
	);
	assert.ok(!filters.join(",").includes("drawbox"));
	assert.ok(!filters.join(",").includes("boxblur"));
});

test("Rust rejects invalid coordinates, edges, tiny regions and time ranges", async () => {
	for (const patch of [
		{ x: -1 },
		{ x: 0 },
		{ x: 150 },
		{ y: 90 },
		{ width: 3 },
		{ x: 1.5 },
		{ start: -0.1 },
		{ start: 1.5 },
		{ end: 3 },
		{ end: Number.NaN },
	]) {
		await assert.rejects(
			planWatermarkFilters({ video, regions: [{ ...region, ...patch }] }),
			WatermarkValidationError,
		);
	}
	await assert.rejects(
		planWatermarkFilters({
			video: { ...video, duration: 0 },
			regions: [region],
		}),
		WatermarkValidationError,
	);
});

test("Rust bounds the number of regions", async () => {
	await assert.rejects(
		planWatermarkFilters({ video, regions: [] }),
		WatermarkValidationError,
	);
	await assert.rejects(
		planWatermarkFilters({
			video,
			regions: Array.from({ length: 17 }, () => region),
		}),
		WatermarkValidationError,
	);
	assert.equal(
		(
			await planWatermarkFilters({
				video,
				regions: Array.from({ length: 16 }, () => region),
			})
		).length,
		16,
	);
});
