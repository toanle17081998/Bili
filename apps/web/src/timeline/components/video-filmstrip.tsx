"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useResizeObserver } from "@/hooks/use-resize-observer";
import { createFilmstripSource } from "@/media/filmstrip";
import { getSourceTimeAtClipTime } from "@/retime/resolve";
import type { MediaAsset } from "@/media/types";
import type { VideoElement } from "@/timeline";
import { findScrollParent } from "@/utils/browser";
import { TICKS_PER_SECOND } from "@/wasm";

interface VisibleTiles {
	first: number;
	end: number;
}

export const VideoFilmstrip = memo(function VideoFilmstrip({
	element,
	mediaAsset,
	pixelsPerSecond,
	height,
}: {
	element: VideoElement;
	mediaAsset: MediaAsset;
	pixelsPerSecond: number;
	height: number;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [visibleTiles, setVisibleTiles] = useState<VisibleTiles>({
		first: 0,
		end: 0,
	});
	const tileWidth = height * (16 / 9);
	const { file, duration: sourceDuration, fps } = mediaAsset;
	const { startTime, duration, trimStart, retime } = element;

	const measureVisibleTiles = useCallback(() => {
		const container = containerRef.current;
		if (!container) return;
		const rect = container.getBoundingClientRect();
		const scrollParent = findScrollParent({ element: container });
		const viewport = scrollParent?.getBoundingClientRect() ?? {
			left: 0,
			right: window.innerWidth,
			top: 0,
			bottom: window.innerHeight,
		};
		const left = Math.max(0, viewport.left - rect.left);
		const right = Math.min(rect.width, viewport.right - rect.left);
		const isVisible =
			right > left && rect.bottom > viewport.top && rect.top < viewport.bottom;
		const first = isVisible ? Math.floor(left / tileWidth) : 0;
		const end = isVisible ? Math.ceil(right / tileWidth) : 0;
		setVisibleTiles((previous) =>
			previous.first === first && previous.end === end
				? previous
				: { first, end },
		);
	}, [tileWidth]);

	useResizeObserver({ ref: containerRef, onResize: measureVisibleTiles });

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const scrollParent = findScrollParent({ element: container });
		let animationFrame = 0;
		const scheduleMeasure = () => {
			cancelAnimationFrame(animationFrame);
			animationFrame = requestAnimationFrame(measureVisibleTiles);
		};
		scheduleMeasure();
		const viewportObserver = new ResizeObserver(scheduleMeasure);
		if (scrollParent) viewportObserver.observe(scrollParent);
		scrollParent?.addEventListener("scroll", scheduleMeasure, {
			passive: true,
		});
		window.addEventListener("resize", scheduleMeasure);
		return () => {
			cancelAnimationFrame(animationFrame);
			viewportObserver.disconnect();
			scrollParent?.removeEventListener("scroll", scheduleMeasure);
			window.removeEventListener("resize", scheduleMeasure);
		};
	}, [measureVisibleTiles, startTime, duration, pixelsPerSecond]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (
			!canvas ||
			visibleTiles.end <= visibleTiles.first ||
			pixelsPerSecond <= 0
		)
			return;
		const scale = Math.min(window.devicePixelRatio || 1, 2);
		const frameWidth = Math.ceil(tileWidth * scale);
		const frameHeight = Math.ceil(height * scale);
		canvas.width = (visibleTiles.end - visibleTiles.first) * frameWidth;
		canvas.height = frameHeight;
		const context = canvas.getContext("2d");
		if (!context) return;

		const source = createFilmstripSource({
			file,
			width: frameWidth,
			height: frameHeight,
		});
		let cancelled = false;
		async function drawFrames() {
			try {
				const frameRate = fps && fps > 0 ? fps : 30;
				for (
					let index = visibleTiles.first;
					index < visibleTiles.end;
					index++
				) {
					if (cancelled) return;
					const clipTime = Math.min(
						duration / TICKS_PER_SECOND,
						(index * tileWidth) / pixelsPerSecond,
					);
					const sourceTime =
						trimStart / TICKS_PER_SECOND +
						getSourceTimeAtClipTime({ clipTime, retime });
					const time = Math.max(
						0,
						Math.min(
							Math.floor(sourceTime * frameRate) / frameRate,
							Math.max(0, (sourceDuration ?? Infinity) - 1 / frameRate),
						),
					);
					const frame = await source.getFrame({ time });
					if (cancelled) return;
					if (frame)
						context!.drawImage(
							frame,
							(index - visibleTiles.first) * frameWidth,
							0,
						);
				}
			} catch {
				// Leave the clip label visible when its codec cannot be decoded.
			} finally {
				source.dispose();
			}
		}
		// Coalesce rapid zoom/trim updates before starting another decode pass.
		const timeout = window.setTimeout(() => void drawFrames(), 100);
		return () => {
			cancelled = true;
			window.clearTimeout(timeout);
			source.dispose();
		};
	}, [
		file,
		fps,
		sourceDuration,
		duration,
		trimStart,
		retime,
		pixelsPerSecond,
		height,
		tileWidth,
		visibleTiles,
	]);

	return (
		<div
			ref={containerRef}
			className="pointer-events-none absolute inset-0 overflow-hidden bg-muted"
			aria-hidden="true"
		>
			{visibleTiles.end > visibleTiles.first && (
				<canvas
					ref={canvasRef}
					className="absolute top-0 h-full"
					style={{
						left: visibleTiles.first * tileWidth,
						width: (visibleTiles.end - visibleTiles.first) * tileWidth,
					}}
				/>
			)}
		</div>
	);
});
