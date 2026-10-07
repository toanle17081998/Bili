import type { EditorCore } from "@/core";
import { TICKS_PER_SECOND } from "@/wasm";
import { clampRetimeRate, shouldMaintainPitch } from "@/retime/rate";
import type { AudioClipSource } from "@/media/audio";
import { createAudioContext, collectAudioClips } from "@/media/audio";
import {
	buildAudioGainAutomation,
	hasAnimatedVolume,
} from "@/timeline/audio-state";
import { createAudioMasteringChain } from "@/media/audio-mastering";
import {
	canPredecodeAudio,
	renderTimedAudioBuffers,
} from "@/media/preview-audio";
import {
	getClipTimeAtSourceTime,
	getSourceTimeAtClipTime,
	renderRetimedBuffer,
} from "@/retime";
import {
	ALL_FORMATS,
	AudioBufferSink,
	BlobSource,
	Input,
	type WrappedAudioBuffer,
} from "mediabunny";

export class AudioManager {
	private audioContext: AudioContext | null = null;
	private masterGain: GainNode | null = null;
	private playbackStartTime = 0;
	private playbackStartContextTime = 0;
	private scheduleTimer: number | null = null;
	private lookaheadSeconds = 2;
	private scheduleIntervalMs = 500;
	private clips: AudioClipSource[] = [];
	private sinks = new Map<string, AudioBufferSink>();
	private inputs = new Map<string, Input>();
	private activeClipIds = new Set<string>();
	private clipIterators = new Map<
		string,
		AsyncGenerator<WrappedAudioBuffer, void, unknown>
	>();
	private queuedSources = new Set<AudioBufferSourceNode>();
	private preparedClipBuffers = new Map<string, Promise<AudioBuffer | null>>();
	private decodedBuffers = new Map<
		string,
		{ file: File; promise: Promise<AudioBuffer | null> }
	>();
	private decodedBufferBytes = new Map<string, number>();
	private preparedBufferBytes = new Map<string, number>();
	private audioPreparationQueue: Promise<void> = Promise.resolve();
	private playbackSessionId = 0;
	private audioCacheGeneration = 0;
	private lastIsPlaying = false;
	private lastIsScrubbing = false;
	private lastVolume = 1;
	private playbackLatencyCompensationSeconds = 0;
	private unsubscribers: Array<() => void> = [];

	constructor(private editor: EditorCore) {
		this.lastVolume = this.editor.playback.getVolume();

		this.unsubscribers.push(
			this.editor.playback.subscribe(this.handlePlaybackChange),
			this.editor.timeline.subscribe(this.handleTimelineChange),
			this.editor.media.subscribe(this.handleMediaChange),
			this.editor.playback.onSeek(this.handleSeek),
		);
	}

	dispose(): void {
		this.stopPlayback();
		this.audioCacheGeneration++;
		for (const unsub of this.unsubscribers) {
			unsub();
		}
		this.unsubscribers = [];
		this.disposeSinks();
		this.preparedClipBuffers.clear();
		this.preparedBufferBytes.clear();
		this.decodedBuffers.clear();
		this.decodedBufferBytes.clear();
		if (this.audioContext) {
			void this.audioContext.close();
			this.audioContext = null;
			this.masterGain = null;
		}
	}

	private handlePlaybackChange = (): void => {
		const isPlaying = this.editor.playback.getIsPlaying();
		const volume = this.editor.playback.getVolume();
		const isScrubbing = this.editor.playback.getIsScrubbing();
		if (this.lastIsScrubbing && !isScrubbing && !isPlaying)
			void this.warmUpcomingAudio();
		this.lastIsScrubbing = isScrubbing;

		if (volume !== this.lastVolume) {
			this.lastVolume = volume;
			this.updateGain();
		}

		if (isPlaying !== this.lastIsPlaying) {
			this.lastIsPlaying = isPlaying;
			if (isPlaying) {
				void this.startPlayback({
					time: this.editor.playback.getCurrentTime() / TICKS_PER_SECOND,
				});
			} else {
				this.stopPlayback();
			}
		}
	};

	private handleSeek = (time: number): void => {
		if (this.editor.playback.getIsScrubbing()) {
			this.stopPlayback();
			return;
		}

		if (this.editor.playback.getIsPlaying()) {
			void this.startPlayback({ time: time / TICKS_PER_SECOND });
			return;
		}

		this.stopPlayback();
		void this.warmUpcomingAudio();
	};

