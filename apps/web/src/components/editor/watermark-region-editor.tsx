"use client";

import { useRef, useState, type PointerEvent } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WatermarkRegion } from "@/media/watermark/types";

export interface WatermarkSelection extends WatermarkRegion {
	id: string;
}

type DragMode = "draw" | "move" | "nw" | "ne" | "sw" | "se";

interface DragOptions {
	event: PointerEvent<HTMLDivElement | HTMLButtonElement>;
	mode: DragMode;
	region?: WatermarkSelection;
}

interface Props {
	source: string;
	width: number;
	height: number;
	duration: number;
	regions: WatermarkSelection[];
	selectedId: string;
	disabled: boolean;
	showResult: boolean;
	onSelect: (id: string) => void;
	onChange: (update: { id: string; patch: Partial<WatermarkRegion> }) => void;
}

export function WatermarkRegionEditor({
	source,
	width,
	height,
	duration,
	regions,
	selectedId,
	disabled,
	showResult,
	onSelect,
	onChange,
}: Props) {
	const stage = useRef<HTMLDivElement>(null);
	const video = useRef<HTMLVideoElement>(null);
	const drag = useRef<{
		mode: DragMode;
		region: WatermarkSelection;
		x: number;
		y: number;
	} | null>(null);
	const [time, setTime] = useState(0);
	const [playing, setPlaying] = useState(false);
	const selected = regions.find((region) => region.id === selectedId);

	const point = (event: PointerEvent<HTMLDivElement | HTMLButtonElement>) => {
		const bounds = stage.current!.getBoundingClientRect();
		return {
			x: Math.max(
				1,
				Math.min(
					width - 1,
					Math.round(((event.clientX - bounds.left) * width) / bounds.width),
				),
			),
			y: Math.max(
				1,
				Math.min(
					height - 1,
					Math.round(((event.clientY - bounds.top) * height) / bounds.height),
				),
			),
		};
	};

	const startDrag = ({ event, mode, region }: DragOptions) => {
		if (disabled || showResult || !region) return;
		event.preventDefault();
		event.stopPropagation();
		video.current?.pause();
		onSelect(region.id);
		const position = point(event);
		drag.current = { mode, region: { ...region }, ...position };
		stage.current?.setPointerCapture(event.pointerId);
	};

	const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
		const current = drag.current;
		if (!current) return;
		const position = point(event);
		const region = current.region;
		if (current.mode === "move") {
			onChange({
				id: region.id,
				patch: {
					x: Math.max(
						1,
						Math.min(
							width - region.width - 1,
							region.x + position.x - current.x,
						),
					),
					y: Math.max(
						1,
						Math.min(
							height - region.height - 1,
							region.y + position.y - current.y,
						),
					),
				},
			});
			return;
		}
		const anchorX =
			current.mode === "draw"
				? current.x
				: current.mode.endsWith("w")
					? region.x + region.width
					: region.x;
		const anchorY =
			current.mode === "draw"
				? current.y
				: current.mode.startsWith("n")
					? region.y + region.height
					: region.y;
		const nextWidth = Math.max(4, Math.abs(position.x - anchorX));
		const nextHeight = Math.max(4, Math.abs(position.y - anchorY));
		onChange({
			id: region.id,
			patch: {
				x: Math.max(
					1,
					Math.min(width - nextWidth - 1, Math.min(position.x, anchorX)),
				),
				y: Math.max(
					1,
					Math.min(height - nextHeight - 1, Math.min(position.y, anchorY)),
				),
				width: nextWidth,
				height: nextHeight,
			},
		});
	};

	return (
		<div className="flex min-w-0 flex-col gap-3">
			<div className="flex min-h-40 items-center justify-center bg-neutral-950">
				<div
					ref={stage}
					role="group"
					aria-label="Vùng chọn logo"
					data-testid="watermark-stage"
					className="relative select-none touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
					style={{
						aspectRatio: `${width}/${height}`,
						width: `min(100%, ${(42 * width) / height}vh)`,
					}}
					onPointerDown={(event) =>
						startDrag({ event, mode: "draw", region: selected })
					}
					onPointerMove={moveDrag}
					onPointerUp={(event) => {
						drag.current = null;
						if (stage.current?.hasPointerCapture(event.pointerId))
							stage.current.releasePointerCapture(event.pointerId);
					}}
					onPointerCancel={() => {
						drag.current = null;
					}}
				>
					<video
						ref={video}
						src={source}
						playsInline
						muted
						preload="auto"
						className="block size-full pointer-events-none"
						onTimeUpdate={() => setTime(video.current?.currentTime ?? 0)}
						onPlay={() => setPlaying(true)}
						onPause={() => setPlaying(false)}
					/>
					{!showResult &&
						regions.map((region, index) => (
							<WatermarkRegionBox
								key={region.id}
								region={region}
								index={index}
								selected={region.id === selectedId}
								width={width}
								height={height}
								disabled={disabled}
								onDrag={startDrag}
								onChange={onChange}
								onSelect={onSelect}
							/>
						))}
				</div>
			</div>
			<div className="flex items-center gap-3">
				<Button
					variant="ghost"
					size="icon"
					aria-label={playing ? "Tạm dừng" : "Phát video"}
					title={playing ? "Tạm dừng" : "Phát video"}
					onClick={() => {
						if (playing) video.current?.pause();
						else void video.current?.play();
					}}
				>
					{playing ? <Pause /> : <Play />}
				</Button>
				<input
					type="range"
					aria-label="Vị trí xem video"
					min={0}
					max={duration}
					step={0.05}
					value={Math.min(time, duration)}
					className="min-w-0 flex-1 accent-primary"
					onChange={(event) => {
						const next = Number(event.target.value);
						if (video.current) video.current.currentTime = next;
						setTime(next);
					}}
				/>
				<span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
					{time.toFixed(1)} / {duration.toFixed(1)} s
				</span>
			</div>
		</div>
	);
}

