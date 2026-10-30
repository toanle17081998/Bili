export const OUTPUT_WIDTH = 1080;
export const OUTPUT_HEIGHT = 1920;

export interface NormalizedBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface PixelBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

export const DEFAULT_SUBTITLE_BOX: NormalizedBox = {
	x: 0.04,
	y: 0.82,
	width: 0.92,
	height: 0.09,
};

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));
const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

export function fitVideoRect({
	sourceWidth,
	sourceHeight,
}: {
	sourceWidth: number;
	sourceHeight: number;
}): PixelBox {
	const scale = Math.min(
		OUTPUT_WIDTH / sourceWidth,
		OUTPUT_HEIGHT / sourceHeight,
	);
	const width = even(sourceWidth * scale);
	const height = even(sourceHeight * scale);
	return {
		width: Math.min(width, OUTPUT_WIDTH),
		height: Math.min(height, OUTPUT_HEIGHT),
		x: Math.floor((OUTPUT_WIDTH - Math.min(width, OUTPUT_WIDTH)) / 2),
		y: Math.floor((OUTPUT_HEIGHT - Math.min(height, OUTPUT_HEIGHT)) / 2),
	};
}

/**
 * Normalizes a candidate subtitle box so tall union boxes are anchored
 * to the subtitle band while preserving the video's actual vertical subtitle position.
 */
export function normalizeSubtitleBand(box: NormalizedBox): NormalizedBox {
	const bottom = clamp(box.y + box.height, 0, 0.99);
	// If Vision returned a tall union box stretching across the frame,
	// anchor to its bottom edge if the bottom edge sits in [0.55, 0.98].
	if (box.height > 0.22) {
		if (bottom >= 0.55 && bottom <= 0.98) {
			const h = 0.095;
			return {
				x: box.x,
				y: bottom - h,
				width: box.width,
				height: h,
			};
		}
		return DEFAULT_SUBTITLE_BOX;
	}
	const centerY = box.y + box.height / 2;
	if (centerY < 0.18 || bottom > 0.99) {
		return DEFAULT_SUBTITLE_BOX;
	}
	return box;
}

/**
 * Selects the most consistent subtitle band across multiple video frames,
 * clustering by vertical center so each video's true subtitle Y position is used.
 */
export function selectConsistentSubtitleBox(
	candidates: NormalizedBox[],
): NormalizedBox {
	const normalized = candidates.map(normalizeSubtitleBand);
	if (!normalized.length) return DEFAULT_SUBTITLE_BOX;
	if (normalized.length === 1) return normalized[0];

	let bestCluster: NormalizedBox[] = [normalized[0]];
	for (const anchor of normalized) {
		const anchorCy = anchor.y + anchor.height / 2;
		const cluster = normalized.filter((item) => {
			const cy = item.y + item.height / 2;
			return Math.abs(cy - anchorCy) <= 0.075;
		});
		if (cluster.length > bestCluster.length) {
			bestCluster = cluster;
		}
	}

	const sortedCy = bestCluster
		.map((b) => b.y + b.height / 2)
		.sort((a, b) => a - b);
	const medianCy = sortedCy[Math.floor(sortedCy.length / 2)];
	const maxHeight = clamp(
		Math.max(...bestCluster.map((b) => b.height)),
		0.05,
		0.2,
	);
	const minLeft = clamp(Math.min(...bestCluster.map((b) => b.x)), 0, 0.9);
	const maxRight = clamp(
		Math.max(...bestCluster.map((b) => b.x + b.width)),
		minLeft + 0.1,
		1,
	);
	const y = clamp(medianCy - maxHeight / 2, 0.05, 0.98 - maxHeight);
	return {
		x: minLeft,
		y,
		width: maxRight - minLeft,
		height: maxHeight,
	};
}

/**
 * Maps a detected subtitle bounding box (normalized 0..1 on source frame)
 * into a cover strip in 1080x1920 output pixels, centered directly over
 * the detected subtitle position of that specific video.
 */
export function mapSubtitleBox({
	box,
	sourceWidth,
	sourceHeight,
	minWidthRatio = 0.94,
	minHeightRatio = 0.15,
}: {
	box: NormalizedBox;
	sourceWidth: number;
	sourceHeight: number;
	minWidthRatio?: number;
	minHeightRatio?: number;
}): PixelBox {
	const video = fitVideoRect({ sourceWidth, sourceHeight });
	const normalized = normalizeSubtitleBand(box);

	const centerY = clamp(
		normalized.y + normalized.height / 2,
		0.2,
		0.95,
	);
	const effectiveWidthRatio = clamp(
		Math.max(minWidthRatio, normalized.width + 0.14),
		0.65,
		1,
	);
	const effectiveHeightRatio = clamp(
		Math.max(minHeightRatio, Math.min(normalized.height, 0.18) * 1.55),
		0.11,
		0.26,
	);

	const left = (1 - effectiveWidthRatio) / 2;
	const right = clamp(left + effectiveWidthRatio, 0, 1);

	const top = clamp(
		centerY - effectiveHeightRatio / 2,
		0.05,
		Math.min(0.99 - effectiveHeightRatio, 1 - effectiveHeightRatio),
	);
	const bottom = clamp(top + effectiveHeightRatio, 0, 0.99);

	const x = video.x + Math.floor(left * video.width);
	const y = video.y + Math.floor(top * video.height);
	const width = Math.max(
		2,
		Math.min(
			video.x + video.width - x,
			Math.ceil((right - left) * video.width),
		),
	);
	const height = Math.max(
		2,
		Math.min(
			video.y + video.height - y,
			Math.ceil((bottom - top) * video.height),
		),
	);
	return { x, y, width: even(width), height: even(height) };
}

/** Bottom margin (px from the bottom edge) that keeps new captions inside the cover box. */
export function subtitleMarginV({ cover }: { cover: PixelBox }): number {
	const inset = Math.round(cover.height * 0.18);
	return Math.max(0, OUTPUT_HEIGHT - (cover.y + cover.height) + inset);
}

export function subtitleFontSize({ cover }: { cover: PixelBox }): number {
	return clamp(Math.round(cover.height * 0.42), 36, 68);
}

export function blurRadius({ cover }: { cover: PixelBox }): number {
	return Math.max(
		1,
		Math.min(20, Math.ceil(Math.min(cover.width, cover.height) / 4) - 1),
	);
}

export function normalizedBoxToPixels({
	box,
	sourceWidth,
	sourceHeight,
	padRatio = 0.012,
}: {
	box: NormalizedBox;
	sourceWidth: number;
	sourceHeight: number;
	padRatio?: number;
}): PixelBox {
	const left = Math.max(0, box.x - padRatio);
	const top = Math.max(0, box.y - padRatio);
	const right = Math.min(1, box.x + box.width + padRatio);
	const bottom = Math.min(1, box.y + box.height + padRatio);
	const x = clamp(Math.floor(left * sourceWidth), 1, sourceWidth - 6);
	const y = clamp(Math.floor(top * sourceHeight), 1, sourceHeight - 6);
	const width = clamp(
		Math.ceil((right - left) * sourceWidth),
		4,
		sourceWidth - x - 1,
	);
	const height = clamp(
		Math.ceil((bottom - top) * sourceHeight),
		4,
		sourceHeight - y - 1,
	);
	return { x, y, width, height };
}