	private handleTimelineChange = (): void => {
		this.audioCacheGeneration++;
		this.disposeSinks();
		this.preparedClipBuffers.clear();
		this.preparedBufferBytes.clear();

		if (!this.editor.playback.getIsPlaying()) {
			void this.warmUpcomingAudio();
			return;
		}

		void this.startPlayback({
			time: this.editor.playback.getCurrentTime() / TICKS_PER_SECOND,
		});
	};

	private handleMediaChange = (): void => {
		this.decodedBuffers.clear();
		this.decodedBufferBytes.clear();
		this.handleTimelineChange();
	};

	private async warmUpcomingAudio(): Promise<void> {
		const generation = this.audioCacheGeneration;
		const scene = this.editor.scenes.getActiveSceneOrNull();
		if (!scene) return;
		try {
			const clips = await collectAudioClips({
				tracks: scene.tracks,
				mediaAssets: this.editor.media.getAssets(),
			});
			if (
				generation !== this.audioCacheGeneration ||
				this.editor.playback.getIsPlaying()
			)
				return;
			const time = this.editor.playback.getCurrentTime() / TICKS_PER_SECOND;
			await Promise.all(
				clips
					.filter(
						(clip) =>
							!clip.muted &&
							clip.startTime <= time + this.lookaheadSeconds &&
							clip.startTime + clip.duration > time &&
							this.shouldUsePreparedClipBuffer({ clip }),
					)
					.map((clip) => this.getPreparedClipBuffer({ clip })),
			);
		} catch (error) {
			console.warn("Failed to prepare preview audio:", error);
		}
	}

	private ensureAudioContext(): AudioContext | null {
		if (this.audioContext) return this.audioContext;
		if (typeof window === "undefined") return null;

		this.audioContext = createAudioContext();
		const { input } = createAudioMasteringChain({
			audioContext: this.audioContext,
			destination: this.audioContext.destination,
		});
		this.masterGain = input;
		this.masterGain.gain.value = this.lastVolume;
		return this.audioContext;
	}

	private updateGain(): void {
		if (!this.masterGain) return;
		this.masterGain.gain.value = this.lastVolume;
	}

	private getPlaybackTime(): number {
		if (!this.audioContext) return this.playbackStartTime;
		const elapsed =
			this.audioContext.currentTime - this.playbackStartContextTime;
		return this.playbackStartTime + elapsed;
	}

	private async startPlayback({ time }: { time: number }): Promise<void> {
		const audioContext = this.ensureAudioContext();
		if (!audioContext) return;

		this.stopPlayback();
		const sessionId = this.playbackSessionId;
		this.playbackLatencyCompensationSeconds = 0;

		const tracks = this.editor.scenes.getActiveScene().tracks;
		const mediaAssets = this.editor.media.getAssets();
		const duration = this.editor.timeline.getTotalDuration();

		if (duration <= 0) return;

		if (audioContext.state === "suspended") {
			await audioContext.resume();
		}

		const clips = await collectAudioClips({ tracks, mediaAssets });
		if (
			!this.editor.playback.getIsPlaying() ||
			sessionId !== this.playbackSessionId
		)
			return;
		this.clips = clips;

		this.playbackStartTime = time;
		this.playbackStartContextTime = audioContext.currentTime;

		this.scheduleUpcomingClips();

		if (typeof window !== "undefined") {
			this.scheduleTimer = window.setInterval(() => {
				this.scheduleUpcomingClips();
			}, this.scheduleIntervalMs);
		}
	}

	private scheduleUpcomingClips(): void {
		if (!this.editor.playback.getIsPlaying()) return;

		const currentTime = this.getPlaybackTime();
		const windowEnd = currentTime + this.lookaheadSeconds;

		for (const clip of this.clips) {
			if (clip.muted) continue;
			if (this.activeClipIds.has(clip.id)) continue;

			const clipEnd = clip.startTime + clip.duration;
			if (clipEnd <= currentTime) continue;
			if (clip.startTime > windowEnd) continue;

			this.activeClipIds.add(clip.id);
			if (this.shouldUsePreparedClipBuffer({ clip })) {
				void this.schedulePreparedClip({
					clip,
					startTime: currentTime,
					sessionId: this.playbackSessionId,
				});
			} else {
				void this.runClipIterator({
					clip,
					startTime: currentTime,
					sessionId: this.playbackSessionId,
				});
			}
		}
	}

