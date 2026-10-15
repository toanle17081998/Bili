import { test } from "node:test";
import assert from "node:assert/strict";
import { FFmpegProgressReader, type FFmpegProgress } from "./progress";

test("FFmpeg progress handles chunk boundaries and microsecond timestamps", () => {
	const reader = new FFmpegProgressReader();
	const values: FFmpegProgress[] = [];
	reader.push({
		chunk: "frame=150\nfps=25\nout_time_",
		onProgress: (value) => values.push(value),
	});
	assert.equal(values.length, 0);
	reader.push({
		chunk: "us=5000000\nspeed=0.83x\nprogress=continue\n",
		onProgress: (value) => values.push(value),
	});
	assert.deepEqual(values[0], { seconds: 5, frame: 150, fps: 25, speed: 0.83 });
	reader.push({
		chunk: "out_time_ms=10000000\nspeed=N/A\nprogress=end\n",
		onProgress: (value) => values.push(value),
	});
	assert.equal(values[1].seconds, 10);
	assert.equal(values[1].speed, undefined);
});
