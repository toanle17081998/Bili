import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveVideoEncodingFallback } from "./video-encoding";

const original = Object.getOwnPropertyDescriptor(globalThis, "VideoEncoder");
const config: VideoEncoderConfig = {
	codec: "avc1.640028",
	bitrate: 5979000,
	width: 1920,
	height: 1076,
	framerate: 30,
	avc: { format: "avc" },
};

async function withEncoder({
	supports,
	run,
}: {
	supports: (config: VideoEncoderConfig) => boolean;
	run: () => Promise<void>;
}) {
	Object.defineProperty(globalThis, "VideoEncoder", {
		configurable: true,
		value: {
			isConfigSupported: async (candidate: VideoEncoderConfig) => {
				assert.equal(candidate.width, config.width);
				assert.equal(candidate.height, config.height);
				assert.equal(candidate.framerate, config.framerate);
				assert.equal(candidate.bitrate, config.bitrate);
				assert.deepEqual(candidate.avc, config.avc);
				return { supported: supports(candidate) };
			},
		},
	});
	try {
		await run();
	} finally {
		if (original) Object.defineProperty(globalThis, "VideoEncoder", original);
		else Reflect.deleteProperty(globalThis, "VideoEncoder");
	}
}

test("unsupported H.264 High profile falls back to Baseline at the same level", async () => {
	await withEncoder({
		supports: (candidate) => candidate.codec === "avc1.420028",
		run: async () => {
			const result = await resolveVideoEncodingFallback({ config });
			assert.equal(result.fullCodecString, "avc1.420028");
			assert.equal(result.hardwareAcceleration, "no-preference");
		},
	});
});

test("fallback probes hardware acceleration without reducing resolution or bitrate", async () => {
	await withEncoder({
		supports: (candidate) => candidate.hardwareAcceleration === "prefer-hardware",
		run: async () => {
			const result = await resolveVideoEncodingFallback({ config });
			assert.equal(result.fullCodecString, config.codec);
			assert.equal(result.hardwareAcceleration, "prefer-hardware");
		},
	});
});

test("fallback probes software encoding when hardware modes are unavailable", async () => {
	await withEncoder({
		supports: (candidate) => candidate.hardwareAcceleration === "prefer-software",
		run: async () => {
			assert.equal(
				(await resolveVideoEncodingFallback({ config })).hardwareAcceleration,
				"prefer-software",
			);
		},
	});
});

test("no supported H.264 encoder gives actionable format guidance", async () => {
	await withEncoder({
		supports: () => false,
		run: async () => {
			await assert.rejects(resolveVideoEncodingFallback({ config }), /MP4.*1920x1076.*WebM/);
		},
	});
});

test("VP9 fallback never substitutes a codec from another output format", async () => {
	await withEncoder({
		supports: (candidate) => {
				assert.equal(candidate.codec, "vp09.00.40.08");
				return candidate.hardwareAcceleration === "prefer-software";
			},
		run: async () => {
			const result = await resolveVideoEncodingFallback({
				config: { ...config, codec: "vp09.00.40.08" },
			});
			assert.equal(result.fullCodecString, "vp09.00.40.08");
		},
	});
});