	private stopPlayback(): void {
		this.playbackSessionId++;
		if (this.scheduleTimer && typeof window !== "undefined") {
			window.clearInterval(this.scheduleTimer);
		}
		this.scheduleTimer = null;

		for (const iterator of this.clipIterators.values()) {
			void iterator.return();
		}
		this.clipIterators.clear();
		this.activeClipIds.clear();

		for (const source of this.queuedSources) {
			try {
				source.stop();
			} catch {}
			source.disconnect();
		}
		this.queuedSources.clear();
	}

	private async runClipIterator({
		clip,
		startTime,
		sessionId,
	}: {
		clip: AudioClipSource;
		startTime: number;
		sessionId: number;
	}): Promise<void> {
		const audioContext = this.ensureAudioContext();
		if (!audioContext) return;

		const sink = await this.getAudioSink({ clip });
		if (!sink || !this.editor.playback.getIsPlaying()) return;
		if (sessionId !== this.playbackSessionId) return;

		const clipStart = clip.startTime;
		const clipEnd = clip.startTime + clip.duration;
		const playbackTimeAfterSinkReady = this.getPlaybackTime();
		const iteratorStartTime = Math.max(
			startTime,
			clipStart,
			playbackTimeAfterSinkReady,
		);
		if (iteratorStartTime >= clipEnd) {
			return;
		}
		const sourceStartTime =
			clip.trimStart +
			getSourceTimeAtClipTime({
				clipTime: iteratorStartTime - clip.startTime,
				retime: clip.retime,
			});

		const iterator = sink.buffers(sourceStartTime);
		this.clipIterators.set(clip.id, iterator);
		let consecutiveDroppedBufferCount = 0;

		for await (const { buffer, timestamp } of iterator) {
			if (!this.editor.playback.getIsPlaying()) return;
			if (sessionId !== this.playbackSessionId) return;

			const timelineTime =
				clip.startTime +
				getClipTimeAtSourceTime({
					sourceTime: timestamp - clip.trimStart,
					retime: clip.retime,
				});
			if (timelineTime >= clipEnd) break;

			const node = audioContext.createBufferSource();
			node.buffer = buffer;
			if (clip.retime) {
				node.playbackRate.value = clampRetimeRate({ rate: clip.retime.rate });
			}
			const clipGain = audioContext.createGain();
			clipGain.gain.value = clip.volume;
			node.connect(clipGain);
			clipGain.connect(this.masterGain ?? audioContext.destination);

			const startTimestamp =
				this.playbackStartContextTime +
				this.playbackLatencyCompensationSeconds +
				(timelineTime - this.playbackStartTime);

			if (startTimestamp >= audioContext.currentTime) {
				node.start(startTimestamp);
				consecutiveDroppedBufferCount = 0;
			} else {
				const offset = audioContext.currentTime - startTimestamp;
				if (offset < buffer.duration) {
					node.start(audioContext.currentTime, offset);
					consecutiveDroppedBufferCount = 0;
				} else {
					consecutiveDroppedBufferCount += 1;
					if (consecutiveDroppedBufferCount >= 5) {
						const nextCompensationSeconds = Math.max(
							this.playbackLatencyCompensationSeconds,
							Math.min(0.25, offset + 0.01),
						);
						if (
							nextCompensationSeconds >
							this.playbackLatencyCompensationSeconds + 0.001
						) {
							this.playbackLatencyCompensationSeconds = nextCompensationSeconds;
						}
						const resyncStartTime = this.getPlaybackTime();
						this.clipIterators.delete(clip.id);
						void this.runClipIterator({
							clip,
							startTime: resyncStartTime,
							sessionId,
						});
						return;
					}
					continue;
				}
			}

			this.queuedSources.add(node);
			node.addEventListener("ended", () => {
				node.disconnect();
				clipGain.disconnect();
				this.queuedSources.delete(node);
			});

			const aheadTime = timelineTime - this.getPlaybackTime();
			if (aheadTime >= 1) {
				await this.waitUntilCaughtUp({ timelineTime, targetAhead: 1 });
				if (sessionId !== this.playbackSessionId) return;
			}
		}

		this.clipIterators.delete(clip.id);
		// don't remove from activeClipIds - prevents scheduler from restarting this clip
		// the set is cleared on stopPlayback anyway
	}

