import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDubbingTiming } from "./timing";

test("Rust dubbing plan respects source boundaries, following speech and video end", async () => {
	const rust = await loadDubbingTiming();
	assert.equal(rust.dubbing_slot_end(2, 6, 5, 20), 5);
	assert.equal(rust.dubbing_slot_end(18, 24, 30, 20), 20);
	assert.ok(Number.isNaN(rust.dubbing_slot_end(2, 4, 2, 20)));
	assert.ok(Number.isNaN(rust.dubbing_slot_end(-1, 4, 5, 20)));
	for (let slot = 0.2; slot <= 8; slot += 0.2) {
		for (const ratio of [0.5, 1, 1.5, 2, 2.5]) {
			const tempo = rust.dubbing_tempo(slot * ratio, slot);
			assert.ok(slot * ratio / tempo <= slot + 1e-9);
			assert.ok(tempo >= 1);
		}
	}
	assert.ok(Number.isNaN(rust.dubbing_tempo(10, 1)));
	assert.ok(Number.isNaN(rust.dubbing_tempo(0, 1)));
});

test("Rust groups short fragments without bridging long pauses", async () => {
	const rust = await loadDubbingTiming();
	assert.equal(rust.dubbing_merge(17, 21.2, 21.2, 22), 1);
	assert.equal(rust.dubbing_merge(17, 21, 24, 24.5), 0);
	assert.equal(rust.dubbing_split_word(90, 105), 1);
	assert.equal(rust.dubbing_split_word(90, 90.2), 0);
});
