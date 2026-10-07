import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDubbingTiming } from "./timing";

test("Rust bounds translation retries and respects upstream cooldowns", async () => {
	const rust = await loadDubbingTiming();
	assert.equal(rust.translation_request_interval_ms(), 1000);
	assert.equal(rust.translation_memory_cache_entries(), 512);
	assert.equal(rust.translation_retry_delay_ms(429, 0, 0), 5000);
	assert.equal(rust.translation_retry_delay_ms(429, 1, 0), 10000);
	assert.equal(rust.translation_retry_delay_ms(429, 0, 20000), 20000);
	assert.equal(rust.translation_retry_delay_ms(503, 1, 0), 4000);
	assert.equal(rust.translation_retry_delay_ms(0, 0, 0), 2000);
	assert.equal(rust.translation_retry_delay_ms(429, 2, 0), -1);
	assert.equal(rust.translation_retry_delay_ms(429, 0, 31000), -1);
	assert.equal(rust.translation_retry_delay_ms(400, 0, 0), -1);
	assert.equal(rust.translation_cooldown_ms(0), 60000);
	assert.equal(rust.translation_cooldown_ms(120000), 120000);
});

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

test("speech grouping ignores caption splits but preserves pauses and bounded paragraphs", async () => {
	const rust = await loadDubbingTiming();
	assert.equal(rust.dubbing_join_speech(2, 4, 4, 6), 1);
	assert.equal(rust.dubbing_join_speech(2, 4, 4.3, 6), 1);
	assert.equal(rust.dubbing_join_speech(2, 4, 5, 6), 0);
	assert.equal(rust.dubbing_join_speech(2, 14, 14, 18), 0);
	assert.equal(rust.dubbing_join_speech(2, 4, 3, 6), 0);
	assert.equal(rust.dubbing_silence(6, 8), 2);
	assert.equal(rust.dubbing_silence(100, 100.00000000000001), 0);
	assert.ok(Number.isNaN(rust.dubbing_silence(8, 6)));
});