	private async schedulePreparedClip({
		clip,
		startTime,
		sessionId,
	}: {
		clip: AudioClipSource;
		startTime: number;
		sessionId: number;
	}): Promise<void> {
		const audioContext = this.ensureAudioContext();
		if (!audioContext) return;

		const buffer = await this.getPreparedClipBuffer({ clip });
		if (!buffer || !this.editor.playback.getIsPlaying()) return;
		if (sessionId !== this.playbackSessionId) return;

		const clipStart = clip.startTime;
		const clipEnd = clip.startTime + clip.duration;
		const playbackTimeAfterReady = this.getPlaybackTime();
		const effectiveStartTime = Math.max(
			startTime,
			clipStart,
			playbackTimeAfterReady,
		);
		if (effectiveStartTime >= clipEnd) {
			return;
		}

		const node = audioContext.createBufferSource();
		node.buffer = buffer;
		const directSource = this.canUseDecodedSource({ clip });
		const sourceRate = directSource
			? clampRetimeRate({ rate: clip.retime?.rate ?? 1 })
			: 1;
		node.playbackRate.value = sourceRate;
		const clipGain = audioContext.createGain();
		node.connect(clipGain);
		clipGain.connect(this.masterGain ?? audioContext.destination);

		const startTimestamp =
			this.playbackStartContextTime +
			this.playbackLatencyCompensationSeconds +
			(effectiveStartTime - this.playbackStartTime);
		const clipOffset = effectiveStartTime - clipStart;
		let actualStartTimestamp = startTimestamp;
		let actualClipOffset = clipOffset;

		if (startTimestamp >= audioContext.currentTime) {
			node.start(
				startTimestamp,
				(directSource ? clip.trimStart : 0) + clipOffset * sourceRate,
				(clipEnd - effectiveStartTime) * sourceRate,
			);
		} else {
			const lateOffset = audioContext.currentTime - startTimestamp;
			actualStartTimestamp = audioContext.currentTime;
			actualClipOffset = clipOffset + lateOffset;
			node.start(
				actualStartTimestamp,
				(directSource ? clip.trimStart : 0) + actualClipOffset * sourceRate,
				Math.max(0, clip.duration - actualClipOffset) * sourceRate,
			);
		}

		this.scheduleClipGainAutomation({
			audioContext,
			clip,
			clipGain,
			startTimestamp: actualStartTimestamp,
			startLocalTime: actualClipOffset,
		});

		this.queuedSources.add(node);
		node.addEventListener("ended", () => {
			node.disconnect();
			clipGain.disconnect();
			this.queuedSources.delete(node);
		});
	}

	private waitUntilCaughtUp({
		timelineTime,
		targetAhead,
	}: {
		timelineTime: number;
		targetAhead: number;
	}): Promise<void> {
		return new Promise((resolve) => {
			const checkInterval = setInterval(() => {
				if (!this.editor.playback.getIsPlaying()) {
					clearInterval(checkInterval);
					resolve();
					return;
				}

				const playbackTime = this.getPlaybackTime();
				if (timelineTime - playbackTime < targetAhead) {
					clearInterval(checkInterval);
					resolve();
				}
			}, 100);
		});
	}

	private disposeSinks(): void {
		for (const iterator of this.clipIterators.values()) {
			void iterator.return();
		}
		this.clipIterators.clear();
		this.activeClipIds.clear();

		for (const input of this.inputs.values()) {
			input.dispose();
		}
		this.inputs.clear();
		this.sinks.clear();
	}

	private shouldUsePreparedClipBuffer({
		clip,
	}: {
		clip: AudioClipSource;
	}): boolean {
		return (
			canPredecodeAudio({
				fileBytes: clip.file.size,
				sourceDuration:
					(clip.timelineElement.sourceDuration ?? Infinity) / TICKS_PER_SECOND,
				playbackDuration: clip.duration,
			}) ||
			this.hasCurveRetime({ clip }) ||
			hasAnimatedVolume({ element: clip.timelineElement }) ||
			shouldMaintainPitch({
				rate: clip.retime?.rate ?? 1,
				maintainPitch: clip.retime?.maintainPitch,
			})
		);
	}

