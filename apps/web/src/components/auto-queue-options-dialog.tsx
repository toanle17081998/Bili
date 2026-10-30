"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { VoicePickerDialog } from "@/components/editor/vietnamese-ai/voice-picker-dialog";
import { VIENEU_PRESET_VOICES } from "@/providers/tts/voices";
import type { SearchResult } from "@/source/types";
import { Eye, Loader2, Mic, Music2, Pause, Play, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/utils/ui";

interface MusicItem {
	name: string;
	path: string;
}

export interface EditableQueueJob {
	id: string;
	bvid: string;
	title: string;
	status: "queued" | "running" | "done" | "failed" | "cancelled";
	options?: {
		quality?: number;
		voice?: string;
		voiceVolume?: number;
		audioMode?: "mute_original" | "keep_sfx_add_music" | "keep_original_bgm";
		originalVolume?: number;
		musicFile?: string;
		musicFiles?: string[];
		musicVolume?: number;
		subtitleColor?: string;
		subtitleMaxLines?: number;
		removeLogo?: boolean;
		coverSubtitle?: boolean;
		subtitleBlur?: number;
		subtitleBgOpacity?: number;
		subtitleFontSizePx?: number;
		stripWidthPercent?: number;
		stripHeightPercent?: number;
	};
}

interface AutoQueueOptionsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	video: SearchResult | null;
	qualities: { height: number; label: string }[];
	isLoadingQualities: boolean;
	selectedQuality: string;
	onSelectedQualityChange: (quality: string) => void;
	onQueued: () => void;
	editingJob?: EditableQueueJob | null;
}

const SUBTITLE_COLOR_PRESETS = [
	{ label: "Vàng", value: "#FFFF00" },
	{ label: "Trắng", value: "#FFFFFF" },
	{ label: "Xanh", value: "#00FFFF" },
	{ label: "Hồng", value: "#FF66CC" },
];

const BG_STYLE_PRESETS = [
	{ label: "✨ Kính mờ trong suốt (0% tối)", blur: 30, opacity: 0 },
	{ label: "🌫 Mờ dịu nhẹ (15% tối)", blur: 30, opacity: 15 },
	{ label: "🌑 Mờ sẫm (35% tối)", blur: 35, opacity: 35 },
];

function readStored<T>(key: string, fallback: T): T {
	if (typeof window === "undefined") return fallback;
	try {
		const raw = localStorage.getItem(key);
		if (raw === null) return fallback;
		try {
			return JSON.parse(raw) as T;
		} catch {
			return raw as unknown as T;
		}
	} catch {
		return fallback;
	}
}

