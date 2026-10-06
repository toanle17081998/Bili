import { test, mock } from "bun:test";
import assert from "node:assert/strict";
mock.module("@/wasm", () => ({ TICKS_PER_SECOND: 120000 }));
mock.module("@/animation/values", () => ({ resolveNumberAtTime: ({ baseValue }: { baseValue: number }) => baseValue }));
mock.module("@/animation/keyframe-query", () => ({ hasKeyframesForPath: () => false }));
const { volumeControlParams } = await import("./volume-control");
const { resolveEffectiveAudioGain } = await import("@/timeline/audio-state");

test("AI percentage controls produce actual editor gain and a real mute", () => {
	for (const percent of [0, 20, 50, 100]) {
		const element = { type: "audio", params: volumeControlParams(percent) } as unknown as Parameters<typeof resolveEffectiveAudioGain>[0]["element"];
		const gain = resolveEffectiveAudioGain({ element, localTime: 0 });
		assert.ok(Math.abs(gain - percent / 100) < 1e-9);
	}
	assert.equal(volumeControlParams(100).volume, 0);
	assert.equal(volumeControlParams(0).muted, true);
});