	private hasCurveRetime({ clip }: { clip: AudioClipSource }): boolean {
		const mode =
			clip.retime && "mode" in clip.retime ? clip.retime.mode : undefined;
		return mode === "curve";
	}

	private canUseDecodedSource({ clip }: { clip: AudioClipSource }): boolean {
		return (
			!this.hasCurveRetime({ clip }) &&
			!shouldMaintainPitch({
				rate: clip.retime?.rate ?? 1,
				maintainPitch: clip.retime?.maintainPitch,
			})
		);
	}

	private scheduleClipGainAutomation({
		audioContext,
		clip,
		clipGain,
		startTimestamp,
		startLocalTime,
	}: {
		audioContext: AudioContext;
		clip: AudioClipSource;
		clipGain: GainNode;
		startTimestamp: number;
		startLocalTime: number;
	}): void {
		clipGain.gain.cancelScheduledValues(startTimestamp);
		clipGain.gain.setValueAtTime(clip.volume, startTimestamp);

		if (!hasAnimatedVolume({ element: clip.timelineElement })) {
			return;
		}

		const points = buildAudioGainAutomation({
			element: clip.timelineElement,
			fromLocalTime: startLocalTime,
			toLocalTime: clip.duration,
		});

		if (points.length === 0) {
			return;
		}

		clipGain.gain.setValueAtTime(points[0].gain, startTimestamp);
		for (let index = 1; index < points.length; index++) {
			const point = points[index];
			const pointTimestamp =
				startTimestamp + (point.localTime - startLocalTime);
			if (pointTimestamp < audioContext.currentTime) {
				continue;
			}

			clipGain.gain.linearRampToValueAtTime(point.gain, pointTimestamp);
		}
	}

	private buildPreparedClipCacheKey({
		clip,
	}: {
		clip: AudioClipSource;
	}): string {
		return JSON.stringify({
			id: clip.id,
			sourceKey: clip.sourceKey,
			startTime: clip.startTime,
			duration: clip.duration,
			trimStart: clip.trimStart,
			trimEnd: clip.trimEnd,
			retime: clip.retime ?? null,
		});
	}

	private async getPreparedClipBuffer({
		clip,
	}: {
		clip: AudioClipSource;
	}): Promise<AudioBuffer | null> {
		const cacheKey = this.buildPreparedClipCacheKey({ clip });
		const generation = this.audioCacheGeneration;
		const existing = this.preparedClipBuffers.get(cacheKey);
		if (existing) {
			this.preparedClipBuffers.delete(cacheKey);
			this.preparedClipBuffers.set(cacheKey, existing);
			return existing;
		}

		const promise: Promise<AudioBuffer | null> =
			this.audioPreparationQueue.then(async () => {
				if (generation !== this.audioCacheGeneration) return null;
				const audioContext = this.ensureAudioContext();
				if (!audioContext) {
					return null;
				}

				const decodedBuffer = await this.getDecodedBuffer({ clip });
				if (!decodedBuffer || generation !== this.audioCacheGeneration) {
					return null;
				}
				if (this.canUseDecodedSource({ clip })) {
					return decodedBuffer;
				}

				const prepared = await renderRetimedBuffer({
					audioContext,
					sourceBuffer: decodedBuffer,
					trimStart: clip.trimStart,
					clipDuration: clip.duration,
					retime: clip.retime,
					maintainPitch: clip.retime?.maintainPitch === true,
				});
				if (this.preparedClipBuffers.get(cacheKey) === promise) {
					this.preparedBufferBytes.set(
						cacheKey,
						prepared.length * prepared.numberOfChannels * 4,
					);
					this.trimAudioCache();
				}
				return prepared;
			});
		this.audioPreparationQueue = promise.then(
			() => undefined,
			() => undefined,
		);

		this.preparedClipBuffers.set(cacheKey, promise);
		return promise;
	}

