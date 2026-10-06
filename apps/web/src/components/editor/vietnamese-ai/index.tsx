"use client";

import { useState } from "react";
import { SparklesIcon, VolumeHighIcon, SubtitleIcon, Download01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { insertCaptionChunksAsTextTrack } from "@/subtitles/insert";
import type { SubtitleCue } from "@/subtitles/types";
import { AddTrackCommand, BatchCommand, InsertElementCommand } from "@/commands";
import { secondsToMediaTime } from "opencut-wasm";

interface Props {
	projectId: string;
}

export function VietnameseAiPanel({ projectId }: Props) {
	const editor = useEditor();
	const [voice, setVoice] = useState("vi-VN-HoaiMyNeural");
	const [originalVolume, setOriginalVolume] = useState([20]); // 20%
	const [voiceoverVolume, setVoiceoverVolume] = useState([100]); // 100%
	const [subtitleStyle, setSubtitleStyle] = useState("bold");
	const [isProcessing, setIsProcessing] = useState(false);
	const [progressStep, setProgressStep] = useState<string | null>(null);
	const [isExporting, setIsExporting] = useState(false);
	const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

	const handleLocalize = async () => {
		// Retrieve imported video info
		const importedDataStr = sessionStorage.getItem(`imported_video_${projectId}`);
		let videoPath = "";
		if (importedDataStr) {
			const data = JSON.parse(importedDataStr);
			videoPath = data.localMediaPath;
		}

		setIsProcessing(true);
		setProgressStep("Đang khởi tạo pipeline Việt hóa...");
		const toastId = toast.loading("Đang xử lý Việt hóa video...");

		try {
			const res = await fetch("/api/localization/process", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					projectId,
					videoPath: videoPath || "default",
					voice,
				}),
			});

			const data = await res.json();
			if (!data.success) {
				throw new Error(data.error || "Quá trình Việt hóa thất bại");
			}

			const localized = data.localizedProject;
			toast.success("Việt hóa thành công! Đang gắn vào timeline...", { id: toastId });

			// Convert subtitles into OpenCut cues and insert on timeline
			if (localized.subtitles && localized.subtitles.length > 0) {
				const cues: SubtitleCue[] = localized.subtitles.map((sub: any) => ({
					text: sub.text,
					startTime: sub.start,
					duration: sub.end - sub.start,
					style: {
						fontWeight: "bold",
						color: "#FFFFFF",
					},
				}));
				insertCaptionChunksAsTextTrack({ editor, captions: cues });
			}

			// Save localized result for export
			sessionStorage.setItem(`localized_${projectId}`, JSON.stringify(localized));

			setProgressStep("Hoàn tất! Phụ đề & giọng đọc đã sẵn sàng trên timeline.");
		} catch (err: any) {
			toast.error(err.message || "Lỗi khi xử lý Việt hóa", { id: toastId });
			setProgressStep(null);
		} finally {
			setIsProcessing(false);
		}
	};

	const handleExport = async () => {
		const importedDataStr = sessionStorage.getItem(`imported_video_${projectId}`);
		const localizedStr = sessionStorage.getItem(`localized_${projectId}`);

		let videoPath = "";
		let subtitles: any[] = [];

		if (importedDataStr) {
			videoPath = JSON.parse(importedDataStr).localMediaPath;
		}
		if (localizedStr) {
			subtitles = JSON.parse(localizedStr).subtitles || [];
		}

		setIsExporting(true);
		const toastId = toast.loading("Đang kết xuất video dọc 9:16 (1080x1920)...");

		try {
			const res = await fetch("/api/export", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					projectId,
					videoPath: videoPath || "default",
					subtitles,
					originalAudioVolume: originalVolume[0] / 100,
					voiceoverVolume: voiceoverVolume[0] / 100,
				}),
			});

			const data = await res.json();
			if (!data.success) {
				throw new Error(data.error || "Xuất video thất bại");
			}

			toast.success("Xuất video thành công!", { id: toastId });
			setDownloadUrl(data.downloadUrl);

			// Trigger auto download
			const a = document.createElement("a");
			a.href = data.downloadUrl;
			a.download = `${projectId}_tiktok_vertical.mp4`;
			a.click();
		} catch (err: any) {
			toast.error(err.message || "Lỗi khi xuất video", { id: toastId });
		} finally {
			setIsExporting(false);
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
					9:16 Vertical
				</span>
			</div>

			{/* Controls Form */}
			<div className="flex flex-col gap-4">
				{/* Voice selector */}
				<div className="flex flex-col gap-1.5">
					<Label className="text-xs text-neutral-400">Giọng đọc thuyết minh</Label>
					<Select value={voice} onValueChange={setVoice}>
						<SelectTrigger className="bg-neutral-950 border-neutral-800 text-xs">
							<SelectValue placeholder="Chọn giọng" />
						</SelectTrigger>
						<SelectContent className="bg-neutral-900 border-neutral-800 text-xs">
							<SelectItem value="vi-VN-HoaiMyNeural">Hoài My (Nữ - Truyền cảm)</SelectItem>
							<SelectItem value="vi-VN-NamMinhNeural">Nam Minh (Nam - Trầm ấm)</SelectItem>
						</SelectContent>
					</Select>
				</div>

				{/* Original Volume */}
				<div className="flex flex-col gap-1.5">
					<div className="flex justify-between text-xs">
						<span className="text-neutral-400">Âm thanh gốc</span>
						<span className="text-neutral-300 font-mono">{originalVolume[0]}%</span>
					</div>
					<Slider
						value={originalVolume}
						onValueChange={setOriginalVolume}
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
						<span className="text-neutral-300 font-mono">{voiceoverVolume[0]}%</span>
					</div>
					<Slider
						value={voiceoverVolume}
						onValueChange={setVoiceoverVolume}
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
				</div>
			</div>

			{/* Primary Action Button */}
			<Button
				disabled={isProcessing}
				onClick={handleLocalize}
				className="w-full bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white font-medium text-xs py-5 shadow-lg shadow-rose-900/20"
			>
				<HugeiconsIcon icon={SparklesIcon} className="size-4 mr-2" />
				{isProcessing ? "Đang xử lý..." : "✨ Việt hóa video"}
			</Button>

			{/* Status or Progress */}
			{progressStep && (
				<div className="p-3 bg-neutral-950/80 rounded-lg border border-neutral-800 text-xs text-neutral-300 flex flex-col gap-1.5">
					<span className="font-semibold text-rose-400">Trạng thái:</span>
					<p className="text-[11px] text-neutral-400 leading-relaxed">{progressStep}</p>
				</div>
			)}

			<div className="mt-auto pt-4 border-t border-neutral-800 flex flex-col gap-2">
				<Button
					disabled={isExporting}
					onClick={handleExport}
					className="w-full bg-neutral-800 hover:bg-neutral-700 text-white text-xs py-4 font-medium"
				>
					<HugeiconsIcon icon={Download01Icon} className="size-4 mr-2" />
					{isExporting ? "Đang xuất video 9:16..." : "Xuất video MP4 dọc"}
				</Button>

				{downloadUrl && (
					<a
						href={downloadUrl}
						download
						className="text-center text-xs text-rose-400 underline py-1 hover:text-rose-300"
					>
						Tải lại video đã xuất
					</a>
				)}
			</div>
		</div>
	);
}
