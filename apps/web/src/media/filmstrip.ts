import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";

const MAX_CACHED_FRAMES_PER_FILE = 128;
const frameCache = new WeakMap<File, Map<string, HTMLCanvasElement>>();

// Timeline thumbnails use their own decoder so seeking them cannot interrupt playback.
export function createFilmstripSource({
	file,
	width,
	height,
}: {
	file: File;
	width: number;
	height: number;
}) {
	let input: Input | null = null;
	let sinkPromise: Promise<CanvasSink | null> | null = null;
	let disposed = false;
	let cachedFrames = frameCache.get(file);
	if (!cachedFrames) {
		cachedFrames = new Map();
		frameCache.set(file, cachedFrames);
	}
	const cache = cachedFrames;

	async function initializeSink() {
		input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
		const track = await input.getPrimaryVideoTrack();
		if (!track || disposed || !(await track.canDecode())) {
			return null;
		}
		if (disposed) return null;
		return new CanvasSink(track, { width, height, fit: "cover", poolSize: 1 });
	}

	return {
		async getFrame({
			time,
		}: {
			time: number;
		}): Promise<HTMLCanvasElement | null> {
			if (disposed) return null;
			const key = `${width}:${height}:${time}`;
			const cached = cache.get(key);
			if (cached) {
				cache.delete(key);
				cache.set(key, cached);
				return cached;
			}

			sinkPromise ??= initializeSink();
			const sink = await sinkPromise;
			if (!sink || disposed) return null;
			const frame = await sink.getCanvas(time);
			if (!frame || disposed) return null;

			// CanvasSink reuses its pool; retain a small copy rather than the pooled canvas.
			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext("2d");
			if (!context) return null;
			context.drawImage(frame.canvas, 0, 0, width, height);
			cache.set(key, canvas);
			while (cache.size > MAX_CACHED_FRAMES_PER_FILE) {
				const oldestKey = cache.keys().next().value;
				if (oldestKey === undefined) break;
				cache.delete(oldestKey);
			}
			return canvas;
		},
		dispose() {
			disposed = true;
			input?.dispose();
		},
	};
}
