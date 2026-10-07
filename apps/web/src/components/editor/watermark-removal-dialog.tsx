"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Eraser, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { processMediaAssets } from "@/media/processing";
import { videoCache } from "@/services/video-cache/service";
import type { WatermarkRegion, WatermarkResult } from "@/media/watermark/types";
import {
	WatermarkRegionEditor,
	type WatermarkSelection,
} from "./watermark-region-editor";

export function WatermarkRemovalDialog({ onClose }: { onClose: () => void }) {
	const editor = useEditor();
	const projectId = useEditor((e) => e.project.getActive().metadata.id);
	const assets = useEditor((e) => e.media.getAssets());
	const tracks = useEditor((e) => e.scenes.getActiveScene().tracks);
	const selection = useEditor((e) => e.selection.getSelectedElements());
	const videoElements = [tracks.main, ...tracks.overlay].flatMap((track) =>
		track.elements.filter((element) => element.type === "video"),
	);
	const videoAssets = assets.filter(
		(asset) =>
			asset.type === "video" &&
			videoElements.some((element) => element.mediaId === asset.id),
	);
	const selectedVideo = videoElements.find((element) =>
		selection.some((ref) => ref.elementId === element.id),
	);
	const [sourceId, setSourceId] = useState(
		selectedVideo?.mediaId ?? videoAssets[0]?.id ?? "",
	);
	const source = videoAssets.find((asset) => asset.id === sourceId);
	const [regions, setRegions] = useState<WatermarkSelection[]>([]);
	const [selectedId, setSelectedId] = useState("");
	const [mode, setMode] = useState("original");
	const [isProcessing, setIsProcessing] = useState(false);
	const [isApplying, setIsApplying] = useState(false);
	const [error, setError] = useState("");
	const [result, setResult] = useState<{
		file: File;
		url: string;
		signature: string;
	} | null>(null);
	const request = useRef<AbortController | null>(null);
	const resultUrl = useRef<string | null>(null);
	const signature = JSON.stringify({ sourceId, regions });
	const resultIsCurrent = !!result && result.signature === signature;
	const showResult = mode === "processed" && resultIsCurrent;
	const busy = isProcessing || isApplying;
	const width = source?.width ?? 0;
	const height = source?.height ?? 0;
	const duration = source?.duration ?? 0;
	const selectedRegion = regions.find((region) => region.id === selectedId);

	useEffect(
		() => () => {
			request.current?.abort();
			if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
		},
		[],
	);

	const updateRegion = ({
		id,
		patch,
	}: {
		id: string;
		patch: Partial<WatermarkRegion>;
	}) => {
		setMode("original");
		setError("");
		setRegions((current) =>
			current.map((region) =>
				region.id === id ? { ...region, ...patch } : region,
			),
		);
	};

	const addRegion = () => {
		const id = crypto.randomUUID();
		setRegions((current) => [
			...current,
			{
				id,
				x: Math.round(width * 0.75),
				y: Math.max(1, Math.round(height * 0.04)),
				width: Math.max(4, Math.round(width * 0.2)),
				height: Math.max(4, Math.round(height * 0.08)),
				start: 0,
				end: duration,
			},
		]);
		setSelectedId(id);
		setMode("original");
		setError("");
	};

	const processVideo = async () => {
		if (!source) return;
		const controller = new AbortController();
		request.current = controller;
		setIsProcessing(true);
		setError("");
		try {
			const form = new FormData();
			form.append("video", source.file);
			form.append("regions", JSON.stringify(regions));
			const response = await fetch("/api/media/watermark-removals", {
				method: "POST",
				body: form,
				signal: controller.signal,
			});
			const data: WatermarkResult = await response.json();
			if (!response.ok || !data.success || !data.streamUrl)
				throw new Error(data.error || "Không thể xóa logo.");
			const video = await fetch(data.streamUrl, { signal: controller.signal });
			if (!video.ok) throw new Error("Không đọc được video đã xử lý.");
			const file = new File(
				[await video.blob()],
				`${source.file.name.replace(/\.[^.]+$/, "")}.clean.mp4`,
				{ type: "video/mp4" },
			);
			if (controller.signal.aborted) return;
			if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
			const url = URL.createObjectURL(file);
			resultUrl.current = url;
			setResult({ file, url, signature });
			setMode("processed");
		} catch (error: unknown) {
			if (!controller.signal.aborted)
				setError(
					error instanceof Error ? error.message : "Không thể xóa logo.",
				);
		} finally {
			if (request.current === controller) setIsProcessing(false);
		}
	};

	const applyResult = async () => {
		if (!result || !resultIsCurrent || !source) return;
		setIsApplying(true);
		setError("");
		try {
			const [processed] = await processMediaAssets({ files: [result.file] });
			if (!processed?.duration || !processed.width || !processed.height)
				throw new Error("Không đọc được video đã xử lý.");
			if (editor.project.getActiveOrNull()?.metadata.id !== projectId) return;
			const current = editor.scenes.getActiveScene().tracks;
			const refs = [current.main, ...current.overlay, ...current.audio].flatMap(
				(track) =>
					track.elements
						.filter(
							(element) =>
								(element.type === "video" ||
									(element.type === "audio" &&
										element.sourceType === "upload")) &&
								element.mediaId === source.id,
						)
						.map((element) => ({ trackId: track.id, elementId: element.id })),
			);
			if (!refs.length) throw new Error("Video nguồn không còn trên timeline.");
			const asset = await editor.media.addMediaAsset({
				projectId,
				asset: processed,
			});
			if (!asset) throw new Error("Không đủ bộ nhớ để lưu video đã xử lý.");
			editor.timeline.updateElements({
				updates: refs.map((ref) => ({ ...ref, patch: { mediaId: asset.id } })),
			});
			videoCache.clearVideo({ mediaId: source.id });
			await editor.project.saveCurrentProject();
			toast.success("Đã áp dụng video đã xóa logo.");
			onClose();
		} catch (error: unknown) {
			setError(
				error instanceof Error ? error.message : "Không áp dụng được video.",
			);
		} finally {
			setIsApplying(false);
		}
	};

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !isApplying) onClose();
			}}
		>
			<DialogContent
				className="max-h-[90vh] overflow-y-auto gap-0 sm:max-w-5xl"
				aria-describedby={undefined}
			>
				<DialogHeader className="px-5 py-4">
					<DialogTitle className="text-base tracking-normal">
						Xóa logo
					</DialogTitle>
				</DialogHeader>
				<div className="grid min-w-0 gap-5 p-5 md:grid-cols-[minmax(0,1fr)_280px]">
					<div className="flex min-w-0 flex-col gap-3">
						<Tabs
							value={showResult ? "processed" : "original"}
							onValueChange={setMode}
						>
							<TabsList aria-label="So sánh video">
								<TabsTrigger value="original">Gốc</TabsTrigger>
								<TabsTrigger value="processed" disabled={!resultIsCurrent}>
									Đã xử lý
								</TabsTrigger>
							</TabsList>
						</Tabs>
						{source?.url && width > 0 && height > 0 && duration > 0 ? (
							<WatermarkRegionEditor
								source={showResult && result ? result.url : source.url}
								width={width}
								height={height}
								duration={duration}
								regions={regions}
								selectedId={selectedId}
								disabled={busy}
								showResult={showResult}
								onSelect={setSelectedId}
								onChange={updateRegion}
							/>
						) : (
							<p className="text-sm text-muted-foreground">
								Không đọc được video nguồn.
							</p>
						)}
					</div>
					<div className="flex min-w-0 flex-col gap-4">
						<div className="space-y-2">
							<Label htmlFor="watermark-source">Video nguồn</Label>
							<Select
								value={sourceId}
								disabled={busy}
								onValueChange={(value) => {
									setSourceId(value);
									setRegions([]);
									setSelectedId("");
									setMode("original");
									setError("");
								}}
							>
								<SelectTrigger
									id="watermark-source"
									className="w-full [&>div]:min-w-0 [&>div]:flex-1 [&_span]:truncate"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent className="z-[300] max-w-[calc(100vw-2rem)]">
									{videoAssets.map((asset) => (
										<SelectItem key={asset.id} value={asset.id}>
											{asset.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-xs text-muted-foreground tabular-nums">
								{width} × {height} · {duration.toFixed(1)} s
							</p>
						</div>
						<div className="space-y-2 border-t pt-4">
							<Label htmlFor="watermark-region">Vùng logo</Label>
							<div className="flex items-center gap-2">
								<Select
									value={selectedId}
									disabled={busy || !regions.length}
									onValueChange={(id) => {
										setSelectedId(id);
										setMode("original");
									}}
								>
									<SelectTrigger
										id="watermark-region"
										className="min-w-0 flex-1"
									>
										<SelectValue placeholder="Chưa chọn vùng" />
									</SelectTrigger>
									<SelectContent className="z-[300]">
										{regions.map((region, index) => (
											<SelectItem key={region.id} value={region.id}>
												Vùng {index + 1}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Button
									size="icon"
									variant="outline"
									aria-label="Thêm vùng logo"
									title="Thêm vùng logo"
									disabled={busy || !width || !height}
									onClick={addRegion}
								>
									<Plus />
								</Button>
								<Button
									size="icon"
									variant="ghost"
									aria-label="Xóa vùng chọn"
									title="Xóa vùng chọn"
									disabled={busy || !selectedRegion}
									onClick={() => {
										const next = regions.filter(
											(region) => region.id !== selectedId,
										);
										setRegions(next);
										setSelectedId(next[0]?.id ?? "");
										setMode("original");
									}}
								>
									<Trash2 />
								</Button>
							</div>
						</div>
						{selectedRegion && (
							<>
								<div className="grid grid-cols-2 gap-3">
									{(
										[
											{ key: "x", label: "X (px)", min: 1 },
											{ key: "y", label: "Y (px)", min: 1 },
											{ key: "width", label: "Rộng (px)", min: 4 },
											{ key: "height", label: "Cao (px)", min: 4 },
										] as const
									).map((field) => (
										<div key={field.key} className="space-y-1">
											<Label
												htmlFor={`watermark-${field.key}`}
												className="text-xs"
											>
												{field.label}
											</Label>
											<Input
												id={`watermark-${field.key}`}
												type="number"
												step={1}
												min={field.min}
												value={selectedRegion[field.key]}
												disabled={busy}
												onChange={(event) =>
													updateRegion({
														id: selectedId,
														patch: { [field.key]: Number(event.target.value) },
													})
												}
											/>
										</div>
									))}
								</div>
								<div className="space-y-2 border-t pt-4">
									<Label>Thời gian video nguồn</Label>
									<div className="grid grid-cols-2 gap-3">
										{(
											[
												{ key: "start", label: "Từ (s)" },
												{ key: "end", label: "Đến (s)" },
											] as const
										).map((field) => (
											<div key={field.key} className="space-y-1">
												<Label
													htmlFor={`watermark-${field.key}`}
													className="text-xs"
												>
													{field.label}
												</Label>
												<Input
													id={`watermark-${field.key}`}
													type="number"
													min={0}
													max={duration}
													step={0.1}
													value={selectedRegion[field.key]}
													disabled={busy}
													onChange={(event) =>
														updateRegion({
															id: selectedId,
															patch: {
																[field.key]: Number(event.target.value),
															},
														})
													}
												/>
											</div>
										))}
									</div>
								</div>
							</>
						)}
						{error && (
							<p role="alert" className="break-words text-xs text-destructive">
								{error}
							</p>
						)}
						{isProcessing && (
							<p
								role="status"
								className="flex items-center gap-2 text-xs text-muted-foreground"
							>
								<Loader2 className="size-4 animate-spin" />
								Đang tái tạo vùng nền…
							</p>
						)}
					</div>
				</div>
				<DialogFooter className="px-5 py-4">
					<Button variant="outline" disabled={isApplying} onClick={onClose}>
						Đóng
					</Button>
					<Button
						variant="outline"
						disabled={busy || !regions.length || !source}
						onClick={() => void processVideo()}
					>
						{isProcessing ? <Loader2 className="animate-spin" /> : <Eraser />}Xử
						lý video
					</Button>
					<Button
						disabled={busy || !resultIsCurrent}
						onClick={() => void applyResult()}
					>
						{isApplying ? <Loader2 className="animate-spin" /> : <Check />}Áp
						dụng vào timeline
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