function WatermarkRegionBox({
	region,
	index,
	selected,
	width,
	height,
	disabled,
	onDrag,
	onChange,
	onSelect,
}: {
	region: WatermarkSelection;
	index: number;
	selected: boolean;
	width: number;
	height: number;
	disabled: boolean;
	onDrag: (options: DragOptions) => void;
	onChange: Props["onChange"];
	onSelect: Props["onSelect"];
}) {
	return (
		<div
			role="group"
			aria-label={`Vùng logo ${index + 1}`}
			className={`absolute border-2 ${selected ? "border-amber-400" : "border-white/70"}`}
			style={{
				left: `${(region.x / width) * 100}%`,
				top: `${(region.y / height) * 100}%`,
				width: `${(region.width / width) * 100}%`,
				height: `${(region.height / height) * 100}%`,
			}}
		>
			<button
				type="button"
				disabled={disabled}
				aria-label={`Di chuyển vùng logo ${index + 1}`}
				className="absolute inset-0 cursor-move bg-transparent focus-visible:ring-2 focus-visible:ring-ring"
				onClick={() => onSelect(region.id)}
				onPointerDown={(event) => onDrag({ event, mode: "move", region })}
				onKeyDown={(event) => {
					const amount = event.shiftKey ? 10 : 1;
					const dx =
						event.key === "ArrowLeft"
							? -amount
							: event.key === "ArrowRight"
								? amount
								: 0;
					const dy =
						event.key === "ArrowUp"
							? -amount
							: event.key === "ArrowDown"
								? amount
								: 0;
					if (!dx && !dy) return;
					event.preventDefault();
					onChange({
						id: region.id,
						patch: {
							x: Math.max(1, Math.min(width - region.width - 1, region.x + dx)),
							y: Math.max(
								1,
								Math.min(height - region.height - 1, region.y + dy),
							),
						},
					});
				}}
			/>
			<span className="pointer-events-none absolute -top-5 left-0 text-xs font-medium text-amber-400">
				{index + 1}
			</span>
			{selected &&
				(["nw", "ne", "sw", "se"] as const).map((corner) => (
					<button
						key={corner}
						type="button"
						disabled={disabled}
						aria-label={`Đổi kích thước vùng ${index + 1}, góc ${corner}`}
						title="Đổi kích thước vùng logo"
						className="absolute size-3 border border-neutral-950 bg-amber-400"
						style={{
							left: corner.endsWith("w") ? -6 : undefined,
							right: corner.endsWith("e") ? -6 : undefined,
							top: corner.startsWith("n") ? -6 : undefined,
							bottom: corner.startsWith("s") ? -6 : undefined,
							cursor:
								corner === "nw" || corner === "se"
									? "nwse-resize"
									: "nesw-resize",
						}}
						onPointerDown={(event) => onDrag({ event, mode: corner, region })}
					/>
				))}
		</div>
	);
}
