import {
	BufferTarget,
	CanvasSource,
	Mp4OutputFormat,
	Output,
	WebMOutputFormat,
	type VideoEncodingConfig,
} from "mediabunny";

class UnsupportedVideoEncodingError extends Error {
	constructor(readonly config: VideoEncoderConfig) {
		super("Browser rejected the video encoder configuration");
	}
}

export async function resolveVideoEncodingFallback({
	config,
}: {
	config: VideoEncoderConfig;
}): Promise<Pick<VideoEncodingConfig, "fullCodecString" | "hardwareAcceleration">> {
	if (typeof VideoEncoder === "undefined")
		throw new Error("Video export requires a browser with WebCodecs video encoding support.");

	const codecs = [config.codec];
	const avc = /^(avc[13])\.[0-9a-f]{4}([0-9a-f]{2})$/i.exec(config.codec);
	if (avc) {
		for (const profile of ["4d00", "4200", "42e0"])
			codecs.push(avc[1] + "." + profile + avc[2]);
	}
	for (const codec of new Set(codecs)) {
		for (const hardwareAcceleration of [
			"no-preference", "prefer-hardware", "prefer-software",
		] as const) {
			const { supported } = await VideoEncoder.isConfigSupported({
				...config,
				codec,
				hardwareAcceleration,
			});
			if (supported) return { fullCodecString: codec, hardwareAcceleration };
		}
	}
	const format = avc ? "MP4 (H.264)" : "WebM (VP9)";
	const alternative = avc ? "Try WebM or a lower resolution." : "Try MP4 or a lower resolution.";
	throw new Error(
		"This browser cannot encode " + format + " at " + config.width + "x" + config.height + ". " + alternative,
	);
}

async function probeCanvasEncoding({
	canvas,
	encoding,
	frameRate,
}: {
	canvas: HTMLCanvasElement;
	encoding: VideoEncodingConfig;
	frameRate: number;
}) {
	const captured: { config?: VideoEncoderConfig } = {};
	const output = new Output({
		format: encoding.codec === "avc" ? new Mp4OutputFormat() : new WebMOutputFormat(),
		target: new BufferTarget(),
	});
	const source = new CanvasSource(canvas, {
		...encoding,
		onEncoderConfig: (config) => { captured.config = config; },
	});
	output.addVideoTrack(source, { frameRate });
	try {
		await output.start();
		await source.add(0, 1 / frameRate);
	} catch (error) {
		if (
			captured.config &&
			typeof VideoEncoder !== "undefined" &&
			!(await VideoEncoder.isConfigSupported(captured.config)).supported
		)
			throw new UnsupportedVideoEncodingError(captured.config);
		throw error;
	} finally {
		await output.cancel();
	}
}

// Probe the exact canvas and FPS; codec-only checks can pass when export cannot.
export async function getCompatibleCanvasEncoding({
	canvas,
	encoding,
	frameRate,
}: {
	canvas: HTMLCanvasElement;
	encoding: VideoEncodingConfig;
	frameRate: number;
}): Promise<VideoEncodingConfig> {
	try {
		await probeCanvasEncoding({ canvas, encoding, frameRate });
		return encoding;
	} catch (error) {
		if (!(error instanceof UnsupportedVideoEncodingError)) throw error;
		const fallback = await resolveVideoEncodingFallback({ config: error.config });
		const compatible = { ...encoding, ...fallback };
		await probeCanvasEncoding({ canvas, encoding: compatible, frameRate });
		return compatible;
	}
}
