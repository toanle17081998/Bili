const THUMBNAIL_MAX_WIDTH = 1280;
const THUMBNAIL_MAX_HEIGHT = 720;

// Filmstrip frames are kept small so the composed strip stays light.
// 10 frames at 80x45 → 800x45 dataURL, well under the 1280x720 single-frame cap.
// Frame dimensions are exactly 16:9 so the strip scales cleanly to any track height.
// The strip tiles naturally across the element width, showing multiple distinct
// frames (CapCut-style). A 800px-wide strip means ~3 frames per 300px element.
export const FILMSTRIP_FRAME_COUNT = 10;
const FILMSTRIP_FRAME_MAX_WIDTH = 80;
const FILMSTRIP_FRAME_MAX_HEIGHT = 45;

export function thumbnailSize({
	width,
	height,
}: {
	width: number;
	height: number;
}): { width: number; height: number } {
	const aspectRatio = width / height;
	let targetWidth = width;
	let targetHeight = height;

	if (targetWidth > THUMBNAIL_MAX_WIDTH) {
		targetWidth = THUMBNAIL_MAX_WIDTH;
		targetHeight = Math.round(targetWidth / aspectRatio);
	}
	if (targetHeight > THUMBNAIL_MAX_HEIGHT) {
		targetHeight = THUMBNAIL_MAX_HEIGHT;
		targetWidth = Math.round(targetHeight * aspectRatio);
	}

	return { width: targetWidth, height: targetHeight };
}

function filmstripFrameSize({
	width,
	height,
}: {
	width: number;
	height: number;
}): { width: number; height: number } {
	const aspectRatio = width / height;
	let targetWidth = Math.min(width, FILMSTRIP_FRAME_MAX_WIDTH);
	let targetHeight = Math.round(targetWidth / aspectRatio);
	if (targetHeight > FILMSTRIP_FRAME_MAX_HEIGHT) {
		targetHeight = FILMSTRIP_FRAME_MAX_HEIGHT;
		targetWidth = Math.round(targetHeight * aspectRatio);
	}
	return { width: targetWidth, height: targetHeight };
}

export function renderThumbnailDataUrl({
	width,
	height,
	draw,
}: {
	width: number;
	height: number;
	draw: ({
		context,
		width,
		height,
	}: {
		context: CanvasRenderingContext2D;
		width: number;
		height: number;
	}) => void;
}): string {
	const size = thumbnailSize({ width, height });
	const canvas = document.createElement("canvas");
	canvas.width = size.width;
	canvas.height = size.height;
	const context = canvas.getContext("2d");

	if (!context) {
		throw new Error("Could not get canvas context");
	}

	draw({ context, width: size.width, height: size.height });
	return canvas.toDataURL("image/jpeg", 0.8);
}

/**
 * Compose N frames side-by-side into a single horizontal strip.
 * The returned dataURL has aspect ratio = frameCount * (frameWidth/frameHeight),
 * so the timeline can tile it with `background-repeat: repeat-x` and each
 * repetition shows all frames in order.
 */
export function renderFilmstripDataUrl({
	width,
	height,
	frameCount,
	drawFrame,
}: {
	width: number;
	height: number;
	frameCount: number;
	drawFrame: ({
		context,
		width,
		height,
		frameIndex,
	}: {
		context: CanvasRenderingContext2D;
		width: number;
		height: number;
		frameIndex: number;
	}) => void;
}): string {
	const size = filmstripFrameSize({ width, height });
	const canvas = document.createElement("canvas");
	canvas.width = size.width * frameCount;
	canvas.height = size.height;
	const context = canvas.getContext("2d");

	if (!context) {
		throw new Error("Could not get canvas context");
	}

	for (let i = 0; i < frameCount; i++) {
		context.save();
		context.translate(i * size.width, 0);
		drawFrame({ context, width: size.width, height: size.height, frameIndex: i });
		context.restore();
	}

	return canvas.toDataURL("image/jpeg", 0.8);
}
