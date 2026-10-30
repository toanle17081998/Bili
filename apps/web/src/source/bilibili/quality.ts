export interface QualityFormat {
	url?: string;
	vcodec?: string;
	height?: number;
	tbr?: number;
}

export interface VideoQualityOption {
	height: number;
	label: string;
}

const isVideo = (format: QualityFormat) =>
	Boolean(format.url) && Boolean(format.vcodec) && format.vcodec !== "none";

export function isValidQuality(value: unknown): value is number {
	return Number.isInteger(value) && (value as number) >= 144 && (value as number) <= 4320;
}

export function listVideoQualities(
	formats: QualityFormat[],
): VideoQualityOption[] {
	const heights = new Set<number>();
	for (const format of formats) {
		if (isVideo(format) && format.height) heights.add(format.height);
	}
	return [...heights]
		.sort((a, b) => b - a)
		.map((height) => ({ height, label: `${height}p` }));
}

function compareBest(a: QualityFormat, b: QualityFormat) {
	return (
		(b.height || 0) * 100000 + (b.tbr || 0) - ((a.height || 0) * 100000 + (a.tbr || 0))
	);
}

/**
 * Picks the video stream for the requested height: the best stream not above it,
 * or the lowest stream above it when nothing smaller exists. Without a request
 * the best stream wins. H.264 is preferred because HEVC is not decodable everywhere.
 */
export function selectVideoFormat(
	formats: QualityFormat[],
	quality?: number,
): QualityFormat | undefined {
	const videos = formats.filter(isVideo);
	const avc = videos.filter((format) => format.vcodec?.toLowerCase().startsWith("avc"));
	let candidates = avc.length ? avc : videos;
	if (quality) {
		const withinLimit = candidates.filter(
			(format) => (format.height || 0) <= quality,
		);
		if (withinLimit.length) {
			candidates = withinLimit;
		} else {
			const lowest = Math.min(...candidates.map((format) => format.height || 0));
			candidates = candidates.filter((format) => (format.height || 0) === lowest);
		}
	}
	return [...candidates].sort(compareBest)[0];
}