export function AutoQueueOptionsDialog({
	open,
	onOpenChange,
	video,
	qualities,
	isLoadingQualities,
	selectedQuality,
	onSelectedQualityChange,
	onQueued,
	editingJob,
}: AutoQueueOptionsDialogProps) {
	const [voice, setVoice] = useState("Hải Đăng");
	const [voiceVolume, setVoiceVolume] = useState(100);
	const [audioMode, setAudioMode] = useState<
		"mute_original" | "keep_sfx_add_music" | "keep_original_bgm"
	>("mute_original");
	const [originalVolume, setOriginalVolume] = useState(35);
	const [musicFile, setMusicFile] = useState("random");
	const [extraMusicFiles, setExtraMusicFiles] = useState<string[]>([]);
	const [musicVolume, setMusicVolume] = useState(15);
	const [subtitleColor, setSubtitleColor] = useState("#FFFF00");
	const [subtitleMaxLines, setSubtitleMaxLines] = useState(2);
	const [subtitleBlur, setSubtitleBlur] = useState(30);
	const [subtitleBgOpacity, setSubtitleBgOpacity] = useState(0);
	const [subtitleFontSizePx, setSubtitleFontSizePx] = useState(46);
	const [stripWidthPercent, setStripWidthPercent] = useState(94);
	const [stripHeightPercent, setStripHeightPercent] = useState(16);
	const [removeLogo, setRemoveLogo] = useState(true);
	const [coverSubtitle, setCoverSubtitle] = useState(true);
	const [applyToAllQueued, setApplyToAllQueued] = useState(false);
	const [hasHydrated, setHasHydrated] = useState(false);

	const [musicFiles, setMusicFiles] = useState<MusicItem[]>([]);
	const [musicDirectory, setMusicDirectory] = useState("D:\\videomxh\\nhacold");
	const [outputDirectory, setOutputDirectory] = useState("D:\\videomxh");
	const [isVoicePickerOpen, setIsVoicePickerOpen] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Voice preview audio
	const [isVoicePlaying, setIsVoicePlaying] = useState(false);
	const [isVoiceLoading, setIsVoiceLoading] = useState(false);
	const voiceAudioRef = useRef<HTMLAudioElement | null>(null);

	const stopVoicePreview = () => {
		if (voiceAudioRef.current) {
			voiceAudioRef.current.pause();
			voiceAudioRef.current.currentTime = 0;
			voiceAudioRef.current = null;
		}
		setIsVoicePlaying(false);
		setIsVoiceLoading(false);
	};

	useEffect(() => {
		if (!open) {
			stopVoicePreview();
			return;
		}
		// Hydrate defaults from user's saved Editor preferences
		const savedVoice = readStored<string>("ai-global-selected-voice", "Hải Đăng");
		const savedVoiceVol = readStored<number[]>("ai-global-voiceover-volume", [100]);
		const savedMusicVol = Number(readStored<number>("ai-global-bgm-volume", 15));
		const savedColor = readStored<string>("ai-global-subtitle-text-color", "#FFFF00");
		const savedMaxLines = Number(readStored<number>("ai-global-subtitle-max-lines", 2));
		const savedBg = readStored<{
			blur?: number;
			opacity?: number;
			stripWidth?: number;
			stripHeight?: number;
		}>("ai-global-subtitle-background", {
			blur: 30,
			opacity: 0,
			stripWidth: 94,
			stripHeight: 16,
		});
		const savedFontPx = Number(
			readStored<number>("ai-auto-subtitle-font-px", 46),
		);
		const savedAutoPrefs = readStored<{
			subtitleColor?: string;
			subtitleMaxLines?: number;
			subtitleBlur?: number;
			subtitleBgOpacity?: number;
			subtitleFontSizePx?: number;
			stripWidthPercent?: number;
			stripHeightPercent?: number;
			removeLogo?: boolean;
			coverSubtitle?: boolean;
			audioMode?: "mute_original" | "keep_sfx_add_music" | "keep_original_bgm";
			originalVolume?: number;
		} | null>("ai-auto-queue-subtitle-prefs", null);

		setVoice(savedVoice || "Hải Đăng");
		setVoiceVolume(
			Array.isArray(savedVoiceVol) && Number.isFinite(savedVoiceVol[0])
				? savedVoiceVol[0]
				: 100,
		);
		setMusicFile("random");
		setExtraMusicFiles([]);
		setMusicVolume(
			Number.isFinite(savedMusicVol) && savedMusicVol >= 0 && savedMusicVol <= 100
				? savedMusicVol
				: 15,
		);

		const nextColor = savedAutoPrefs?.subtitleColor ?? savedColor;
		setSubtitleColor(
			/^#[0-9a-fA-F]{6}$/.test(nextColor) ? nextColor : "#FFFF00",
		);
		const nextLines = savedAutoPrefs?.subtitleMaxLines ?? savedMaxLines;
		setSubtitleMaxLines(nextLines === 1 ? 1 : 2);
		const nextBlur = savedAutoPrefs?.subtitleBlur ?? savedBg?.blur;
		setSubtitleBlur(
			typeof nextBlur === "number" && nextBlur >= 6 && nextBlur <= 60
				? nextBlur
				: 30,
		);
		const nextOpacity = savedAutoPrefs?.subtitleBgOpacity ?? savedBg?.opacity;
		setSubtitleBgOpacity(
			typeof nextOpacity === "number" && nextOpacity >= 0 && nextOpacity <= 85
				? nextOpacity
				: 0,
		);
		const nextFontPx = savedAutoPrefs?.subtitleFontSizePx ?? savedFontPx;
		setSubtitleFontSizePx(
			typeof nextFontPx === "number" &&
				Number.isFinite(nextFontPx) &&
				nextFontPx >= 32 &&
				nextFontPx <= 68
				? nextFontPx
				: 46,
		);
		const nextWidth = savedAutoPrefs?.stripWidthPercent ?? savedBg?.stripWidth;
		setStripWidthPercent(
			typeof nextWidth === "number" && nextWidth >= 70 && nextWidth <= 100
				? nextWidth
				: 94,
		);
		const nextHeight = savedAutoPrefs?.stripHeightPercent ?? savedBg?.stripHeight;
		setStripHeightPercent(
			typeof nextHeight === "number" && nextHeight >= 10 && nextHeight <= 35
				? nextHeight
				: 16,
		);
		setRemoveLogo(
			typeof savedAutoPrefs?.removeLogo === "boolean"
				? savedAutoPrefs.removeLogo
				: true,
		);
		setCoverSubtitle(
			typeof savedAutoPrefs?.coverSubtitle === "boolean"
				? savedAutoPrefs.coverSubtitle
				: true,
		);
		if (
			savedAutoPrefs?.audioMode === "mute_original" ||
			savedAutoPrefs?.audioMode === "keep_sfx_add_music" ||
			savedAutoPrefs?.audioMode === "keep_original_bgm"
		) {
			setAudioMode(savedAutoPrefs.audioMode);
		}
		if (
			typeof savedAutoPrefs?.originalVolume === "number" &&
			savedAutoPrefs.originalVolume >= 5 &&
			savedAutoPrefs.originalVolume <= 120
		) {
			setOriginalVolume(savedAutoPrefs.originalVolume);
		}

		// If editing an existing job in the queue, override with that job's saved options
		if (editingJob?.options) {
			const jOpt = editingJob.options;
			if (jOpt.voice) setVoice(jOpt.voice);
			if (typeof jOpt.voiceVolume === "number") {
				setVoiceVolume(Math.round(jOpt.voiceVolume * 100));
			}
			if (jOpt.audioMode) setAudioMode(jOpt.audioMode);
			if (typeof jOpt.originalVolume === "number") {
				setOriginalVolume(Math.round(jOpt.originalVolume * 100));
			}
			if (Array.isArray(jOpt.musicFiles) && jOpt.musicFiles.length > 0) {
				setMusicFile(jOpt.musicFiles[0]);
				setExtraMusicFiles(jOpt.musicFiles.slice(1));
			} else if (jOpt.musicFile) {
				setMusicFile(jOpt.musicFile);
				setExtraMusicFiles([]);
			}
			if (typeof jOpt.musicVolume === "number") {
				setMusicVolume(Math.round(jOpt.musicVolume * 100));
			}
			if (jOpt.subtitleColor) setSubtitleColor(jOpt.subtitleColor);
			if (typeof jOpt.subtitleMaxLines === "number") {
				setSubtitleMaxLines(jOpt.subtitleMaxLines === 1 ? 1 : 2);
			}
			if (typeof jOpt.subtitleBlur === "number") setSubtitleBlur(jOpt.subtitleBlur);
			if (typeof jOpt.subtitleBgOpacity === "number") {
				setSubtitleBgOpacity(jOpt.subtitleBgOpacity);
			}
			if (typeof jOpt.subtitleFontSizePx === "number") {
				setSubtitleFontSizePx(jOpt.subtitleFontSizePx);
			}
			if (typeof jOpt.stripWidthPercent === "number") {
				setStripWidthPercent(jOpt.stripWidthPercent);
			}
			if (typeof jOpt.stripHeightPercent === "number") {
				setStripHeightPercent(jOpt.stripHeightPercent);
			}
			if (typeof jOpt.removeLogo === "boolean") setRemoveLogo(jOpt.removeLogo);
			if (typeof jOpt.coverSubtitle === "boolean") {
				setCoverSubtitle(jOpt.coverSubtitle);
			}
		}
		setApplyToAllQueued(false);
		setHasHydrated(true);

		let cancelled = false;
		fetch("/api/auto-queue", { cache: "no-store" })
			.then((res) => res.json())
			.then((data) => {
				if (cancelled || !data.success) return;
				if (Array.isArray(data.musicFiles)) setMusicFiles(data.musicFiles);
				if (data.musicDirectory) setMusicDirectory(data.musicDirectory);
				if (data.outputDirectory) setOutputDirectory(data.outputDirectory);
			})
			.catch(() => {});

		return () => {
			cancelled = true;
		};
	}, [open, editingJob]);

	useEffect(() => {
		return () => {
			stopVoicePreview();
		};
	}, []);

	// Persist Section 3 ("Xem trước Thanh làm mờ & Phụ đề mẫu") immediately whenever changed
	useEffect(() => {
		if (!hasHydrated) return;
		try {
			localStorage.setItem(
				"ai-auto-queue-subtitle-prefs",
				JSON.stringify({
					subtitleColor,
					subtitleMaxLines,
					subtitleBlur,
					subtitleBgOpacity,
					subtitleFontSizePx,
					stripWidthPercent,
					stripHeightPercent,
					removeLogo,
					coverSubtitle,
					audioMode,
					originalVolume,
				}),
			);
			localStorage.setItem(
				"ai-global-subtitle-text-color",
				JSON.stringify(subtitleColor),
			);
			localStorage.setItem(
				"ai-global-subtitle-max-lines",
				JSON.stringify(subtitleMaxLines),
			);
			localStorage.setItem(
				"ai-auto-subtitle-font-px",
				JSON.stringify(subtitleFontSizePx),
			);
			const prevBg = readStored<Record<string, unknown>>(
				"ai-global-subtitle-background",
				{},
			);
			localStorage.setItem(
				"ai-global-subtitle-background",
				JSON.stringify({
					enabled: true,
					color: "#000000",
					cornerRadius: 12,
					paddingX: 0,
					paddingY: 0,
					fullWidth: true,
					backdropBlur: true,
					...prevBg,
					stripHeight: stripHeightPercent,
					stripWidth: stripWidthPercent,
					blur: subtitleBlur,
					opacity: subtitleBgOpacity,
				}),
			);
		} catch {
			// Ignore storage errors
		}
	}, [
		hasHydrated,
		subtitleColor,
		subtitleMaxLines,
		subtitleBlur,
		subtitleBgOpacity,
		subtitleFontSizePx,
		stripWidthPercent,
		stripHeightPercent,
		removeLogo,
		coverSubtitle,
		audioMode,
		originalVolume,
	]);

	const currentVoiceMeta = useMemo(() => {
		const found = VIENEU_PRESET_VOICES.find(
			(v) => v.name === voice || v.id === voice,
		);
		if (found) return found;
		if (voice === "vi-VN-HoaiMyNeural") {
			return VIENEU_PRESET_VOICES.find((v) => v.name === "Ngọc Huyền");
		}
		if (voice === "vi-VN-NamMinhNeural") {
			return VIENEU_PRESET_VOICES.find((v) => v.name === "Hải Đăng");
		}
		return (
			VIENEU_PRESET_VOICES[0] ?? {
				id: voice,
				name: voice,
				description: "Giọng đọc AI tiếng Việt",
			}
		);
	}, [voice]);

	const selectedMusicItem = useMemo(
		() => musicFiles.find((item) => item.name === musicFile) ?? null,
		[musicFiles, musicFile],
	);

	const toggleVoicePreview = async () => {
		if (isVoicePlaying) {
			stopVoicePreview();
			return;
		}
		stopVoicePreview();
		const voiceName = currentVoiceMeta?.name || voice || "Hải Đăng";
		setIsVoiceLoading(true);
		try {
			const audio = new Audio(
				`/api/tts/preview?voice=${encodeURIComponent(voiceName)}`,
			);
			voiceAudioRef.current = audio;
			audio.oncanplay = () => setIsVoiceLoading(false);
			audio.onplay = () => {
				setIsVoiceLoading(false);
				setIsVoicePlaying(true);
			};
			audio.onended = () => {
				setIsVoicePlaying(false);
				voiceAudioRef.current = null;
			};
			audio.onerror = () => {
				setIsVoiceLoading(false);
				setIsVoicePlaying(false);
				voiceAudioRef.current = null;
				toast.error(`Không thể nghe thử giọng "${voiceName}"`);
			};
			await audio.play();
		} catch {
			setIsVoiceLoading(false);
			setIsVoicePlaying(false);
			toast.error(`Không thể nghe thử giọng "${voiceName}"`);
		}
	};

	const handleSubmit = async () => {
		if (!video && !editingJob) return;
		stopVoicePreview();
		setIsSubmitting(true);
		try {
			try {
				localStorage.setItem("ai-global-selected-voice", voice);
				localStorage.setItem(
					"ai-global-voiceover-volume",
					JSON.stringify([voiceVolume]),
				);
				localStorage.setItem("ai-global-bgm-volume", String(musicVolume));
				localStorage.setItem(
					"ai-global-subtitle-text-color",
					JSON.stringify(subtitleColor),
				);
				localStorage.setItem(
					"ai-global-subtitle-max-lines",
					JSON.stringify(subtitleMaxLines),
				);
				localStorage.setItem(
					"ai-auto-subtitle-font-px",
					JSON.stringify(subtitleFontSizePx),
				);
				const prevBg = readStored<Record<string, unknown>>(
					"ai-global-subtitle-background",
					{},
				);
				localStorage.setItem(
					"ai-global-subtitle-background",
					JSON.stringify({
						enabled: true,
						color: "#000000",
						cornerRadius: 12,
						paddingX: 0,
						paddingY: 0,
						fullWidth: true,
						backdropBlur: true,
						...prevBg,
						stripHeight: stripHeightPercent,
						stripWidth: stripWidthPercent,
						blur: subtitleBlur,
						opacity: subtitleBgOpacity,
					}),
				);
			} catch {
				// Ignore storage errors
			}

			const payloadOptions = {
				...(selectedQuality !== "best"
					? { quality: Number(selectedQuality) }
					: editingJob?.options?.quality
						? { quality: editingJob.options.quality }
						: {}),
				voice,
				voiceVolume: voiceVolume / 100,
				audioMode,
				originalVolume: originalVolume / 100,
				musicFile: audioMode === "keep_original_bgm" ? "none" : musicFile,
				...(audioMode !== "keep_original_bgm" &&
					musicFile !== "random" &&
					musicFile !== "none" && {
						musicFiles: [musicFile, ...extraMusicFiles],
					}),
				musicVolume: musicVolume / 100,
				subtitleColor,
				subtitleMaxLines,
				removeLogo,
				coverSubtitle,
				subtitleBlur,
				subtitleBgOpacity,
				subtitleFontSizePx,
				stripWidthPercent,
				stripHeightPercent,
			};

			const res = editingJob
				? await fetch(`/api/auto-queue?id=${encodeURIComponent(editingJob.id)}`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							...payloadOptions,
							applyToAllQueued,
						}),
					})
				: await fetch("/api/auto-queue", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							id: video!.id,
							title: video!.title,
							...payloadOptions,
						}),
					});
			const data = await res.json();
			if (!data.success) {
				throw new Error(data.error || "Không lưu được cấu hình");
			}
			toast.success(
				editingJob
					? applyToAllQueued
						? "Đã cập nhật cấu hình cho job này và tất cả video đang chờ!"
						: "Đã cập nhật cấu hình video trong hàng đợi!"
					: "Đã đưa video vào hàng đợi xử lý ngầm! Bạn có thể tiếp tục tìm video khác.",
			);
			onOpenChange(false);
			onQueued();
		} catch (err: any) {
			toast.error(err.message || "Không lưu được cấu hình");
		} finally {
			setIsSubmitting(false);
		}
	};

	// Scale preview font size proportionally to the preview box width (~460px vs 1080px canvas)
	const previewFontPx = Math.round(subtitleFontSizePx * 0.36);
	const cssBackdropBlur = Math.max(2, Math.round(subtitleBlur * 0.45));

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="bg-neutral-900 border-neutral-800 text-neutral-100 sm:max-w-2xl max-h-[92vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2 text-base font-semibold">
							<Sparkles className="size-4 text-rose-400" />
							Cấu hình Xử lý Auto (Chạy ngầm 9:16)
						</DialogTitle>
					</DialogHeader>

					<div className="flex flex-col gap-3.5 py-1 text-xs">
						{/* Video summary + Quality */}
						<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-950/70 p-3">
							<div className="min-w-0 flex-1">
								<p
									className="font-medium text-neutral-200 truncate"
									title={editingJob?.title || video?.title}
								>
									{editingJob?.title || video?.title}
								</p>
								<p className="mt-0.5 text-[11px] text-neutral-400">
									Mã:{" "}
									<span className="font-mono text-neutral-300">
										{editingJob?.bvid || video?.id}
									</span>{" "}
									· Khung xuất:{" "}
									<span className="text-rose-400 font-medium">
										Dọc 9:16 (1080 × 1920)
									</span>
								</p>
							</div>
							<label className="flex items-center gap-2 shrink-0 text-neutral-300">
								<span>Chất lượng:</span>
								<select
									value={selectedQuality}
									onChange={(e) => onSelectedQualityChange(e.target.value)}
									disabled={isLoadingQualities || isSubmitting}
									className="h-8 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-100"
								>
									<option value="best">
										{isLoadingQualities ? "Đang tải..." : "Tốt nhất"}
									</option>
									{qualities.map((q) => (
										<option key={q.height} value={q.height}>
											{q.label}
										</option>
									))}
								</select>
							</label>
						</div>

						{/* 1. Voice selection */}
						<div className="flex flex-col gap-2.5 rounded-xl border border-neutral-800 bg-neutral-950/50 p-3.5">
							<div className="flex items-center justify-between">
								<span className="font-semibold text-neutral-200 flex items-center gap-1.5">
									<Mic className="size-3.5 text-indigo-400" />
									1. Giọng đọc AI Việt hóa
								</span>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => setIsVoicePickerOpen(true)}
									className="h-7 px-2.5 text-xs border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
								>
									Đổi giọng đọc...
								</Button>
							</div>

							<div className="flex items-center justify-between gap-2 rounded-lg border border-neutral-800/90 bg-neutral-900/80 px-3 py-2">
								<div className="min-w-0">
									<p className="font-medium text-neutral-100">
										{currentVoiceMeta?.name || voice}
									</p>
									<p className="text-[11px] text-neutral-400 truncate">
										{currentVoiceMeta?.description || "Giọng đọc AI tiếng Việt"}
									</p>
								</div>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={toggleVoicePreview}
									disabled={isVoiceLoading}
									className="h-8 px-2.5 text-xs text-indigo-300 hover:text-indigo-200 hover:bg-indigo-500/10 shrink-0"
								>
									{isVoiceLoading ? (
										<Loader2 className="size-3.5 animate-spin" />
									) : isVoicePlaying ? (
										<Pause className="size-3.5" />
									) : (
										<Play className="size-3.5" />
									)}
									<span>{isVoicePlaying ? "Dừng" : "Nghe thử"}</span>
								</Button>
							</div>

							<div className="flex flex-col gap-1.5 pt-1">
								<div className="flex items-center justify-between text-neutral-400">
									<Label htmlFor="auto-voice-vol" className="text-xs text-neutral-400">
										Âm lượng giọng đọc AI
									</Label>
									<span className="font-mono text-neutral-200">{voiceVolume}%</span>
								</div>
								<Slider
									id="auto-voice-vol"
									min={20}
									max={150}
									step={5}
									value={[voiceVolume]}
									onValueChange={([val]) => setVoiceVolume(val)}
								/>
							</div>
						</div>

						{/* 2. Audio Mode & Background Music selection */}
						<div className="flex flex-col gap-2.5 rounded-xl border border-neutral-800 bg-neutral-950/50 p-3.5">
							<div className="flex items-center justify-between">
								<span className="font-semibold text-neutral-200 flex items-center gap-1.5">
									<Music2 className="size-3.5 text-rose-400" />
									2. Chế độ Âm thanh gốc & Nhạc nền
								</span>
								<span className="text-[11px] text-neutral-400">
									{musicFiles.length} bài trong {musicDirectory}
								</span>
							</div>

							{/* 3 Audio Mode Options */}
							<div className="grid grid-cols-1 gap-1.5">
								{(
									[
										{
											value: "mute_original",
											title: "1. Bỏ hoàn toàn âm gốc — Chèn nhạc nền + Giọng thuyết minh",
											desc: "Nhanh nhất & sạch 100%, không cần tách âm gốc.",
										},
										{
											value: "keep_sfx_add_music",
											title: "2. Bỏ giọng gốc, giữ lại SFX + Chèn nhạc nền mới",
											desc: "Dành cho video gốc chỉ có thuyết minh & tiếng động, chưa có nhạc nền.",
										},
										{
											value: "keep_original_bgm",
											title: "3. Bỏ giọng gốc, giữ lại SFX & Nhạc nền sẵn có (Không chèn nhạc mới)",
											desc: "Dành cho video gốc đã có sẵn nhạc nền & hiệu ứng âm thanh.",
										},
									] as const
								).map((opt) => (
									<button
										key={opt.value}
										type="button"
										onClick={() => setAudioMode(opt.value)}
										className={cn(
											"flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors",
											audioMode === opt.value
												? "border-rose-500/60 bg-rose-500/10 text-neutral-100"
												: "border-neutral-800 bg-neutral-900/60 text-neutral-300 hover:bg-neutral-900",
										)}
									>
										<span className="font-medium text-xs">{opt.title}</span>
										<span className="text-[11px] text-neutral-400">{opt.desc}</span>
									</button>
								))}
							</div>

							{(audioMode === "keep_sfx_add_music" ||
								audioMode === "keep_original_bgm") && (
								<div className="flex flex-col gap-1.5 rounded-lg border border-neutral-800/80 bg-neutral-900/50 p-2.5">
									<div className="flex items-center justify-between text-neutral-400">
										<Label htmlFor="auto-orig-vol" className="text-xs text-neutral-300">
											Âm lượng SFX / nhạc gốc giữ lại (sau khi AI tách bỏ giọng cũ)
										</Label>
										<span className="font-mono text-neutral-200">{originalVolume}%</span>
									</div>
									<Slider
										id="auto-orig-vol"
										min={5}
										max={120}
										step={5}
										value={[originalVolume]}
										onValueChange={([val]) => setOriginalVolume(val)}
									/>
								</div>
							)}

							{audioMode !== "keep_original_bgm" && (
								<>
									<select
										value={musicFile}
										onChange={(e) => {
											setMusicFile(e.target.value);
											if (e.target.value === "random" || e.target.value === "none") {
												setExtraMusicFiles([]);
											}
										}}
										className="h-9 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 text-xs text-neutral-100"
									>
										<option value="random">
											🎲 Ngẫu nhiên (Tự nối nhiều bài khác nhau trong {musicDirectory})
										</option>
										<option value="none">🔇 Không chèn nhạc nền</option>
										{musicFiles.map((item) => (
											<option key={item.name} value={item.name}>
												🎵 Bài 1: {item.name}
											</option>
										))}
									</select>

									{selectedMusicItem && (
										<div className="flex flex-col gap-2 pt-0.5">
											{/* eslint-disable-next-line jsx-a11y/media-has-caption */}
											<audio
												controls
												preload="metadata"
												src={`/api/media/stream?file=${encodeURIComponent(selectedMusicItem.path)}`}
												className="h-8 w-full"
											/>

											{extraMusicFiles.map((extraName, idx) => {
												const extraItem = musicFiles.find((m) => m.name === extraName);
												return (
													<div
														key={`${idx}-${extraName}`}
														className="flex flex-col gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900/70 p-2"
													>
														<div className="flex items-center gap-2">
															<select
																value={extraName}
																onChange={(e) => {
																	const next = [...extraMusicFiles];
																	next[idx] = e.target.value;
																	setExtraMusicFiles(next);
																}}
																className="h-8 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 text-xs text-neutral-100"
															>
																{musicFiles.map((item) => (
																	<option key={item.name} value={item.name}>
																		🎵 Bài {idx + 2}: {item.name}
																	</option>
																))}
															</select>
															<button
																type="button"
																onClick={() =>
																	setExtraMusicFiles(
																		extraMusicFiles.filter((_, i) => i !== idx),
																	)
																}
																className="rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-rose-400"
															>
																✕
															</button>
														</div>
														{extraItem && (
															// eslint-disable-next-line jsx-a11y/media-has-caption
															<audio
																controls
																preload="metadata"
																src={`/api/media/stream?file=${encodeURIComponent(extraItem.path)}`}
																className="h-7 w-full"
															/>
														)}
													</div>
												);
											})}

											{musicFiles.length > 1 && (
												<button
													type="button"
													onClick={() => {
														const used = new Set([musicFile, ...extraMusicFiles]);
														const nextCandidate =
															musicFiles.find((m) => !used.has(m.name))?.name ??
															musicFiles[0].name;
														setExtraMusicFiles([...extraMusicFiles, nextCandidate]);
													}}
													className="self-start rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-[11px] font-medium text-amber-300 hover:border-amber-500/40 hover:bg-neutral-800"
												>
													➕ Thêm bài nhạc nối tiếp (Bài {extraMusicFiles.length + 2})
												</button>
											)}
											<span className="text-[11px] text-neutral-500">
												Nếu video dài hơn các bài đã chọn, hệ thống sẽ tự nối thêm bài khác trong thư mục để không bị lặp lại 1 bài.
											</span>
										</div>
									)}

									{musicFile !== "none" && (
										<div className="flex flex-col gap-1.5 pt-1">
											<div className="flex items-center justify-between text-neutral-400">
												<Label htmlFor="auto-bgm-vol" className="text-xs text-neutral-400">
													Âm lượng nhạc nền mới
												</Label>
												<span className="font-mono text-neutral-200">{musicVolume}%</span>
											</div>
											<Slider
												id="auto-bgm-vol"
												min={0}
												max={100}
												step={1}
												value={[musicVolume]}
												onValueChange={([val]) => setMusicVolume(val)}
											/>
										</div>
									)}
								</>
							)}
						</div>

						{/* 3. Live Subtitle & Blur Strip Preview + Options */}
						<div className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-950/50 p-3.5">
							<div className="flex items-center justify-between">
								<span className="font-semibold text-neutral-200 flex items-center gap-1.5">
									<Eye className="size-3.5 text-amber-400" />
									3. Xem trước Thanh làm mờ & Phụ đề mẫu
								</span>
								<span className="text-[11px] text-neutral-400">
									Blur {subtitleBlur}px · Tối {subtitleBgOpacity}%
								</span>
							</div>

							{/* Live Preview Box */}
							<div className="relative aspect-video w-full overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 select-none">
								{video?.thumbnail ? (
									// eslint-disable-next-line @next/next/no-img-element
									<img
										src={video.thumbnail}
										alt="Xem trước phụ đề"
										referrerPolicy="no-referrer"
										className="size-full object-cover"
									/>
								) : (
									<div className="size-full bg-gradient-to-br from-rose-900/50 via-indigo-950 to-amber-900/40" />
								)}

								{/* Simulated original Chinese subtitle underneath */}
								<div
									aria-hidden
									className="pointer-events-none absolute inset-x-0 bottom-[8%] flex justify-center"
								>
									<span className="text-sm sm:text-base font-bold text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.95)] tracking-widest opacity-90">
										原版中文字幕示例 · 美食探店日常
									</span>
								</div>

								{/* Simulated Logo badge if removeLogo is checked */}
								{removeLogo && (
									<div className="absolute top-2.5 right-2.5 rounded bg-emerald-950/85 border border-emerald-500/40 px-2 py-0.5 text-[10px] text-emerald-300 backdrop-blur-sm">
										✨ AI tự dò & xoá Logo
									</div>
								)}

								{/* Frosted Blur Cover Strip + Vietnamese Subtitle */}
								<div className="absolute inset-x-0 bottom-[5%] flex items-center justify-center">
									<div
										className="rounded-lg px-3 flex items-center justify-center text-center transition-all"
										style={{
											width: `${stripWidthPercent}%`,
											minHeight: `${Math.round(stripHeightPercent * 2.4)}px`,
											...(coverSubtitle
												? {
														backdropFilter: `blur(${cssBackdropBlur}px)`,
														WebkitBackdropFilter: `blur(${cssBackdropBlur}px)`,
														backgroundColor: `rgba(0, 0, 0, ${(subtitleBgOpacity / 100).toFixed(2)})`,
													}
												: {}),
										}}
									>
										<p
											className="font-bold leading-snug tracking-tight"
											style={{
												color: subtitleColor,
												fontSize: `${previewFontPx}px`,
												textShadow:
													"-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, 0 2px 4px rgba(0,0,0,0.85)",
											}}
										>
											{subtitleMaxLines === 1 ? (
												"Món ăn đường phố siêu hấp dẫn tại Trung Quốc!"
											) : (
												<>
													Món ăn đường phố siêu hấp dẫn
													<br />
													nhìn thôi đã thấy thèm rồi!
												</>
											)}
										</p>
									</div>
								</div>
							</div>

							{/* Quick style presets for frosted blur */}
							{coverSubtitle && (
								<div className="flex flex-col gap-2">
									<div className="flex flex-wrap gap-1.5">
										{BG_STYLE_PRESETS.map((preset) => {
											const isActive =
												subtitleBlur === preset.blur &&
												subtitleBgOpacity === preset.opacity;
											return (
												<button
													key={preset.label}
													type="button"
													onClick={() => {
														setSubtitleBlur(preset.blur);
														setSubtitleBgOpacity(preset.opacity);
													}}
													className={cn(
														"flex-1 min-w-[140px] py-1.5 px-2 rounded-lg border text-[11px] font-medium transition",
														isActive
															? "border-amber-500 bg-amber-500/15 text-amber-200"
															: "border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-neutral-700",
													)}
												>
													{preset.label}
												</button>
											);
										})}
									</div>

									<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
										<div className="flex flex-col gap-1.5">
											<div className="flex items-center justify-between text-neutral-400">
												<Label
													htmlFor="auto-sub-blur"
													className="text-xs text-neutral-400"
												>
													Độ nhòe mờ chữ cũ (Blur)
												</Label>
												<span className="font-mono text-neutral-200">
													{subtitleBlur}px
												</span>
											</div>
											<Slider
												id="auto-sub-blur"
												min={8}
												max={55}
												step={1}
												value={[subtitleBlur]}
												onValueChange={([val]) => setSubtitleBlur(val)}
											/>
										</div>

										<div className="flex flex-col gap-1.5">
											<div className="flex items-center justify-between text-neutral-400">
												<Label
													htmlFor="auto-sub-opacity"
													className="text-xs text-neutral-400"
												>
													Độ tối nền (0% = Trong suốt)
												</Label>
												<span className="font-mono text-neutral-200">
													{subtitleBgOpacity}%
												</span>
											</div>
											<Slider
												id="auto-sub-opacity"
												min={0}
												max={75}
												step={5}
												value={[subtitleBgOpacity]}
												onValueChange={([val]) => setSubtitleBgOpacity(val)}
											/>
										</div>

										<div className="flex flex-col gap-1.5">
											<div className="flex items-center justify-between text-neutral-400">
												<Label
													htmlFor="auto-strip-width"
													className="text-xs text-neutral-400"
												>
													Độ rộng thanh che (Ngang)
												</Label>
												<span className="font-mono text-neutral-200">
													{stripWidthPercent}%
												</span>
											</div>
											<Slider
												id="auto-strip-width"
												min={75}
												max={100}
												step={1}
												value={[stripWidthPercent]}
												onValueChange={([val]) => setStripWidthPercent(val)}
											/>
										</div>

										<div className="flex flex-col gap-1.5">
											<div className="flex items-center justify-between text-neutral-400">
												<Label
													htmlFor="auto-strip-height"
													className="text-xs text-neutral-400"
												>
													Chiều cao thanh che (Dọc)
												</Label>
												<span className="font-mono text-neutral-200">
													{stripHeightPercent}%
												</span>
											</div>
											<Slider
												id="auto-strip-height"
												min={12}
												max={28}
												step={1}
												value={[stripHeightPercent]}
												onValueChange={([val]) => setStripHeightPercent(val)}
											/>
										</div>
									</div>
								</div>
							)}

							{/* Color, Font size, Max lines */}
							<div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-neutral-800/80">
								<div className="flex flex-col gap-1.5">
									<span className="text-neutral-400">Màu chữ phụ đề</span>
									<div className="flex items-center gap-1">
										{SUBTITLE_COLOR_PRESETS.map((preset) => (
											<button
												key={preset.value}
												type="button"
												onClick={() => setSubtitleColor(preset.value)}
												className={cn(
													"px-2 py-1 rounded border text-[11px] font-medium transition",
													subtitleColor.toUpperCase() === preset.value
														? "border-rose-500 bg-rose-500/15 text-white"
														: "border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-600",
												)}
											>
												<span
													className="inline-block size-2 rounded-full mr-1 align-middle"
													style={{ backgroundColor: preset.value }}
												/>
												{preset.label}
											</button>
										))}
										<input
											type="color"
											value={subtitleColor}
											onChange={(e) => setSubtitleColor(e.target.value)}
											aria-label="Chọn màu phụ đề"
											className="h-7 w-7 cursor-pointer rounded border border-neutral-700 bg-transparent p-0.5 shrink-0"
										/>
									</div>
								</div>

								<div className="flex flex-col gap-1.5">
									<div className="flex items-center justify-between text-neutral-400">
										<span>Cỡ chữ</span>
										<span className="font-mono text-neutral-200">
											{subtitleFontSizePx}px
										</span>
									</div>
									<Slider
										min={34}
										max={64}
										step={2}
										value={[subtitleFontSizePx]}
										onValueChange={([val]) => setSubtitleFontSizePx(val)}
									/>
								</div>

								<div className="flex flex-col gap-1.5">
									<span className="text-neutral-400">Số dòng tối đa</span>
									<div className="flex gap-1.5">
										{[1, 2].map((lines) => (
											<button
												key={lines}
												type="button"
												onClick={() => setSubtitleMaxLines(lines)}
												className={cn(
													"flex-1 py-1 rounded border text-xs font-medium transition",
													subtitleMaxLines === lines
														? "border-rose-500 bg-rose-500/15 text-white"
														: "border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-600",
												)}
											>
												{lines} dòng
											</button>
										))}
									</div>
								</div>
							</div>

							<div className="flex flex-wrap gap-4 pt-2 border-t border-neutral-800/80">
								<label className="flex items-center gap-2 cursor-pointer text-neutral-300">
									<Checkbox
										checked={removeLogo}
										onCheckedChange={(checked) => setRemoveLogo(!!checked)}
									/>
									<span>AI tự phát hiện & xóa Logo</span>
								</label>

								<label className="flex items-center gap-2 cursor-pointer text-neutral-300">
									<Checkbox
										checked={coverSubtitle}
										onCheckedChange={(checked) => setCoverSubtitle(!!checked)}
									/>
									<span>Làm mờ đè lên phụ đề cũ</span>
								</label>
							</div>

							{editingJob && (
								<label className="flex items-center gap-2 cursor-pointer rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-200">
									<Checkbox
										checked={applyToAllQueued}
										onCheckedChange={(checked) => setApplyToAllQueued(!!checked)}
									/>
									<span>
										Áp dụng cấu hình này cho <b>tất cả các video đang chờ (Chờ)</b> trong hàng đợi
									</span>
								</label>
							)}

							<p className="text-[11px] text-neutral-400 pt-1 border-t border-neutral-800/80">
								Video xuất ra tự động lưu về{" "}
								<span className="font-mono text-neutral-300">{outputDirectory}</span>.
							</p>
						</div>
					</div>

					<DialogFooter className="flex gap-2 sm:justify-end">
						<Button
							type="button"
							variant="outline"
							disabled={isSubmitting}
							onClick={() => onOpenChange(false)}
							className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
						>
							Hủy
						</Button>
						<Button
							type="button"
							disabled={isSubmitting || (!video && !editingJob)}
							onClick={handleSubmit}
							className="bg-gradient-to-r from-indigo-600 to-rose-600 hover:from-indigo-500 hover:to-rose-500 text-white font-medium"
						>
							{isSubmitting
								? "Đang lưu..."
								: editingJob
									? editingJob.status === "queued"
										? "💾 Lưu cấu hình mới"
										: "🔄 Lưu & Chạy lại với cấu hình mới"
									: "🚀 Bắt đầu xử lý ngầm"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<VoicePickerDialog
				open={isVoicePickerOpen}
				onOpenChange={setIsVoicePickerOpen}
				selectedVoice={voice}
				onSelectVoice={(selected) => {
					setVoice(selected.name || selected.id);
					setIsVoicePickerOpen(false);
				}}
			/>
		</>
	);
}
