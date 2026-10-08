"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { volumeControlParams } from "./volume-control";
import { SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ChevronRight, Loader2, Mic, Pause, Play } from "lucide-react";
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
import {
	buildElementFromMedia,
	buildGraphicElement,
} from "@/timeline/element-utils";
import { InsertElementCommand } from "@/commands";
import { mediaTimeFromSeconds, ZERO_MEDIA_TIME } from "@/wasm";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocalStorage } from "@/services/storage/use-local-storage";
import { VoicePickerDialog } from "./voice-picker-dialog";
import { VIENEU_PRESET_VOICES } from "@/providers/tts/voices";
import type { TTSVoice } from "@/providers/tts/types";
import { cn } from "@/utils/ui";

interface Props {
	projectId: string;
}

interface PreviewCue {
	id: string;
	start: number;
	end: number;
	text: string;
}

const SUBTITLE_BG_PRESETS = [
	{
		id: "delogo",
		name: "🌫️ Xóa text đằng sau (Chuẩn xóa logo)",
		desc: "Độ che phủ 95%, viền mờ 24px, che sạch 100% chữ gốc",
		config: {
			enabled: true,
			color: "#000000",
			opacity: 95,
			blur: 24,
			cornerRadius: 16,
			paddingX: 240,
			paddingY: 90,
			fullWidth: false,
			stripHeight: 22,
		},
	},
	{
		id: "banner",
		name: "🎬 Dải mờ ngang đáy (TikTok Banner)",
		desc: "Trải rộng ngang che trọn dải phụ đề đáy video",
		config: {
			enabled: true,
			color: "#050505",
			opacity: 92,
			blur: 30,
			cornerRadius: 4,
			paddingX: 600,
			paddingY: 100,
			fullWidth: true,
			stripHeight: 22,
		},
	},
	{
		id: "compact",
		name: "🔲 Hộp mờ tối giản",
		desc: "Ôm gọn phụ đề với viền mờ tự nhiên",
		config: {
			enabled: true,
			color: "#121212",
			opacity: 85,
			blur: 14,
			cornerRadius: 20,
			paddingX: 120,
			paddingY: 70,
			fullWidth: false,
			stripHeight: 22,
		},
	},
] as const;

