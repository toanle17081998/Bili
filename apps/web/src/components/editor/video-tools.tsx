"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { buildGraphicElement } from "@/timeline/element-utils";
import { InsertElementCommand } from "@/commands";
import { ZERO_MEDIA_TIME } from "@/wasm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ExportButton } from "./export-button";

const PRESETS = [
	{ label: "Dọc 9:16 · 1080 × 1920", width: 1080, height: 1920 },
	{ label: "Ngang 16:9 · 1920 × 1080", width: 1920, height: 1080 },
	{ label: "Vuông 1:1 · 1080 × 1080", width: 1080, height: 1080 },
	{ label: "4:3 · 1440 × 1080", width: 1440, height: 1080 },
	{ label: "Dọc 9:16 · 720 × 1280", width: 720, height: 1280 },
];

export function VideoTools({ onEditCover }: { onEditCover: () => void }) {
	const editor = useEditor();
	const project = useEditor((e) => e.project.getActive());
	const { width, height } = project.settings.canvasSize;
	const [customWidth, setCustomWidth] = useState(String(width));
	const [customHeight, setCustomHeight] = useState(String(height));
	const [color, setColor] = useState("#000000");
	const [error, setError] = useState("");
	const value = PRESETS.some((p) => p.width === width && p.height === height)
		? `${width}x${height}`
		: "custom";

	const applySize = async (
		nextWidth: number,
		nextHeight: number,
		custom = false,
	) => {
		if (
			![nextWidth, nextHeight].every(
				(n) => Number.isInteger(n) && n >= 16 && n <= 4096 && n % 2 === 0,
			)
		) {
			setError("Nhập kích thước chẵn từ 16 đến 4096 px để xuất MP4.");
			return;
		}
		setError("");
		await editor.project.updateSettings({
			settings: {
				canvasSize: { width: nextWidth, height: nextHeight },
				canvasSizeMode: custom ? "custom" : "preset",
			},
		});
		await editor.project.saveCurrentProject();
		setCustomWidth(String(nextWidth));
		setCustomHeight(String(nextHeight));
	};

	const addCover = async () => {
		const duration = editor.timeline.getTotalDuration();
		if (duration <= 0) {
			toast.error("Hãy thêm video vào timeline trước.");
			return;
		}
		const element = buildGraphicElement({
			definitionId: "rectangle",
			name: "Che logo",
			startTime: ZERO_MEDIA_TIME,
			params: {
				fill: color,
				strokeWidth: 0,
				"transform.scaleX": 0.25,
				"transform.scaleY": 0.08,
			},
		});
		const command = new InsertElementCommand({
			element: { ...element, duration },
			placement: { mode: "auto", trackType: "graphic", insertIndex: 0 },
		});
		editor.command.execute({ command });
		const trackId = command.getTrackId();
		if (!trackId) {
			toast.error("Không thể thêm vùng che logo.");
			return;
		}
		if (trackId)
			editor.selection.setSelectedElements({
				elements: [{ trackId, elementId: command.getElementId() }],
			});
		await editor.project.saveCurrentProject();
		onEditCover();
	};

	return (
		<div className="flex h-full flex-col gap-5 overflow-y-auto p-4">
			<h3 className="text-sm font-semibold">Video & preview</h3>
			<div className="flex flex-col gap-2">
				<Label htmlFor="video-size">Kích thước video</Label>
				<Select
					value={value}
					onValueChange={(v) => {
						const preset = PRESETS.find((p) => `${p.width}x${p.height}` === v);
						if (preset) void applySize(preset.width, preset.height);
					}}
				>
					<SelectTrigger id="video-size">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{PRESETS.map((p) => (
							<SelectItem
								key={`${p.width}x${p.height}`}
								value={`${p.width}x${p.height}`}
							>
								{p.label}
							</SelectItem>
						))}
						<SelectItem value="custom">Tùy chỉnh</SelectItem>
					</SelectContent>
				</Select>
				<form
					className="flex flex-col gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						void applySize(Number(customWidth), Number(customHeight), true);
					}}
				>
					<div className="grid grid-cols-2 gap-2">
						<div>
							<Label htmlFor="video-width">Rộng (px)</Label>
							<Input
								id="video-width"
								type="number"
								min={16}
								max={4096}
								step={2}
								value={customWidth}
								onChange={(e) => setCustomWidth(e.target.value)}
							/>
						</div>
						<div>
							<Label htmlFor="video-height">Cao (px)</Label>
							<Input
								id="video-height"
								type="number"
								min={16}
								max={4096}
								step={2}
								value={customHeight}
								onChange={(e) => setCustomHeight(e.target.value)}
							/>
						</div>
					</div>
					<Button type="submit" variant="outline">
						Áp dụng kích thước
					</Button>
				</form>
				{error && (
					<p role="alert" className="text-xs text-destructive">
						{error}
					</p>
				)}
				<p className="text-xs text-muted-foreground">
					Preview và video xuất dùng khung {width} × {height}. Chọn “Vừa khung”
					hoặc mức zoom bên dưới preview để phóng to khi chỉnh sửa.
				</p>
			</div>
			<div className="flex flex-col gap-3 border-t pt-4">
				<h4 className="text-sm font-semibold">Che logo</h4>
				<div className="flex items-center justify-between">
					<Label htmlFor="cover-color">Màu vùng che</Label>
					<input
						id="cover-color"
						aria-label="Màu vùng che"
						type="color"
						value={color}
						onChange={(e) => setColor(e.target.value)}
						className="h-8 w-12 cursor-pointer"
					/>
				</div>
				<Button onClick={() => void addCover()}>Thêm vùng che logo</Button>
				<p className="text-xs text-muted-foreground">
					Vùng che áp dụng suốt video. Kéo vùng che trên preview đến logo, kéo
					góc để đổi kích thước. Chọn tab “Chi tiết” để chỉnh màu, vị trí và
					kích thước; nhấn Delete để xóa.
				</p>
			</div>
			<div className="mt-auto flex items-center justify-between border-t pt-4">
				<span className="text-xs text-muted-foreground">
					Xuất kèm vùng che logo
				</span>
				<ExportButton />
			</div>
		</div>
	);
}
