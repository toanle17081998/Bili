export function canPredecodeAudio({
	fileBytes,
	sourceDuration,
	playbackDuration = sourceDuration,
}: {
	fileBytes: number;
	sourceDuration: number;
	playbackDuration?: number;
}) {
	// Bound full-file decoding so long recordings retain the streaming path.
	return (
		fileBytes > 0 &&
		fileBytes <= 256 * 1024 * 1024 &&
		Number.isFinite(sourceDuration) &&
		sourceDuration > 0 &&
		sourceDuration <= 300 &&
		Number.isFinite(playbackDuration) &&
		playbackDuration > 0 &&
		playbackDuration <= 300
	);
}

export async function renderTimedAudioBuffers({
	chunks,
	sampleRate,
}: {
	chunks: Array<{ buffer: AudioBuffer; timestamp: number }>;
	sampleRate: number;
}): Promise<AudioBuffer | null> {
	const endTime = chunks.reduce(
		(end, chunk) => Math.max(end, chunk.timestamp + chunk.buffer.duration),
		0,
	);
	if (!chunks.length || endTime <= 0) return null;
	const nativeSampleRate = chunks[0].buffer.sampleRate;
	const channels = Math.min(2, chunks[0].buffer.numberOfChannels);
	if (
		chunks.every(
			({ buffer }) =>
				buffer.sampleRate === nativeSampleRate &&
				buffer.numberOfChannels === channels,
		)
	) {
		// Assemble timestamped PCM before resampling instead of scheduling every packet.
		const assembled = new AudioBuffer({
			numberOfChannels: channels,
			length: Math.ceil(endTime * nativeSampleRate),
			sampleRate: nativeSampleRate,
		});
		for (let channel = 0; channel < channels; channel++) {
			const output = assembled.getChannelData(channel);
			for (const { buffer, timestamp } of chunks) {
				const offset = Math.round(timestamp * nativeSampleRate);
				const samples = buffer.getChannelData(
					Math.min(channel, buffer.numberOfChannels - 1),
				);
				const firstSample = Math.max(0, -offset);
				const lastSample = Math.min(samples.length, output.length - offset);
				for (let index = firstSample; index < lastSample; index++)
					output[offset + index] += samples[index];
			}
		}
		if (nativeSampleRate === sampleRate) return assembled;
		const context = new OfflineAudioContext(
			channels,
			Math.ceil(endTime * sampleRate),
			sampleRate,
		);
		const source = context.createBufferSource();
		source.buffer = assembled;
		source.connect(context.destination);
		source.start(0);
		return context.startRendering();
	}
	const context = new OfflineAudioContext(
		channels,
		Math.ceil(endTime * sampleRate),
		sampleRate,
	);
	for (const { buffer, timestamp } of chunks) {
		if (timestamp + buffer.duration <= 0) continue;
		const source = context.createBufferSource();
		source.buffer = buffer;
		source.connect(context.destination);
		source.start(Math.max(0, timestamp), Math.max(0, -timestamp));
	}
	return context.startRendering();
}