export function VietnameseAiPanel({ projectId }: Props) {
	const editor = useEditor();
	const canvasSize = useEditor(
		(e) => e.project.getActive().settings.canvasSize,
	);
	const [voice, setVoice] = useState(() => {
		if (typeof window !== "undefined") {
			const saved = localStorage.getItem(`ai-selected-voice-${projectId}`);
			if (saved) return saved;
		}
		return "Hải Đăng";
	});

	const [isVoicePickerOpen, setIsVoicePickerOpen] = useState(false);
	const [isPanelAudioPlaying, setIsPanelAudioPlaying] = useState(false);
	const [isPanelAudioLoading, setIsPanelAudioLoading] = useState(false);
	const panelAudioRef = useRef<HTMLAudioElement | null>(null);

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
		return VIENEU_PRESET_VOICES.find((v) => v.name === "Hải Đăng");
	}, [voice]);

	const stopPanelAudio = () => {
		if (panelAudioRef.current) {
			panelAudioRef.current.pause();
			panelAudioRef.current.currentTime = 0;
			panelAudioRef.current = null;
		}
		setIsPanelAudioPlaying(false);
		setIsPanelAudioLoading(false);
	};

	useEffect(() => {
		return () => {
			stopPanelAudio();
		};
	}, []);

	const togglePanelVoicePreview = async () => {
		if (isPanelAudioPlaying) {
			stopPanelAudio();
			return;
		}

		stopPanelAudio();
		const voiceName = currentVoiceMeta?.name || voice || "Hải Đăng";
		setIsPanelAudioLoading(true);

		try {
			const audio = new Audio(
				`/api/tts/preview?voice=${encodeURIComponent(voiceName)}`,
			);
			panelAudioRef.current = audio;
			audio.oncanplay = () => setIsPanelAudioLoading(false);
			audio.onplay = () => {
				setIsPanelAudioLoading(false);
				setIsPanelAudioPlaying(true);
			};
			audio.onended = () => {
				setIsPanelAudioPlaying(false);
				panelAudioRef.current = null;
			};
			audio.onerror = () => {
				setIsPanelAudioLoading(false);
				setIsPanelAudioPlaying(false);
				panelAudioRef.current = null;
				toast.error(`Không thể phát mẫu thử giọng "${voiceName}"`);
			};
			await audio.play();
		} catch {
			setIsPanelAudioLoading(false);
			setIsPanelAudioPlaying(false);
			toast.error(`Lỗi khi phát mẫu thử giọng "${voiceName}"`);
		}
	};
	const [originalVolume, setOriginalVolume] = useState([20]); // 20%
	const [voiceoverVolume, setVoiceoverVolume] = useState([100]); // 100%
	const [subtitleStyle, setSubtitleStyle] = useState("bold");
	const [subtitleBackground, setSubtitleBackground] = useLocalStorage({
		key: `subtitle-background-${projectId}`,
		defaultValue: {
			enabled: true,
			color: "#000000",
			opacity: 95,
			blur: 24,
			cornerRadius: 16,
			paddingX: 240,
			paddingY: 90,
			fullWidth: false,
			backdropBlur: false,
			stripHeight: 22,
		},
	});

	// Helper to calculate RGBA string from hex color and opacity percentage
	const getEffectiveBgColor = (hex: string, opacity: number = 95) => {
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
	const [existingLocalized, setExistingLocalized] = useState<any>(null);

	useEffect(() => {
		let cancelled = false;
		const checkExisting = async () => {
			try {
				const res = await fetch(
					`/api/localization/process?projectId=${encodeURIComponent(projectId)}`,
				);
				if (!res.ok) return;
				const data = await res.json();
				if (!cancelled && data.success && data.localizedProject) {
					setExistingLocalized(data.localizedProject);
					if (data.localizedProject.subtitles?.length) {
						setPreviewCues(data.localizedProject.subtitles);
						setHasPreviewed(true);
					}
				}
			} catch {
				// Silently ignore
			}
		};
		checkExisting();
		return () => {
			cancelled = true;
		};
	}, [projectId]);

	const updateSubtitleBackground = (
		patch: Partial<typeof subtitleBackground>,
	) => {
		const background = { ...subtitleBackground, ...patch };
		setSubtitleBackground({ value: background });
		const scene = editor.scenes.getActiveSceneOrNull();
		if (!scene) return;
		const tracks = [scene.tracks.main, ...scene.tracks.overlay];
		const effectiveColor = getEffectiveBgColor(
			background.color,
			background.opacity ?? 95,
		);
		const savedCaptionTrack = localStorage.getItem(
			`ai-caption-track-${projectId}`,
		);

		editor.timeline.updateElements({
			updates: tracks.flatMap((track) =>
				track.type === "text"
					? track.elements
							.filter(
								(element) =>
									track.id === savedCaptionTrack ||
									/^Caption(\s+\d+)?$/i.test(element.name) ||
									element.name.toLowerCase().startsWith("caption"),
							)
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
										"background.cornerRadius":
											background.cornerRadius ?? 16,
										"background.blur": background.blur ?? 24,
										"background.fullWidth": background.fullWidth ?? false,
										"background.backdropBlur": background.backdropBlur ?? false,
										"background.stripHeight": background.stripHeight ?? 22,
									},
								},
							}))
					: [],
			),
		});
		void editor.project.saveCurrentProject();
	};

	const selectSubtitleStyle = (value: string) => {
		setSubtitleStyle(value);
		if (value !== "yellow-reference") return;
		updateSubtitleBackground({ enabled: true, fullWidth: true, backdropBlur: true, stripHeight: 10, color: "#000000", opacity: 0, blur: 30, cornerRadius: 0, paddingX: 0, paddingY: 0 });
		const scene = editor.scenes.getActiveSceneOrNull();
		if (!scene) return;
		const savedTrack = localStorage.getItem(`ai-caption-track-${projectId}`);
		editor.timeline.updateElements({ updates: [scene.tracks.main, ...scene.tracks.overlay].flatMap((track) => track.type === "text" ? track.elements.filter((element) => track.id === savedTrack || element.name.toLowerCase().startsWith("caption")).map((element) => ({ trackId: track.id, elementId: element.id, patch: { params: { ...element.params, content: typeof element.params.content === "string" ? element.params.content.replace(/\n/g, " ") : element.params.content, color: "#FFFF00", fontFamily: "Arial", fontWeight: "normal", fontSize: 3.33, textAlign: "center", "stroke.color": "#000000", "stroke.width": 4, "transform.positionX": 0, "transform.positionY": canvasSize.height * 0.44 } } })) : []) });
		void editor.project.saveCurrentProject();
	};

	const addSubtitleCoverStrip = async () => {
		const duration = editor.timeline.getTotalDuration();
		if (duration <= 0) {
			toast.error("Chưa có video trên timeline.");
			return;
		}
		const element = buildGraphicElement({
			definitionId: "rectangle",
			name: "Dải che mờ phụ đề gốc",
			startTime: ZERO_MEDIA_TIME,
			params: {
				fill: "rgba(0, 0, 0, 0.95)",
				strokeWidth: 0,
				"transform.positionY": Math.round(canvasSize.height * 0.38),
				"transform.scaleX": 0.92,
				"transform.scaleY": 0.12,
			},
		});
		const command = new InsertElementCommand({
			element: { ...element, duration },
			placement: { mode: "auto", trackType: "graphic", insertIndex: 0 },
		});
		editor.command.execute({ command });
		const trackId = command.getTrackId();
		if (trackId) {
			editor.selection.setSelectedElements({
				elements: [{ trackId, elementId: command.getElementId() }],
			});
		}
		await editor.project.saveCurrentProject();
		toast.success(
			"Đã thêm dải che mờ phụ đề gốc! Bạn có thể kéo chỉnh vị trí hoặc kích thước trên preview.",
		);
	};
	const [isProcessing, setIsProcessing] = useState(false);
	const [progressStep, setProgressStep] = useState<string | null>(null);
	const activeScene = useEditor((e) => e.scenes.getActiveSceneOrNull());
	// Repair projects saved by the former percentage-as-dB implementation once.
	useEffect(() => {
		if (!activeScene) return;
		const key = `ai-volume-units-v2-${projectId}-${activeScene.id}`;
		const audio = activeScene.tracks.audio.flatMap((track) => track.elements);
		if (localStorage.getItem(key) || !audio.some((e) => e.name.startsWith("voice-")) ||
			!audio.some((e) => e.name.startsWith("ai-background"))) return;
		const tracks = [activeScene.tracks.main, ...activeScene.tracks.overlay, ...activeScene.tracks.audio];
		const sourceIds = new Set(tracks.flatMap((track) => track.elements.filter((e) => e.type === "video").map((e) => e.mediaId)));
		const updates: Parameters<typeof editor.timeline.updateElements>[0]["updates"] = [];
		for (const track of tracks) for (const element of track.elements) {
			if (element.type === "video" || (element.type === "audio" && element.sourceType === "upload" && sourceIds.has(element.mediaId))) {
				updates.push({ trackId: track.id, elementId: element.id, patch: { params: { ...element.params, muted: true } } });
			} else if (element.type === "audio" && (element.name.startsWith("voice-") || element.name.startsWith("ai-background"))) {
				const percent = (typeof element.params.volume === "number" ? element.params.volume : element.name.startsWith("voice-") ? 1 : 0.2) * 100;
				updates.push({ trackId: track.id, elementId: element.id, patch: { params: { ...element.params, ...volumeControlParams(percent) } } });
			}
		}
		editor.timeline.updateElements({ updates });
		localStorage.setItem(key, "true");
		void editor.project.saveCurrentProject();
	}, [activeScene, editor, projectId]);

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
						patch: { params: { ...element.params, ...volumeControlParams(value) } },
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

	const applyLocalizationToTimeline = async (
		localized: any,
		toastId?: string | number,
	) => {
		if (!localized.backgroundAudioUrl) {
			throw new Error("Chưa tách được giọng gốc. Vui lòng thử lại trước khi gắn lồng tiếng.");
		}

		// Update preview cues from result if not already previewed
		if (!hasPreviewed && localized.subtitles) {
			setPreviewCues(localized.subtitles);
			setHasPreviewed(true);
		}

		setProgressStep("Đang tải file âm thanh (nhạc nền & giọng đọc AI)...");
		const prepared = [];
		const segments = [
			...(localized.backgroundAudioUrl
				? [
						{
							id: "ai-background",
							start: 0,
							audioUrl: localized.backgroundAudioUrl,
							duration: localized.source.duration,
						},
					]
				: []),
			...(localized.voiceovers ?? []),
		];

		for (const segment of segments) {
			setProgressStep(
				segment.id === "ai-background"
					? "Đang tải và chuẩn bị file nhạc nền tách tiếng..."
					: "Đang tải track giọng đọc lồng tiếng AI...",
			);
			const audio = await fetch(segment.audioUrl);
			if (!audio.ok) throw new Error("Không thể nạp giọng đọc đã tạo.");
			const file = new File([await audio.blob()], `${segment.id}.wav`, {
				type: "audio/wav",
			});
			const [processed] = await processMediaAssets({ files: [file] });
			const durationSeconds = processed?.duration || segment.duration;
			if (!durationSeconds)
				throw new Error("Không thể đọc file giọng đọc.");
			if (processed && !processed.duration) {
				processed.duration = durationSeconds;
			}
			const asset = await editor.media.addMediaAsset({
				projectId,
				asset: processed,
			});
			if (!asset) throw new Error("Không thể lưu giọng đọc vào dự án.");
			const element = buildElementFromMedia({
				mediaId: asset.id,
				mediaType: "audio",
				name: file.name,
				duration: mediaTimeFromSeconds({
					seconds: Math.min(durationSeconds, segment.duration),
				}),
				startTime: mediaTimeFromSeconds({ seconds: segment.start }),
			});
			Object.assign(
				element.params,
				volumeControlParams(
					segment.id === "ai-background"
						? originalVolume[0]
						: voiceoverVolume[0],
				),
			);
			prepared.push(element);
		}

		setProgressStep("Đang dọn dẹp các track cũ và đưa âm thanh lên timeline...");
		const scene = editor.scenes.getActiveScene();
		const sourceMediaIds = new Set(
			[scene.tracks.main, ...scene.tracks.overlay].flatMap((track) =>
				track.elements
					.filter((e) => e.type === "video")
					.map((e) => e.mediaId),
			),
		);
		const previousCaptionTrack = localStorage.getItem(
			`ai-caption-track-${projectId}`,
		);
		const previousResult = sessionStorage.getItem(`localized_${projectId}`);
		const previousTexts = new Set<string>(
			previousResult
				? (JSON.parse(previousResult).subtitles ?? []).map(
						(sub: { text: string }) =>
							sub.text.replace(/\s+/g, " ").trim(),
					)
				: [],
		);
		const legacyCaptionTracks = new Set(
			scene.tracks.overlay
				.filter(
					(track) =>
						!previousCaptionTrack &&
						track.type === "text" &&
						track.elements.length > 0 &&
						track.elements.every(
							(element) =>
								/^Caption \d+$/.test(element.name) &&
								previousTexts.has(
									String(element.params.content)
										.replace(/\s+/g, " ")
										.trim(),
								),
						),
				)
				.map((track) => track.id),
		);

		// Clean up previous AI audio and captions
		editor.timeline.deleteElements({
			elements: [...scene.tracks.audio, ...scene.tracks.overlay].flatMap(
				(track) =>
					track.elements
						.filter(
							(element) =>
								(element.type === "audio" &&
									(element.name.startsWith("voice-") ||
										element.name.startsWith("ai-background"))) ||
								((track.id === previousCaptionTrack ||
									legacyCaptionTracks.has(track.id)) &&
									element.type === "text"),
						)
						.map((element) => ({
							trackId: track.id,
							elementId: element.id,
						})),
			),
		});

		// If background audio is separated, mute original video track; otherwise duck it to originalVolume
		if (localized.backgroundAudioUrl) {
			editor.timeline.updateElements({
				updates: [
					scene.tracks.main,
					...scene.tracks.overlay,
					...scene.tracks.audio,
				].flatMap((track) =>
					track.elements
						.filter(
							(element) =>
								element.type === "video" ||
								(element.type === "audio" &&
									element.sourceType === "upload" &&
									sourceMediaIds.has(element.mediaId)),
						)
						.map((element) => ({
							trackId: track.id,
							elementId: element.id,
							patch: { params: { ...element.params, muted: true } },
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
		localStorage.setItem(
			`ai-volume-units-v2-${projectId}-${scene.id}`,
			"true",
		);

		// Convert subtitles into OpenCut cues and insert on timeline
		if (localized.subtitles && localized.subtitles.length > 0) {
			setProgressStep("Đang tạo và gắn phụ đề tiếng Việt vào timeline...");
			const cues: SubtitleCue[] = localized.subtitles.map((sub: any) => ({
				text:
					subtitleStyle === "yellow-reference"
						? sub.text.replace(/\n/g, " ")
						: sub.text,
				startTime: sub.start,
				duration: Math.max(0.6, sub.end - sub.start),
				style: {
					fontWeight: subtitleStyle === "bold" ? "bold" : "normal",
					color:
						subtitleStyle === "yellow-reference"
							? "#FFFF00"
							: "#FFFFFF",
					...(subtitleStyle === "yellow-reference"
						? {
								fontSizeRatioOfPlayHeight: 0.037,
								strokeColor: "#000000",
								strokeWidth: 4,
								placement: {
									verticalAlign: "bottom" as const,
									marginVerticalRatio: 0.025,
								},
							}
						: {}),
					background: {
						enabled: subtitleBackground.enabled,
						color: getEffectiveBgColor(
							subtitleBackground.color,
							subtitleBackground.opacity ?? 95,
						),
						paddingX: subtitleBackground.paddingX,
						paddingY: subtitleBackground.paddingY,
						cornerRadius: subtitleBackground.cornerRadius ?? 16,
						blur: subtitleBackground.blur ?? 24,
						fullWidth: subtitleBackground.fullWidth ?? false,
						backdropBlur: subtitleBackground.backdropBlur ?? false,
						stripHeight: subtitleBackground.stripHeight ?? 22,
					},
				},
			}));
			const captionTrack = insertCaptionChunksAsTextTrack({
				editor,
				captions: cues,
			});
			if (captionTrack)
				localStorage.setItem(`ai-caption-track-${projectId}`, captionTrack);
		}

		// Save localized result for export
		sessionStorage.setItem(
			`localized_${projectId}`,
			JSON.stringify(localized),
		);
		await editor.project.saveCurrentProject();

		if (toastId) {
			toast.success("Việt hóa thành công! Đã gắn vào timeline.", {
				id: toastId,
			});
		} else {
			toast.success("Đã gắn bản Việt hóa vào timeline!");
		}

		setProgressStep(
			"Hoàn tất! Phụ đề & giọng đọc đã sẵn sàng trên timeline.",
		);
	};

	const handleLocalize = async (forceRerun = false) => {
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
		setProgressStep("Đang kết nối AI và xử lý lồng tiếng tiếng Việt...");
		const toastId = toast.loading("Đang xử lý Việt hóa video...");

		try {
			const res = await fetch("/api/localization/process", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					projectId,
					videoPath: videoPath || "default",
					voice,
					subtitles:
						hasPreviewed && previewCues.length > 0
							? previewCues
							: undefined,
					force: forceRerun,
				}),
			});

			const data = await res.json();
			if (!data.success) {
				throw new Error(data.error || "Quá trình Việt hóa thất bại");
			}

			const localized = data.localizedProject;
			setExistingLocalized(localized);
			await applyLocalizationToTimeline(localized, toastId);
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
			<p className="text-[11px] text-neutral-400 leading-relaxed">
				Phụ đề chia ngắn để dễ đọc. Giọng đọc được gom theo đoạn liền mạch,
				giữ các khoảng nghỉ và ghép thành một track trên timeline.
			</p>
			<div className="flex flex-col gap-4">
				{/* Voice selector */}
				<div className="flex flex-col gap-2">
					<div className="flex items-center justify-between">
						<Label className="text-xs text-neutral-400">
							Giọng đọc thuyết minh
						</Label>
						<span className="text-[11px] font-mono text-rose-400">
							25 giọng TTS
						</span>
					</div>

					{/* Selected Voice Card */}
					<div
						onClick={() => {
							stopPanelAudio();
							setIsVoicePickerOpen(true);
						}}
						className="group flex flex-col gap-2.5 p-3 rounded-lg border border-neutral-800 bg-neutral-950/80 hover:border-neutral-700 hover:bg-neutral-900/60 transition cursor-pointer select-none"
					>
						<div className="flex items-start justify-between gap-2">
							<div className="flex items-center gap-2.5 min-w-0">
								<div className="size-8 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
									<Mic className="size-4" />
								</div>
								<div className="flex flex-col min-w-0">
									<div className="flex items-center gap-1.5 flex-wrap">
										<span className="font-semibold text-xs text-neutral-100 group-hover:text-white truncate">
											{currentVoiceMeta?.name || voice}
										</span>
										{currentVoiceMeta?.featured && currentVoiceMeta.featured <= 10 && (
											<span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
												⭐ Nổi bật #{currentVoiceMeta.featured}
											</span>
										)}
									</div>
									<span className="text-[10px] text-neutral-400 truncate">
										{currentVoiceMeta?.description || "Giọng đọc AI tự nhiên"}
									</span>
								</div>
							</div>

							{/* Inline Quick Preview Button */}
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={isProcessing}
								onClick={(e) => {
									e.stopPropagation();
									togglePanelVoicePreview();
								}}
								className={cn(
									"h-7 px-2 text-[11px] gap-1 shrink-0 border transition",
									isPanelAudioPlaying
										? "bg-rose-500 text-white border-rose-400 hover:bg-rose-600"
										: isPanelAudioLoading
											? "bg-neutral-800 text-neutral-300 border-neutral-700"
											: "bg-neutral-900 border-neutral-800 text-neutral-200 hover:bg-neutral-800 hover:text-white",
								)}
								title="Nghe thử giọng này"
							>
								{isPanelAudioLoading ? (
									<Loader2 className="size-3 animate-spin text-rose-400" />
								) : isPanelAudioPlaying ? (
									<>
										<Pause className="size-3 fill-white" />
										<span>Dừng</span>
									</>
								) : (
									<>
										<Play className="size-3 fill-rose-400 text-rose-400" />
										<span>Nghe thử</span>
									</>
								)}
							</Button>
						</div>

						{/* Tags + Change voice button */}
						<div className="flex items-center justify-between gap-1.5 pt-2 border-t border-neutral-800/80">
							<div className="flex items-center gap-1 flex-wrap">
								{currentVoiceMeta?.gender && (
									<span
										className={cn(
											"text-[9px] px-1.5 py-0.5 rounded font-medium border",
											currentVoiceMeta.gender === "female"
												? "bg-rose-950/50 text-rose-300 border-rose-800/40"
												: "bg-blue-950/50 text-blue-300 border-blue-800/40",
										)}
									>
										{currentVoiceMeta.gender === "female" ? "Nữ" : "Nam"}
									</span>
								)}
								{currentVoiceMeta?.region && (
									<span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-neutral-900 text-neutral-300 border border-neutral-800">
										Miền {currentVoiceMeta.region}
									</span>
								)}
								{currentVoiceMeta?.style && (
									<span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-neutral-900/80 text-neutral-400 border border-neutral-800/60">
										{currentVoiceMeta.style}
									</span>
								)}
							</div>

							<div className="flex items-center text-[11px] text-rose-400 group-hover:text-rose-300 font-medium gap-0.5">
								<span>Đổi giọng</span>
								<ChevronRight className="size-3" />
							</div>
						</div>
					</div>

					<VoicePickerDialog
						open={isVoicePickerOpen}
						onOpenChange={setIsVoicePickerOpen}
						selectedVoice={voice}
						onSelectVoice={(chosen) => {
							const chosenName = chosen.name || chosen.id;
							setVoice(chosenName);
							if (typeof window !== "undefined") {
								localStorage.setItem(`ai-selected-voice-${projectId}`, chosenName);
							}
							setIsVoicePickerOpen(false);
							stopPanelAudio();
							toast.success(`Đã chọn giọng đọc "${chosenName}"`);
						}}
					/>
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
					<Select value={subtitleStyle} onValueChange={selectSubtitleStyle}>
						<SelectTrigger className="bg-neutral-950 border-neutral-800 text-xs">
							<SelectValue placeholder="Kiểu phụ đề" />
						</SelectTrigger>
						<SelectContent className="bg-neutral-900 border-neutral-800 text-xs">
							<SelectItem value="bold">In đậm (Bold TikTok)</SelectItem>
							<SelectItem value="minimal">Tối giản (Minimal)</SelectItem>
							<SelectItem value="yellow-reference">Chữ vàng viền đen (theo ảnh mẫu)</SelectItem>
						</SelectContent>
					</Select>
					<div className="mt-2 flex items-center justify-between">
						<Button type="button" variant="outline" size="sm" disabled={isProcessing} onClick={() => selectSubtitleStyle("yellow-reference")}>Áp dụng mẫu chữ vàng + nền video mờ</Button>
						<div className="flex items-center gap-2">
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
								className="cursor-pointer text-xs font-medium"
							>
								Nền phụ đề làm mờ (Xóa text / logo gốc)
							</Label>
						</div>
					</div>

					{subtitleBackground.enabled && (
						<div className="flex flex-col gap-3.5 rounded-lg border border-neutral-700 bg-neutral-950/60 p-3">
							<div className="flex items-center gap-2">
								<Checkbox id="subtitle-full-width" checked={subtitleBackground.fullWidth ?? false} disabled={isProcessing} onCheckedChange={(checked) => updateSubtitleBackground({ fullWidth: checked === true })} />
								<Label htmlFor="subtitle-full-width" className="cursor-pointer text-xs">Phủ ngang toàn bộ đáy video</Label>
							</div>
							{subtitleBackground.fullWidth && <div className="flex flex-col gap-1">
								<div className="flex items-center gap-2">
									<Checkbox id="subtitle-backdrop-blur" checked={subtitleBackground.backdropBlur ?? false} disabled={isProcessing} onCheckedChange={(checked) => updateSubtitleBackground({ backdropBlur: checked === true })} />
									<Label htmlFor="subtitle-backdrop-blur" className="text-xs">Làm mờ hình video phía sau chữ</Label>
								</div>
								<Label htmlFor="subtitle-strip-height" className="text-xs">Chiều cao dải nền: {subtitleBackground.stripHeight ?? 22}%</Label>
								<input id="subtitle-strip-height" type="range" min={5} max={50} step={1} value={subtitleBackground.stripHeight ?? 22} disabled={isProcessing} onChange={(event) => updateSubtitleBackground({ stripHeight: Number(event.target.value) })} className="w-full accent-rose-500" />
								<p className="text-[10px] text-neutral-400">Bật làm mờ hình và giảm độ che phủ về 0% để giữ màu video như mẫu.</p>
							</div>}
							{/* Quick Presets */}
							<div className="flex flex-col gap-1.5">
								<span className="text-[11px] font-semibold text-neutral-300">
									Kiểu làm mờ (Presets nhanh)
								</span>
								<div className="grid grid-cols-1 gap-1.5">
									{SUBTITLE_BG_PRESETS.map((preset) => (
										<button
											key={preset.id}
											type="button"
											disabled={isProcessing}
											onClick={() => updateSubtitleBackground(preset.config)}
											className="flex flex-col text-left px-2.5 py-1.5 rounded-md border border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800 hover:border-neutral-700 transition"
										>
											<span className="text-xs font-medium text-neutral-100">
												{preset.name}
											</span>
											<span className="text-[10px] text-neutral-400">
												{preset.desc}
											</span>
										</button>
									))}
								</div>
							</div>

							<div className="flex items-center justify-between border-t border-neutral-800/80 pt-2.5">
								<Label
									htmlFor="subtitle-background-color"
									className="text-xs text-neutral-300"
								>
									Màu sắc nền
								</Label>
								<div className="flex items-center gap-2">
									<input
										id="subtitle-background-color"
										type="color"
										value={subtitleBackground.color}
										disabled={isProcessing}
										onChange={(event) =>
											updateSubtitleBackground({ color: event.target.value })
										}
										className="h-7 w-9 cursor-pointer rounded border border-neutral-700 bg-transparent"
									/>
									<span className="font-mono text-[11px] text-neutral-400">
										{subtitleBackground.color}
									</span>
								</div>
							</div>

							{/* Opacity / Độ đậm che phủ */}
							<div className="flex flex-col gap-1">
								<div className="flex justify-between text-xs">
									<Label htmlFor="subtitle-opacity" className="text-xs text-neutral-300">
										Độ che phủ (Opacity)
									</Label>
									<span className="font-mono text-neutral-400">
										{subtitleBackground.opacity ?? 95}%
									</span>
								</div>
								<input
									type="range"
									className="w-full accent-rose-500"
									id="subtitle-opacity"
									aria-label="Độ che phủ"
									min={0}
									max={100}
									step={1}
									disabled={isProcessing}
									value={subtitleBackground.opacity ?? 95}
									onChange={(event) =>
										updateSubtitleBackground({
											opacity: Number(event.target.value),
										})
									}
								/>
								<span className="text-[10px] text-neutral-500">
									90–100% giúp che sạch chữ và logo gốc phía sau.
								</span>
							</div>

							{/* Blur / Nhòe mờ viền */}
							<div className="flex flex-col gap-1">
								<div className="flex justify-between text-xs">
									<Label htmlFor="subtitle-blur" className="text-xs text-neutral-300">
										Độ nhòe mờ viền (Blur)
									</Label>
									<span className="font-mono text-neutral-400">
										{subtitleBackground.blur ?? 24}px
									</span>
								</div>
								<input
									type="range"
									className="w-full accent-rose-500"
									id="subtitle-blur"
									aria-label="Độ nhòe mờ viền"
									min={0}
									max={60}
									step={2}
									disabled={isProcessing}
									value={subtitleBackground.blur ?? 24}
									onChange={(event) =>
										updateSubtitleBackground({
											blur: Number(event.target.value),
										})
									}
								/>
								<span className="text-[10px] text-neutral-500">
									Làm mờ chuyển tiếp viền mềm mại như tính năng xóa logo.
								</span>
							</div>

							{/* Corner Radius */}
							<div className="flex flex-col gap-1">
								<div className="flex justify-between text-xs">
									<Label
										htmlFor="subtitle-corner-radius"
										className="text-xs text-neutral-300"
									>
										Bo tròn góc
									</Label>
									<span className="font-mono text-neutral-400">
										{subtitleBackground.cornerRadius ?? 16}%
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
									value={subtitleBackground.cornerRadius ?? 16}
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
									<Label
										htmlFor="subtitle-padding-x"
										className="text-xs text-neutral-300"
									>
										Mở rộng nền ngang (Padding X)
									</Label>
									<span className="font-mono text-neutral-400">
										{subtitleBackground.paddingX}px
									</span>
								</div>
								<input
									type="range"
									className="w-full accent-rose-500"
									id="subtitle-padding-x"
									aria-label="Mở rộng nền ngang"
									min={0}
									max={700}
									step={10}
									disabled={isProcessing}
									value={subtitleBackground.paddingX}
									onChange={(event) =>
										updateSubtitleBackground({
											paddingX: Number(event.target.value),
										})
									}
								/>
								<span className="text-[10px] text-neutral-500">
									Mở rộng thêm sang 2 bên để che hết các câu chữ gốc dài.
								</span>
							</div>

							{/* Padding Y */}
							<div className="flex flex-col gap-1">
								<div className="flex justify-between text-xs">
									<Label
										htmlFor="subtitle-padding-y"
										className="text-xs text-neutral-300"
									>
										Mở rộng nền dọc (Padding Y)
									</Label>
									<span className="font-mono text-neutral-400">
										{subtitleBackground.paddingY}px
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

							<div className="flex flex-col gap-2 border-t border-neutral-800/80 pt-2.5">
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={isProcessing}
									onClick={() => {
										updateSubtitleBackground({});
										toast.success(
											"Đã đồng bộ nền mờ cho toàn bộ phụ đề trên timeline!",
										);
									}}
									className="w-full text-xs h-7 border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200"
								>
									🔄 Đồng bộ nền cho tất cả phụ đề
								</Button>

								<Button
									type="button"
									variant="secondary"
									size="sm"
									disabled={isProcessing}
									onClick={addSubtitleCoverStrip}
									className="w-full text-xs h-7 bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
								>
									✨ Thêm dải mờ che phụ đề gốc suốt video
								</Button>
							</div>
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
									Phụ đề ({previewCues.length} đoạn)
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

			{/* Existing Localized Quick Apply Banner */}
			{existingLocalized && !isProcessing && (
				<div className="flex flex-col gap-2 p-3 bg-emerald-950/40 rounded-lg border border-emerald-800/60 text-xs">
					<div className="flex items-center justify-between text-emerald-400 font-semibold">
						<span className="flex items-center gap-1.5">
							<span>🎉</span> Bản Việt hóa đã sẵn sàng
						</span>
						<span className="text-[10px] bg-emerald-900/60 text-emerald-300 px-1.5 py-0.5 rounded font-mono">
							Đã tạo xong
						</span>
					</div>
					<p className="text-[11px] text-neutral-300 leading-relaxed">
						Video này đã có nhạc nền tách tiếng và giọng đọc AI hoàn tất trên máy chủ. Bạn có thể gắn thẳng vào timeline ngay lập tức!
					</p>
					<Button
						type="button"
						size="sm"
						disabled={isProcessing}
						onClick={async () => {
							setIsProcessing(true);
							const toastId = toast.loading("Đang gắn bản Việt hóa vào timeline...");
							try {
								await applyLocalizationToTimeline(existingLocalized, toastId);
							} catch (e: any) {
								toast.error(e.message || "Lỗi khi gắn timeline", { id: toastId });
								setProgressStep(null);
							} finally {
								setIsProcessing(false);
							}
						}}
						className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs h-8 shadow"
					>
						⚡ Gắn vào Timeline ngay
					</Button>
				</div>
			)}

			{/* Primary Action Button */}
			<Button
				disabled={isProcessing || isPreviewing}
				onClick={() => handleLocalize(Boolean(existingLocalized))}
				className="w-full bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white font-medium text-xs py-5 shadow-lg shadow-rose-900/20"
			>
				<HugeiconsIcon icon={SparklesIcon} className="size-4 mr-2" />
				{isProcessing
					? "Đang xử lý..."
					: existingLocalized
						? "🔄 Tạo lại bản Việt hóa mới"
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