	private async getDecodedBuffer({
		clip,
	}: {
		clip: AudioClipSource;
	}): Promise<AudioBuffer | null> {
		const existing = this.decodedBuffers.get(clip.sourceKey);
		if (existing && existing.file === clip.file) {
			this.decodedBuffers.delete(clip.sourceKey);
			this.decodedBuffers.set(clip.sourceKey, existing);
			return existing.promise;
		}
		this.decodedBufferBytes.delete(clip.sourceKey);

		const promise = this.decodeClipBuffer({ clip }).then((buffer) => {
			if (
				buffer &&
				this.decodedBuffers.get(clip.sourceKey)?.promise === promise
			) {
				this.decodedBufferBytes.set(
					clip.sourceKey,
					buffer.length * buffer.numberOfChannels * 4,
				);
				this.trimAudioCache();
			}
			return buffer;
		});
		this.decodedBuffers.set(clip.sourceKey, { file: clip.file, promise });
		return promise;
	}

	private trimAudioCache(): void {
		const sum = (values: Iterable<number>) =>
			Array.from(values).reduce((total, value) => total + value, 0);
		let bytes =
			sum(this.decodedBufferBytes.values()) +
			sum(this.preparedBufferBytes.values());
		for (const key of this.preparedClipBuffers.keys()) {
			if (bytes <= 256 * 1024 * 1024) break;
			bytes -= this.preparedBufferBytes.get(key) ?? 0;
			this.preparedClipBuffers.delete(key);
			this.preparedBufferBytes.delete(key);
		}
		for (const key of this.decodedBuffers.keys()) {
			if (bytes <= 256 * 1024 * 1024) break;
			bytes -= this.decodedBufferBytes.get(key) ?? 0;
			this.decodedBuffers.delete(key);
			this.decodedBufferBytes.delete(key);
			this.preparedClipBuffers.clear();
			this.preparedBufferBytes.clear();
		}
	}

	private async decodeClipBuffer({
		clip,
	}: {
		clip: AudioClipSource;
	}): Promise<AudioBuffer | null> {
		const audioContext = this.ensureAudioContext();
		if (!audioContext) {
			return null;
		}
		const input = new Input({
			source: new BlobSource(clip.file),
			formats: ALL_FORMATS,
		});

		try {
			const audioTrack = await input.getPrimaryAudioTrack();
			if (!audioTrack) {
				return null;
			}
			const firstTimestamp = await audioTrack.getFirstTimestamp();
			if (
				canPredecodeAudio({
					fileBytes: clip.file.size,
					sourceDuration:
						(clip.timelineElement.sourceDuration ?? Infinity) /
						TICKS_PER_SECOND,
				}) &&
				Math.abs(firstTimestamp) < 0.001
			) {
				try {
					const decoded = await audioContext.decodeAudioData(
						await clip.file.arrayBuffer(),
					);
					const sourceEnd = await audioTrack.computeDuration();
					if (Math.abs(decoded.duration - sourceEnd) <= 0.001) return decoded;
				} catch {
					// Preserve codec support and source timing through the demuxed fallback.
				}
			}

			const sink = new AudioBufferSink(audioTrack);
			const chunks: Array<{ buffer: AudioBuffer; timestamp: number }> = [];
			for await (const { buffer, timestamp } of sink.buffers(0))
				chunks.push({ buffer, timestamp });
			return await renderTimedAudioBuffers({
				chunks,
				sampleRate: audioContext.sampleRate,
			});
		} catch (error) {
			console.warn("Failed to decode clip audio:", error);
			return null;
		} finally {
			input.dispose();
		}
	}

	private async getAudioSink({
		clip,
	}: {
		clip: AudioClipSource;
	}): Promise<AudioBufferSink | null> {
		const existingSink = this.sinks.get(clip.sourceKey);
		if (existingSink) return existingSink;

		try {
			const input = new Input({
				source: new BlobSource(clip.file),
				formats: ALL_FORMATS,
			});
			const audioTrack = await input.getPrimaryAudioTrack();
			if (!audioTrack) {
				input.dispose();
				return null;
			}

			const sink = new AudioBufferSink(audioTrack);
			this.inputs.set(clip.sourceKey, input);
			this.sinks.set(clip.sourceKey, sink);
			return sink;
		} catch (error) {
			console.warn("Failed to initialize audio sink:", error);
			return null;
		}
	}
}
