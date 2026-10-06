"use client";

import { useState } from "react";
import { SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { insertCaptionChunksAsTextTrack } from "@/subtitles/insert";
import type { SubtitleCue } from "@/subtitles/types";
import { ExportButton } from "@/components/editor/export-button";
import { processMediaAssets } from "@/media/processing";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { mediaTimeFromSeconds } from "@/wasm";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocalStorage } from "@/services/storage/use-local-storage";

interface Props {
	projectId: string;
}

interface PreviewCue {
	id: string;
	start: number;
	end: number;
	text: string;
}

export function VietnameseAiPanel({ projectId }: Props) {
	const editor = useEditor();
	const canvasSize = useEditor(
		(e) => e.project.getActive().settings.canvasSize,
	);
	const [voice, setVoice] = useState("vi-VN-HoaiMyNeural");
	const [originalVolume, setOriginalVolume] = useState([20]); // 20%
	const [voiceoverVolume, setVoiceoverVolume] = useState([100]); // 100%
	const [subtitleStyle, setSubtitleStyle] = useState("bold");
	const [subtitleBackground, setSubtitleBackground] = useLocalStorage({
		key: `subtitle-background-${projectId}`,
		defaultValue: {
			enabled: false,
			color: "#000000",
			opacity: 75,
			blur: 12,
			cornerRadius: 20,
			paddingX: 120,
			paddingY: 80,
		},
	});

	// Helper to calculate RGBA string from hex color and opacity percentage
	const getEffectiveBgColor = (hex: string, opacity: number = 75) => {
		const alpha = Math.max(0, Math.min(100, opacity)) / 100;
		const cleanHex = hex.replace("#", "");
		let r = 0, g = 0, b = 0;
		if (cleanHex.length === 6) {
			r = parseInt(cleanHex.substring(0, 2), 16) || 0;
			g = parseInt(cleanHex.substring(2, 4), 16) || 0;
			b = parseInt(cleanHex.substring(4, 6), 16) || 0;
		}
		return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
	};

	// Subtitle Preview & Edit states
	const [previewCues, setPreviewCues] = useState<PreviewCue[]>([]);
	const [isPreviewing, setIsPreviewing] = useState(false);
	const [hasPreviewed, setHasPreviewed] = useState(false);

	const updateSubtitleBackground = (
		patch: Partial<typeof subtitleBackground>,
	) => {
		const background = { ...subtitleBackground, ...patch };
		setSubtitleBackground({ value: background });
		const tracks = editor.scenes.getActiveScene().tracks.overlay;
		const effectiveColor = getEffectiveBgColor(
			background.color,
			background.opacity ?? 75,
		);
		editor.timeline.updateElements({
			updates: tracks.flatMap((track) =>
				track.type === "text"
					? track.elements
							.filter((element) => /^Caption \d+$/.test(element.name))
							.map((element) => ({
								trackId: track.id,
								elementId: element.id,
								patch: {
									params: {
										...element.params,
										"background.enabled": background.enabled,
										"background.color": effectiveColor,
										"background.paddingX": background.paddingX,
										"background.paddingY": background.paddingY,
										"background.cornerRadius": background.cornerRadius ?? 20,
										"background.blur": background.blur ?? 12,
									},
								},
							}))
					: [],
			),
		});
	};
	const [isProcessing, setIsProcessing] = useState(false);
	const [progressStep, setProgressStep] = useState<string | null>(null);

	const applyVolume = (kind: "original" | "voice", value: number) => {
		const scene = editor.scenes.getActiveScene();
		const tracks = [
			scene.tracks.main,
			...scene.tracks.overlay,
			...scene.tracks.audio,
		];
		editor.timeline.updateElements({
			updates: tracks.flatMap((track) =>
				track.elements
					.filter((element) =>
						kind === "original"
							? element.type === "audio" && element.name.startsWith("ai-background")
							: element.type === "audio" && element.name.startsWith("voice-"),
					)
					.map((element) => ({
						trackId: track.id,
						elementId: element.id,
						patch: { params: { ...element.params, volume: value / 100 } },
					})),
			),
		});
	};

	const handlePreview = async () => {
		const importedDataStr = sessionStorage.getItem(
			`imported_video_${projectId}`,
		);
		let videoPath = "";
		if (importedDataStr) {
			const data = JSON.parse(importedDataStr);
			videoPath = data.localMediaPath;
		}

		setIsPreviewing(true);
		setProgressStep("Đang nhận diện lời thoại & tạo kịch bản phụ đề 1-2 dòng...");
		const toastId = toast.loading("Đang trích xuất & tạo phụ đề xem trước...");

		try {
			const res = await fetch("/api/localization/preview", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					projectId,
					videoPath: videoPath || "default",
				}),
			});

			const data = await res.json();
			if (!data.success) {
				throw new Error(data.error || "Không thể tạo bản xem trước phụ đề");
			}

			const cues: PreviewCue[] = (data.subtitles || []).map((s: any) => ({
				id: s.id,
				start: s.start,
				end: s.end,
				text: s.text,
			}));

			setPreviewCues(cues);
			setHasPreviewed(true);
			toast.success(`Đã tạo ${cues.length} câu phụ đề xem trước!`, { id: toastId });
			setProgressStep(`Sẵn sàng xem trước: ${cues.length} câu phụ đề (1-2 dòng). Bạn có thể chỉnh sửa trước khi tạo giọng.`);
		} catch (err: any) {
			toast.error(err.message || "Lỗi khi xem trước phụ đề", { id: toastId });
			setProgressStep(null);
		} finally {
			setIsPreviewing(false);
		}
	};

	const updateCueText = (index: number, newText: string) => {
		setPreviewCues((prev) => {
			const next = [...prev];
			next[index] = { ...next[index], text: newText };
			return next;
		});
	};

	const removeCue = (index: number) => {
		setPreviewCues((prev) => prev.filter((_, i) => i !== index));
	};

	const addCue = () => {
		setPreviewCues((prev) => {
			const last = prev[prev.length - 1];
			const start = last ? Number((last.end + 0.2).toFixed(2)) : 0.5;
			const end = Number((start + 2.5).toFixed(2));
			return [
				...prev,
				{
					id: `sub-custom-${Date.now()}`,
					start,
					end,
					text: "Nội dung phụ đề mới",
				},
			];
		});
	};

	const handleLocalize = async () => {
		// Retrieve imported video info
		const importedDataStr = sessionStorage.getItem(
			`imported_video_${projectId}`,
		);
		let videoPath = "";
		if (importedDataStr) {
			const data = JSON.parse(importedDataStr);
			videoPath = data.localMediaPath;
		}

		setIsProcessing(true);
		setProgressStep("Đang tạo giọng đọc thuyết minh & gắn phụ đề lên timeline...");
		const toastId = toast.loading("Đang xử lý Việt hóa video...");

		try {
			const res = await fetch("/api/localization/process", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					projectId,
					videoPath: videoPath || "default",
					voice,
					subtitles: hasPreviewed && previewCues.length > 0 ? previewCues : undefined,
				}),
			});

			const data = await res.json();
			if (!data.success) {
				throw new Error(data.error || "Quá trình Việt hóa thất bại");
			}

			const localized = data.localizedProject;
			if (!localized.backgroundAudioUrl) throw new Error("Chưa tách được giọng gốc. Vui lòng thử lại trước khi gắn lồng tiếng.");

			// Update preview cues from result if not already previewed
			if (!hasPreviewed && localized.subtitles) {
				setPreviewCues(localized.subtitles);
				setHasPreviewed(true);
			}

			// Prepare audio assets before adding to timeline
			const prepared = [];
			const segments = [
				...(localized.backgroundAudioUrl
					? [{ id: "ai-background", start: 0, audioUrl: localized.backgroundAudioUrl, duration: localized.source.duration }]
					: []),
				...(localized.voiceovers ?? []),
			];

			for (const segment of segments) {
				const audio = await fetch(segment.audioUrl);
				if (!audio.ok) throw new Error("Không thể nạp giọng đọc đã tạo.");
				const file = new File([await audio.blob()], `${segment.id}.wav`, {
					type: "audio/wav",
				});
				const [processed] = await processMediaAssets({ files: [file] });
				if (!processed?.duration)
					throw new Error("Không thể đọc file giọng đọc.");
				const asset = await editor.media.addMediaAsset({
					projectId,
					asset: processed,
				});
				if (!asset) throw new Error("Không thể lưu giọng đọc vào dự án.");
				const element = buildElementFromMedia({
					mediaId: asset.id,
					mediaType: "audio",
					name: file.name,
					duration: mediaTimeFromSeconds({ seconds: Math.min(processed.duration, segment.duration) }),
					startTime: mediaTimeFromSeconds({ seconds: segment.start }),
				});
				element.params.volume = (segment.id === "ai-background" ? originalVolume[0] : voiceoverVolume[0]) / 100;
				prepared.push(element);
			}

			const scene = editor.scenes.getActiveScene();
			const previousCaptionTrack = localStorage.getItem(`ai-caption-track-${projectId}`);
			const previousResult = sessionStorage.getItem(`localized_${projectId}`);
			const previousTexts = new Set<string>(previousResult
				? (JSON.parse(previousResult).subtitles ?? []).map((sub: { text: string }) => sub.text.replace(/\s+/g, " ").trim())
				: []);
			const legacyCaptionTracks = new Set(scene.tracks.overlay.filter((track) =>
				!previousCaptionTrack && track.type === "text" && track.elements.length > 0 &&
				track.elements.every((element) => /^Caption \d+$/.test(element.name) &&
					previousTexts.has(String(element.params.content).replace(/\s+/g, " ").trim()))
			).map((track) => track.id));

			// Clean up previous AI audio and captions
			editor.timeline.deleteElements({
				elements: [...scene.tracks.audio, ...scene.tracks.overlay].flatMap((track) =>
					track.elements.filter((element) =>
						(element.type === "audio" && (element.name.startsWith("voice-") || element.name.startsWith("ai-background"))) ||
						((track.id === previousCaptionTrack || legacyCaptionTracks.has(track.id)) && element.type === "text")
					).map((element) => ({ trackId: track.id, elementId: element.id })),
				),
			});

			// If background audio is separated, mute original video track; otherwise duck it to originalVolume
			if (localized.backgroundAudioUrl) {
				editor.timeline.updateElements({
					updates: [scene.tracks.main, ...scene.tracks.overlay].flatMap((track) =>
						track.elements.filter((element) => element.type === "video").map((element) => ({
							trackId: track.id, elementId: element.id,
							patch: { params: { ...element.params, volume: 0 } },
						})),
					),
				});
			} else {
				applyVolume("original", originalVolume[0]);
			}

			for (const element of prepared) {
				editor.timeline.insertElement({
					element,
					placement: { mode: "auto", trackType: "audio" },
				});
			}

			toast.success("Việt hóa thành công! Đang gắn vào timeline...", {
				id: toastId,
			});

			// Convert subtitles into OpenCut cues and insert on timeline
			if (localized.subtitles && localized.subtitles.length > 0) {
				const cues: SubtitleCue[] = localized.subtitles.map((sub: any) => ({
					text: sub.text,
					startTime: sub.start,
					duration: Math.max(0.6, sub.end - sub.start),
					style: {
						fontWeight: subtitleStyle === "bold" ? "bold" : "normal",
						color: "#FFFFFF",
						background: {
							enabled: subtitleBackground.enabled,
							color: getEffectiveBgColor(
								subtitleBackground.color,
								subtitleBackground.opacity ?? 75,
							),
							paddingX: subtitleBackground.paddingX,
							paddingY: subtitleBackground.paddingY,
							cornerRadius: subtitleBackground.cornerRadius ?? 20,
							blur: subtitleBackground.blur ?? 12,
						},
					},
				}));
				const captionTrack = insertCaptionChunksAsTextTrack({ editor, captions: cues });
				if (captionTrack) localStorage.setItem(`ai-caption-track-${projectId}`, captionTrack);
			}

			// Save localized result for export
			sessionStorage.setItem(
				`localized_${projectId}`,
				JSON.stringify(localized),
			);
			await editor.project.saveCurrentProject();

			setProgressStep(
				"Hoàn tất! Phụ đề & giọng đọc đã sẵn sàng trên timeline.",
			);
		} catch (err: any) {
			toast.error(err.message || "Lỗi khi xử lý Việt hóa", { id: toastId });
			setProgressStep(null);
		} finally {
			setIsProcessing(false);
		}
	};

	return (
		<div className="flex flex-col h-full bg-neutral-900 border-l border-neutral-800 text-neutral-100 p-4 gap-5 overflow-y-auto">
			<div className="flex items-center justify-between border-b border-neutral-800 pb-3">
				<div className="flex items-center gap-2">
					<div className="size-7 rounded bg-rose-500/20 text-rose-400 flex items-center justify-center">
						<HugeiconsIcon icon={SparklesIcon} className="size-4" />
					</div>
					<h3 className="font-semibold text-sm">Vietnamese AI</h3>
				</div>
				<span className="text-[11px] font-mono bg-rose-950 text-rose-300 px-2 py-0.5 rounded border border-rose-800/40">
					{canvasSize.width} × {canvasSize.height}
				</span>
			</div>

			{/* Controls Form */}
			<div className="flex flex-col gap-4">
				{/* Voice selector */}
				<div className="flex flex-col gap-1.5">
					<Label className="text-xs text-neutral-400">
						Giọng đọc thuyết minh
					</Label>
					<Select value={voice} onValueChange={setVoice}>
						<SelectTrigger className="bg-neutral-950 border-neutral-800 text-xs">
							<SelectValue placeholder="Chọn giọng" />
						</SelectTrigger>
						<SelectContent className="bg-neutral-900 border-neutral-800 text-xs">
							<SelectItem value="vi-VN-HoaiMyNeural">
								Hoài My (Nữ - Truyền cảm)
							</SelectItem>
							<SelectItem value="vi-VN-NamMinhNeural">
								Nam Minh (Nam - Trầm ấm)
							</SelectItem>
						</SelectContent>
					</Select>
				</div>

				{/* Original Volume */}
				<div className="flex flex-col gap-1.5">
					<div className="flex justify-between text-xs">
						<span className="text-neutral-400">Âm thanh gốc</span>
						<span className="text-neutral-300 font-mono">
							{originalVolume[0]}%
						</span>
					</div>
					<Slider
						disabled={isProcessing}
						value={originalVolume}
						onValueChange={(value) => {
							setOriginalVolume(value);
							applyVolume("original", value[0]);
						}}
						min={0}
						max={100}
						step={5}
						className="py-1"
					/>
				</div>

				{/* Voiceover Volume */}
				<div className="flex flex-col gap-1.5">
					<div className="flex justify-between text-xs">
						<span className="text-neutral-400">Âm lượng giọng đọc</span>
						<span className="text-neutral-300 font-mono">
							{voiceoverVolume[0]}%
						</span>
					</div>
					<Slider
						disabled={isProcessing}
						value={voiceoverVolume}
						onValueChange={(value) => {
							setVoiceoverVolume(value);
							applyVolume("voice", value[0]);
						}}
						min={0}
						max={150}
						step={5}
						className="py-1"
					/>
				</div>

				{/* Subtitle Style */}
				<div className="flex flex-col gap-1.5">
					<Label className="text-xs text-neutral-400">Phong cách phụ đề</Label>
					<Select value={subtitleStyle} onValueChange={setSubtitleStyle}>
						<SelectTrigger className="bg-neutral-950 border-neutral-800 text-xs">
							<SelectValue placeholder="Kiểu phụ đề" />
						</SelectTrigger>
						<SelectContent className="bg-neutral-900 border-neutral-800 text-xs">
							<SelectItem value="bold">In đậm (Bold TikTok)</SelectItem>
							<SelectItem value="minimal">Tối giản (Minimal)</SelectItem>
						</SelectContent>
					</Select>
					<div className="mt-2 flex items-center gap-2">
						<Checkbox
							id="subtitle-background"
							checked={subtitleBackground.enabled}
							disabled={isProcessing}
							onCheckedChange={(checked) =>
								updateSubtitleBackground({ enabled: checked === true })
							}
						/>
						<Label
							htmlFor="subtitle-background"
							className="cursor-pointer text-xs"
						>
							Bật nền phụ đề (Hỗ trợ làm mờ & trong suốt)
						</Label>
					</div>
					{subtitleBackground.enabled && (
						<div className="flex flex-col gap-3 rounded border border-neutral-700 p-3">
							<div className="flex items-center justify-between">
								<Label htmlFor="subtitle-background-color" className="text-xs">
									Màu nền phụ đề
								</Label>
								<input
									id="subtitle-background-color"
									type="color"
									value={subtitleBackground.color}
									disabled={isProcessing}
									onChange={(event) =>
										updateSubtitleBackground({ color: event.target.value })
									}
									className="h-7 w-10 cursor-pointer rounded border border-neutral-700 bg-transparent"
								/>
							</div>

							{/* Opacity / Trong suốt */}
							<div className="flex flex-col gap-1">
								<div className="flex justify-between text-xs">
									<Label htmlFor="subtitle-opacity" className="text-xs">
										Độ mờ trong suốt (Opacity)
									</Label>
									<span className="font-mono text-neutral-400">
										{subtitleBackground.opacity ?? 75}%
									</span>
								</div>
								<input
									type="range"
									className="w-full accent-rose-500"
									id="subtitle-opacity"
									aria-label="Độ mờ trong suốt"
									min={10}
									max={100}
									step={5}
									disabled={isProcessing}
									value={subtitleBackground.opacity ?? 75}
									onChange={(event) =>
										updateSubtitleBackground({
											opacity: Number(event.target.value),
										})
									}
								/>
							</div>

							{/* Blur / Nhòe mờ */}
							<div className="flex flex-col gap-1">
								<div className="flex justify-between text-xs">
									<Label htmlFor="subtitle-blur" className="text-xs">
										Độ nhòe mờ viền (Blur)
									</Label>
									<span className="font-mono text-neutral-400">
										{subtitleBackground.blur ?? 12}px
									</span>
								</div>
								<input
									type="range"
									className="w-full accent-rose-500"
									id="subtitle-blur"
									aria-label="Độ nhòe mờ viền"
									min={0}
									max={40}
									step={2}
									disabled={isProcessing}
									value={subtitleBackground.blur ?? 12}
									onChange={(event) =>
										updateSubtitleBackground({
											blur: Number(event.target.value),
										})
									}
								/>
							</div>

							{/* Corner Radius */}
							<div className="flex flex-col gap-1">
								<div className="flex justify-between text-xs">
									<Label htmlFor="subtitle-corner-radius" className="text-xs">
										Bo tròn góc
									</Label>
									<span className="font-mono text-neutral-400">
										{subtitleBackground.cornerRadius ?? 20}%
									</span>
								</div>
								<input
									type="range"
									className="w-full accent-rose-500"
									id="subtitle-corner-radius"
									aria-label="Bo tròn góc"
									min={0}
									max={50}
									step={2}
									disabled={isProcessing}
									value={subtitleBackground.cornerRadius ?? 20}
									onChange={(event) =>
										updateSubtitleBackground({
											cornerRadius: Number(event.target.value),
										})
									}
								/>
							</div>

							{/* Padding X */}
							<div className="flex flex-col gap-1">
								<div className="flex justify-between text-xs">
									<Label htmlFor="subtitle-padding-x" className="text-xs">
										Mở rộng nền ngang
									</Label>
									<span className="font-mono text-neutral-400">
										{subtitleBackground.paddingX}
									</span>
								</div>
								<input
									type="range"
									className="w-full accent-rose-500"
									id="subtitle-padding-x"
									aria-label="Mở rộng nền ngang"
									min={0}
									max={600}
									step={10}
									disabled={isProcessing}
									value={subtitleBackground.paddingX}
									onChange={(event) =>
										updateSubtitleBackground({
											paddingX: Number(event.target.value),
										})
									}
								/>
							</div>

							{/* Padding Y */}
							<div className="flex flex-col gap-1">
								<div className="flex justify-between text-xs">
									<Label htmlFor="subtitle-padding-y" className="text-xs">
										Mở rộng nền dọc
									</Label>
									<span className="font-mono text-neutral-400">
										{subtitleBackground.paddingY}
									</span>
								</div>
								<input
									type="range"
									className="w-full accent-rose-500"
									id="subtitle-padding-y"
									aria-label="Mở rộng nền dọc"
									min={0}
									max={300}
									step={10}
									disabled={isProcessing}
									value={subtitleBackground.paddingY}
									onChange={(event) =>
										updateSubtitleBackground({
											paddingY: Number(event.target.value),
										})
									}
								/>
							</div>

							<p className="text-[11px] text-neutral-400 leading-relaxed">
								Tùy chỉnh độ mờ trong suốt (Opacity) và độ nhòe (Blur) giúp phụ đề
								nổi bật, mềm mại và hòa quyện với video mà không che khuất cảnh
								quay. Thay đổi áp dụng ngay cho các caption trên timeline.
							</p>
						</div>
					)}
				</div>
			</div>

			{/* Subtitle Preview Section */}
			<div className="flex flex-col gap-2.5 rounded-lg border border-neutral-800 bg-neutral-950/70 p-3">
				{!hasPreviewed ? (
					<div className="flex flex-col gap-2">
						<div className="flex items-center justify-between">
							<span className="text-xs font-semibold text-neutral-200">
								Xem trước phụ đề
							</span>
							<span className="text-[10px] bg-rose-500/15 text-rose-300 px-1.5 py-0.5 rounded border border-rose-500/20 font-mono">
								1-2 dòng/câu
							</span>
						</div>
						<p className="text-[11px] text-neutral-400 leading-relaxed">
							Tự động tách câu thành các đoạn ngắn 1-2 dòng chuẩn TikTok / Reels. Bạn có thể xem trước và chỉnh sửa lời thoại trước khi AI thu âm.
						</p>
						<Button
							type="button"
							variant="outline"
							disabled={isProcessing || isPreviewing}
							onClick={handlePreview}
							className="mt-1 w-full border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 text-xs py-2 h-8"
						>
							{isPreviewing ? "Đang phân tích kịch bản..." : "📝 Xem trước kịch bản phụ đề"}
						</Button>
					</div>
				) : (
					<div className="flex flex-col gap-2.5">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<span className="text-xs font-semibold text-neutral-200">
									Kịch bản ({previewCues.length} câu)
								</span>
								<span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800/40 px-1.5 py-0.5 rounded">
									Tối đa 1-2 dòng
								</span>
							</div>
							<button
								type="button"
								disabled={isProcessing || isPreviewing}
								onClick={handlePreview}
								className="text-[11px] text-rose-400 hover:text-rose-300 hover:underline"
							>
								{isPreviewing ? "Đang tải..." : "Làm mới"}
							</button>
						</div>

						<div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
							{previewCues.map((cue, index) => {
								const lineCount = cue.text.split("\n").length;
								return (
									<div
										key={cue.id || index}
										className="flex flex-col gap-1 rounded border border-neutral-800 bg-neutral-900/90 p-2 text-xs"
									>
										<div className="flex items-center justify-between text-[10px] text-neutral-400">
											<span className="font-mono bg-neutral-800 px-1.5 py-0.5 rounded">
												{cue.start.toFixed(1)}s ➔ {cue.end.toFixed(1)}s
											</span>
											<div className="flex items-center gap-1.5">
												<span
													className={`px-1.5 py-0.5 rounded font-mono ${
														lineCount <= 2
															? "bg-emerald-950 text-emerald-400 border border-emerald-800/40"
															: "bg-amber-950 text-amber-400 border border-amber-800/40"
													}`}
												>
													{lineCount} dòng
												</span>
												<button
													type="button"
													onClick={() => removeCue(index)}
													className="text-neutral-500 hover:text-rose-400 ml-1 text-xs"
													title="Xóa câu này"
												>
													✕
												</button>
											</div>
										</div>
										<textarea
											value={cue.text}
											rows={Math.min(3, Math.max(2, lineCount))}
											onChange={(e) => updateCueText(index, e.target.value)}
											className="w-full resize-none rounded bg-neutral-950 border border-neutral-800 p-1.5 text-xs text-neutral-100 focus:outline-none focus:border-rose-500"
											placeholder="Nội dung phụ đề..."
										/>
									</div>
								);
							})}
						</div>

						<div className="flex items-center justify-between pt-1">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={addCue}
								className="text-xs text-neutral-400 hover:text-neutral-200 h-7 px-2"
							>
								+ Thêm câu phụ đề
							</Button>
							<span className="text-[10px] text-neutral-500">
								Chuẩn 1-2 dòng TikTok
							</span>
						</div>
					</div>
				)}
			</div>

			{/* Primary Action Button */}
			<Button
				disabled={isProcessing || isPreviewing}
				onClick={handleLocalize}
				className="w-full bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white font-medium text-xs py-5 shadow-lg shadow-rose-900/20"
			>
				<HugeiconsIcon icon={SparklesIcon} className="size-4 mr-2" />
				{isProcessing
					? "Đang xử lý..."
					: hasPreviewed
						? "✨ Bắt đầu Việt hóa & Gắn timeline"
						: "✨ Việt hóa video"}
			</Button>

			{/* Status or Progress */}
			{progressStep && (
				<div className="p-3 bg-neutral-950/80 rounded-lg border border-neutral-800 text-xs text-neutral-300 flex flex-col gap-1.5">
					<span className="font-semibold text-rose-400">Trạng thái:</span>
					<p className="text-[11px] text-neutral-400 leading-relaxed">
						{progressStep}
					</p>
				</div>
			)}

			<div className="mt-auto pt-4 border-t border-neutral-800 flex items-center justify-between gap-2">
				<span className="text-xs text-neutral-400">Export video</span>
				<ExportButton />
			</div>
		</div>
	);
}
