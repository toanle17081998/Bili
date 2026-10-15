import { test } from "node:test";
import assert from "node:assert/strict";
import { createSplitPlanner, SplitValidationError } from "./core";
import { readSplitWasm } from "./server-core";

test("the browser/server Rust ABI sorts fractional cuts and covers the full source", async () => {
	const planner = await createSplitPlanner({ bytes: await readSplitWasm() });
	assert.deepEqual(planner.plan({ duration: 12, cuts: [8.5, 4.25] }), [
		{ start: 0, end: 4.25 },
		{ start: 4.25, end: 8.5 },
		{ start: 8.5, end: 12 },
	]);
	assert.deepEqual(planner.plan({ duration: 12, cuts: [] }), [
		{ start: 0, end: 12 },
	]);
	assert.equal(planner.minSourceDuration, 10);
	assert.equal(
		planner.validVideo({
			duration: 4.25,
			width: 640,
			height: 360,
			fps: 30000 / 1001,
			frames: 128,
		}),
		true,
	);
	assert.equal(
		planner.validVideo({
			duration: 1,
			width: 640,
			height: 360,
			fps: 30,
			frames: 0,
		}),
		false,
	);
});

test("Rust rejects duplicate/outside cuts, short tails and invalid durations without poisoning the next plan", async () => {
	const planner = await createSplitPlanner({ bytes: await readSplitWasm() });
	for (const cuts of [
		[0],
		[12],
		[-1],
		[5, 5],
		[0.01],
		[11.99],
		[Number.NaN],
		Array(100).fill(1),
	]) {
		assert.throws(
			() => planner.plan({ duration: 12, cuts }),
			SplitValidationError,
		);
	}
	assert.throws(
		() => planner.plan({ duration: 9, cuts: [4] }),
		SplitValidationError,
	);
	assert.deepEqual(planner.plan({ duration: 12, cuts: [6] }), [
		{ start: 0, end: 6 },
		{ start: 6, end: 12 },
	]);
});
