import { test } from "node:test";
import assert from "node:assert/strict";
import { canPredecodeAudio, renderTimedAudioBuffers } from "./preview-audio";

test("short original and watermark-processed videos can use continuous buffered audio", () => {
	assert.equal(
		canPredecodeAudio({ fileBytes: 53301140, sourceDuration: 233.082358 }),
		true,
	);
	assert.equal(
		canPredecodeAudio({ fileBytes: 118496650, sourceDuration: 233.082358 }),
		true,
	);
});

test("large files and long or unknown sources retain streaming to bound memory", () => {
	assert.equal(
		canPredecodeAudio({
			fileBytes: 1000,
			sourceDuration: 200,
			playbackDuration: 400,
		}),
		false,
	);
	for (const sourceDuration of [0, -1, 301, Infinity, NaN])
		assert.equal(canPredecodeAudio({ fileBytes: 1000, sourceDuration }), false);
	assert.equal(
		canPredecodeAudio({ fileBytes: 256 * 1024 * 1024 + 1, sourceDuration: 30 }),
		false,
	);
	assert.equal(canPredecodeAudio({ fileBytes: 0, sourceDuration: 30 }), false);
});

test("decoded fallback preserves initial silence, gaps and negative priming timestamps", async () => {
	const bufferDescriptor = Object.getOwnPropertyDescriptor(
		globalThis,
		"AudioBuffer",
	);
	const contextDescriptor = Object.getOwnPropertyDescriptor(
		globalThis,
		"OfflineAudioContext",
	);
	const starts: number[][] = [];
	let outputLength = 0;
	let assembled: AudioBuffer | null = null;
	Object.defineProperty(globalThis, "AudioBuffer", {
		configurable: true,
		value: class {
			length: number;
			sampleRate: number;
			numberOfChannels: number;
			duration: number;
			channels: Float32Array[];
			constructor(options: AudioBufferOptions) {
				this.length = options.length;
				this.sampleRate = options.sampleRate;
				this.numberOfChannels = options.numberOfChannels ?? 1;
				this.duration = options.length / options.sampleRate;
				this.channels = Array.from(
					{ length: this.numberOfChannels },
					() => new Float32Array(this.length),
				);
			}
			getChannelData(channel: number) {
				return this.channels[channel];
			}
		},
	});
	Object.defineProperty(globalThis, "OfflineAudioContext", {
		configurable: true,
		value: class {
			destination = {};
			constructor(...args: number[]) {
				outputLength = args[1];
			}
			createBufferSource() {
				return {
					set buffer(value: AudioBuffer) {
						assembled = value;
					},
					connect() {},
					start(...args: number[]) {
						starts.push(args);
					},
				};
			}
			async startRendering() {
				return {};
			}
		},
	});
	try {
		const buffer = new AudioBuffer({
			length: 44100,
			sampleRate: 44100,
			numberOfChannels: 2,
		});
		buffer.getChannelData(0).fill(0.25);
		await renderTimedAudioBuffers({
			chunks: [
				{ buffer, timestamp: 1 },
				{ buffer, timestamp: 3 },
			],
			sampleRate: 48000,
		});
		assert.equal(outputLength, 4 * 48000);
		assert.deepEqual(starts, [[0]]);
		assert.ok(assembled);
		const samples = (assembled as AudioBuffer).getChannelData(0);
		assert.deepEqual(
			[0, 44100, 88200, 132300].map((index) => samples[index]),
			[0, 0.25, 0, 0.25],
		);
		starts.length = 0;
		await renderTimedAudioBuffers({
			chunks: [{ buffer, timestamp: -0.25 }],
			sampleRate: 48000,
		});
		assert.equal(outputLength, 0.75 * 48000);
		assert.deepEqual(starts, [[0]]);
		assert.equal((assembled as AudioBuffer).duration, 0.75);
		assert.equal((assembled as AudioBuffer).getChannelData(0)[0], 0.25);
		starts.length = 0;
		const direct = await renderTimedAudioBuffers({
			chunks: [
				{ buffer, timestamp: -0.25 },
				{ buffer, timestamp: 0.5 },
			],
			sampleRate: 44100,
		});
		assert.ok(direct);
		assert.equal(direct.duration, 1.5);
		assert.equal(direct.getChannelData(0)[Math.round(0.6 * 44100)], 0.5);
		assert.equal(direct.getChannelData(0)[44100], 0.25);
		assert.deepEqual(
			starts,
			[],
			"matching sample rates do not need offline rendering",
		);
		const differentRate = new AudioBuffer({
			length: 48000,
			sampleRate: 48000,
			numberOfChannels: 1,
		});
		await renderTimedAudioBuffers({
			chunks: [
				{ buffer, timestamp: -0.25 },
				{ buffer: differentRate, timestamp: 2 },
			],
			sampleRate: 48000,
		});
		assert.deepEqual(starts, [[0, 0.25], [2, 0]]);
		starts.length = 0;
		const mono = new AudioBuffer({
			length: 44100,
			sampleRate: 44100,
			numberOfChannels: 1,
		});
		await renderTimedAudioBuffers({
			chunks: [
				{ buffer: mono, timestamp: 0 },
				{ buffer, timestamp: 1 },
			],
			sampleRate: 44100,
		});
		assert.deepEqual(
			starts,
			[[0, 0], [1, 0]],
			"mixed layouts retain browser downmixing",
		);
		starts.length = 0;
		const surround = new AudioBuffer({
			length: 44100,
			sampleRate: 44100,
			numberOfChannels: 6,
		});
		await renderTimedAudioBuffers({
			chunks: [{ buffer: surround, timestamp: 0 }],
			sampleRate: 44100,
		});
		assert.deepEqual(
			starts,
			[[0, 0]],
			"surround sources retain browser downmixing",
		);
		assert.equal(
			await renderTimedAudioBuffers({ chunks: [], sampleRate: 48000 }),
			null,
		);
	} finally {
		for (const [key, descriptor] of [
			["AudioBuffer", bufferDescriptor],
			["OfflineAudioContext", contextDescriptor],
		] as const) {
			if (descriptor) Object.defineProperty(globalThis, key, descriptor);
			else Reflect.deleteProperty(globalThis, key);
		}
	}
});
