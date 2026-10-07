import { test } from "node:test";
import assert from "node:assert/strict";
import { VideoCache } from "./service";

function fixture() {
	const cache = new VideoCache();
	const counters = { decoded: 0, seeks: 0, disposed: 0 };
	const frames = Array.from({ length: 90 }, (_, index) => ({
		canvas: { width: 1920, height: 1080 },
		timestamp: index === 0 ? 0 : index / 30 + 0.0000007,
		duration: 0.033333,
	}));
	const iterator = async function* (start: number) {
		for (let index = start; index < frames.length; index++) {
			counters.decoded++;
			yield frames[index];
		}
	};
	const data = {
		input: { dispose: () => { counters.disposed++; } },
		sink: { canvases: (time: number) => { counters.seeks++; return iterator(Math.floor(time * 30)); } },
		iterator: iterator(2), currentFrame: frames[0], nextFrame: frames[1],
		lastTime: 0, prefetching: false, prefetchPromise: null, disposed: false,
	};
	const sinks = Reflect.get(cache, "sinks");
	assert.ok(sinks instanceof Map);
	// Inject already-open browser decoder state; getFrameAt still runs the actual cache algorithm.
	sinks.set("clean", data);
	const file = new File(["fixture"], "clean.mp4");
	return { cache, counters, frames, data, file };
}

test("rounded timestamps do not consume a second of future frames or seek backwards during playback", async () => {
	const { cache, counters, frames, file } = fixture();
	const frame = await cache.getFrameAt({ mediaId: "clean", file, time: 1 / 30 });
	assert.equal(frame?.timestamp, frames[1].timestamp);
	assert.equal(counters.seeks, 0, "normal playback must keep the decoder iterator");
	assert.ok(counters.decoded <= 1, `only prefetch the next frame, decoded ${counters.decoded}`);
});

test("a genuine presentation gap retains the preceding frame without decoding past the next frame", async () => {
	const { cache, counters, frames, data, file } = fixture();
	data.nextFrame = { ...frames[1], timestamp: 0.1 };
	const frame = await cache.getFrameAt({ mediaId: "clean", file, time: 0.06 });
	assert.equal(frame?.timestamp, 0);
	assert.equal(data.nextFrame?.timestamp, 0.1);
	assert.equal(counters.seeks, 0);
	assert.equal(counters.decoded, 0);
});

test("replacing a video releases its decoder without requiring deletion of the source asset", () => {
	const { cache, counters } = fixture();
	cache.clearVideo({ mediaId: "clean" });
	assert.equal(counters.disposed, 1);
	assert.equal(cache.getStats().totalSinks, 0);
});

test("sequential playback retains the iterator while an actual backwards seek restarts it", async () => {
	const { cache, counters, file } = fixture();
	for (let index = 1; index < 60; index++) {
		const frame = await cache.getFrameAt({ mediaId: "clean", file, time: index / 30 });
		assert.ok(frame);
		assert.ok(Math.abs(frame.timestamp - index / 30) < 0.00001);
	}
	assert.equal(counters.seeks, 0);
	assert.ok(counters.decoded <= 60);
	const rewound = await cache.getFrameAt({ mediaId: "clean", file, time: 0 });
	assert.equal(rewound?.timestamp, 0);
	assert.equal(counters.seeks, 1);
});
