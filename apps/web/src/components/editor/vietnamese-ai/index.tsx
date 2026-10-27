"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { volumeControlParams } from "./volume-control";
import { SparklesIcon, PreviousIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ChevronRight, Loader2, Mic, Pause, Play, ScanEye, Languages, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
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
import { mediaTimeFromSeconds, mediaTimeToSeconds, ZERO_MEDIA_TIME } from "@/wasm";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocalStorage } from "@/services/storage/use-local-storage";
import { VoicePickerDialog } from "./voice-picker-dialog";
import { VIENEU_PRESET_VOICES } from "@/providers/tts/voices";
import { cn } from "@/utils/ui";
import { BackgroundMusicSection } from "./background-music";

interface Props {
	projectId: string;
}

interface PreviewCue {
	id: string;
	start: number;
	end: number;
	text: string;
}

function seedGlobalSettingKey(
	globalKey: string,
	legacyPrefix: string,
	projectId: string,
) {
	if (typeof window === "undefined") return;
	try {
		if (localStorage.getItem(globalKey) !== null) return;
		const legacyCurrent = localStorage.getItem(`${legacyPrefix}-${projectId}`);
		if (legacyCurrent !== null) {
			localStorage.setItem(globalKey, legacyCurrent);
			return;
		}
		const legacyBv = localStorage.getItem(`${legacyPrefix}-BV17FwzePEpL`);
		if (legacyBv !== null) {
			localStorage.setItem(globalKey, legacyBv);
		}
	} catch {
		// Ignore storage errors
	}
}

export function VietnameseAiPanel({ projectId }: Props) {
	const editor = useEditor();
	const canvasSize = useEditor(
		(e) => e.project.getActive().settings.canvasSize,
	);
	useState(() => {
		seedGlobalSettingKey(
			"ai-global-subtitle-text-color",
			"subtitle-text-color",
			projectId,
		);
		seedGlobalSettingKey(
			"ai-global-subtitle-font-size",
			"subtitle-font-size",
			projectId,
		);
		seedGlobalSettingKey(
			"ai-global-subtitle-position-y",
			"subtitle-position-y",
			projectId,
		);
		seedGlobalSettingKey(
			"ai-global-subtitle-position-x",
			"subtitle-position-x",
			projectId,
		);
		seedGlobalSettingKey(
			"ai-global-subtitle-background",
			"subtitle-background",
			projectId,
		);
		seedGlobalSettingKey(
			"ai-global-subtitle-max-lines",
			"subtitle-max-lines",
			projectId,
		);
		return true;
	});

	const [voice, setVoice] = useState(() => {
		if (typeof window !== "undefined") {
			const saved =
				localStorage.getItem("ai-global-selected-voice") ??
				localStorage.getItem(`ai-selected-voice-${projectId}`) ??
				localStorage.getItem("ai-selected-voice-BV17FwzePEpL");
			if (saved) {
				localStorage.setItem("ai-global-selected-voice", saved);
				return saved;
			}
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
	const defaultBaselineY = Math.round(canvasSize.height * 0.44); // ~845px on 1920

	const [originalVolume, setOriginalVolume] = useLocalStorage<number[]>({
		key: "ai-global-original-volume",
		defaultValue: [20],
	});
	const [voiceoverVolume, setVoiceoverVolume] = useLocalStorage<number[]>({
		key: "ai-global-voiceover-volume",
		defaultValue: [100],
	});

	const [subtitleTextColor, setSubtitleTextColor] = useLocalStorage({
		key: "ai-global-subtitle-text-color",
		defaultValue: "#FFFF00",
	});
	const [subtitleFontSize, setSubtitleFontSize] = useLocalStorage({
		key: "ai-global-subtitle-font-size",
		defaultValue: 3.5,
	});
	const [subtitlePositionY, setSubtitlePositionY] = useLocalStorage({
		key: "ai-global-subtitle-position-y",
		defaultValue: defaultBaselineY,
	});
	const [subtitlePositionX, setSubtitlePositionX] = useLocalStorage({
		key: "ai-global-subtitle-position-x",
		defaultValue: 0,
	});

	const [subtitleMaxLines, setSubtitleMaxLines] = useLocalStorage<number>({
		key: "ai-global-subtitle-max-lines",
		defaultValue: 2,
	});

	const [subtitleBackground, setSubtitleBackground, isSubtitleBgReady] = useLocalStorage({
		key: "ai-global-subtitle-background",
		defaultValue: {
			enabled: true,
			color: "#000000",
			opacity: 0,
			blur: 30,
			cornerRadius: 12,
			paddingX: 0,
			paddingY: 0,
			fullWidth: true,
			backdropBlur: true,
			stripHeight: 12,
			stripWidth: 88,
		},
	});

	// Helper to calculate RGBA string from hex color and opacity percentage
	const getEffectiveBgColor = (hex: string, opacity: number = 0) => {
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
					`/api/localization/process?projectId=${encodeURIComponent(projectId)}&mode=dubbing`,
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

	const updateSubtitleLayout = (patch: {
		fontSize?: number;
		positionY?: number;
		positionX?: number;
		textColor?: string;
		maxLines?: number;
		background?: Partial<typeof subtitleBackground>;
	}) => {
		const nextFontSize = patch.fontSize ?? subtitleFontSize;
		const nextPosY = patch.positionY ?? subtitlePositionY;
		const nextPosX = patch.positionX ?? subtitlePositionX;
		const nextColor = patch.textColor ?? subtitleTextColor;
		const nextMaxLines = patch.maxLines ?? subtitleMaxLines;
		const nextBg = patch.background
			? { ...subtitleBackground, ...patch.background }
			: subtitleBackground;

		if (patch.fontSize !== undefined) setSubtitleFontSize({ value: nextFontSize });
		if (patch.positionY !== undefined) setSubtitlePositionY({ value: nextPosY });
		if (patch.positionX !== undefined) setSubtitlePositionX({ value: nextPosX });
		if (patch.textColor !== undefined) setSubtitleTextColor({ value: nextColor });
		if (patch.maxLines !== undefined) setSubtitleMaxLines({ value: nextMaxLines });
		if (patch.background !== undefined) setSubtitleBackground({ value: nextBg });

		if (nextMaxLines === 1) {
			setPreviewCues((prev) =>
				prev.map((c) => ({ ...c, text: c.text.replace(/\n/g, " ").trim() })),
			);
		}

		const scene = editor.scenes.getActiveSceneOrNull();
		if (!scene) return;
		const tracks = [scene.tracks.main, ...scene.tracks.overlay];
		const savedCaptionTrack = localStorage.getItem(`ai-caption-track-${projectId}`);
		const effectiveColor = getEffectiveBgColor(nextBg.color, nextBg.opacity ?? 0);
		const offsetY = nextPosY - defaultBaselineY;

		editor.timeline.updateElements({
			updates: tracks.flatMap((track) => {
				if (track.type !== "text") return [];
				const captionElements = track.elements
					.filter(
						(element) =>
							track.id === savedCaptionTrack ||
							/^Caption(\s+\d+)?$/i.test(element.name) ||
							element.name.toLowerCase().startsWith("caption"),
					)
					.slice()
					.sort((a, b) => a.startTime - b.startTime);
				const totalDurationSec = mediaTimeToSeconds({
					time: editor.timeline.getTotalDuration(),
				});

				return captionElements.map((element, idx) => {
					const nextEl = captionElements[idx + 1];
					const startSec = mediaTimeToSeconds({ time: element.startTime });
					const durSec = mediaTimeToSeconds({ time: element.duration });
					const endSec = startSec + durSec;
					const maxEndSec = nextEl
						? mediaTimeToSeconds({ time: nextEl.startTime })
						: Math.max(endSec, totalDurationSec);
					const gap = Math.max(0, maxEndSec - endSec);
					const alreadyExtended =
						element.params["background.tailHoldApplied"] === true;
					const tailHold =
						!alreadyExtended && gap > 0.02
							? gap <= 0.7
								? gap
								: Math.min(0.55, gap)
							: 0;

					return {
						trackId: track.id,
						elementId: element.id,
						patch: {
							...(tailHold > 0
								? {
										duration: mediaTimeFromSeconds({
											seconds: durSec + tailHold,
										}),
									}
								: {}),
							params: {
								...element.params,
								content:
									nextMaxLines === 1
										? String(element.params.content).replace(/\n/g, " ").trim()
										: element.params.content,
								fontSize: nextFontSize,
								color: nextColor,
								textAlign: "center",
								"subtitle.maxLines": nextMaxLines,
								"stroke.color": "#000000",
								"stroke.width": 4,
								"transform.positionX": nextPosX,
								"transform.positionY": nextPosY,
								"background.enabled": nextBg.enabled,
								"background.color": effectiveColor,
								"background.paddingX": nextBg.paddingX ?? 0,
								"background.paddingY": nextBg.paddingY ?? 0,
								"background.cornerRadius": nextBg.cornerRadius ?? 12,
								"background.blur": nextBg.blur ?? 30,
								"background.fullWidth": nextBg.fullWidth ?? true,
								"background.backdropBlur": nextBg.backdropBlur ?? true,
								"background.stripHeight": nextBg.stripHeight ?? 12,
								"background.stripWidth": nextBg.stripWidth ?? 88,
								"background.offsetY": offsetY,
								"background.tailHoldApplied": true,
							},
						},
					};
				});
			}),
		});
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

	const syncedSceneRef = useRef<string | null>(null);
	useEffect(() => {
		if (!activeScene || !isSubtitleBgReady) return;
		if (syncedSceneRef.current === activeScene.id) return;
		syncedSceneRef.current = activeScene.id;
		updateSubtitleLayout({});
		const tracks = [
			activeScene.tracks.main,
			...activeScene.tracks.overlay,
			...activeScene.tracks.audio,
		];
		const hasAiBackground = tracks.some((track) =>
			track.elements.some(
				(element) => element.type === "audio" && element.name.startsWith("ai-background"),
			),
		);
		applyVolume("original", hasAiBackground ? (originalVolume[0] ?? 20) : 100);
		applyVolume("voice", voiceoverVolume[0] ?? 100);
	}, [activeScene, isSubtitleBgReady]);

	const applyVolume = (kind: "original" | "voice", value: number) => {
		const scene = editor.scenes.getActiveScene();
		const tracks = [
			scene.tracks.main,
			...scene.tracks.overlay,
			...scene.tracks.audio,
		];
		const hasAiBackground = tracks.some((track) =>
			track.elements.some(
				(element) => element.type === "audio" && element.name.startsWith("ai-background"),
			),
		);
		editor.timeline.updateElements({
			updates: tracks.flatMap((track) =>
				track.elements
					.filter((element) => {
						if (kind === "voice") {
							return element.type === "audio" && element.name.startsWith("voice-");
						}
						// kind === "original"
						if (hasAiBackground) {
							return element.type === "audio" && element.name.startsWith("ai-background");
						}
						return element.type === "video";
					})
					.map((element) => ({
						trackId: track.id,
						elementId: element.id,
						patch: { params: { ...element.params, ...volumeControlParams(value) } },
					})),
			),
		});
	};

	const getNarrationSelection = () => {
		const scene = editor.scenes.getActiveScene();
		const videos = [scene.tracks.main, ...scene.tracks.overlay].flatMap((track) => track.elements.filter((element) => element.type === "video"));
		const selected = editor.selection.getSelectedElements();
		const selectedVideos = videos.filter((element) => selected.some((ref) => ref.elementId === element.id));
		const video = selectedVideos.length === 1 ? selectedVideos[0] : videos.length === 1 ? videos[0] : null;
		if (!video) throw new Error("Chọn một video trên timeline để tạo thuyết minh.");
		if (video.retime) throw new Error("Video đã đổi tốc độ. Xuất video rồi nhập lại trước khi tạo thuyết minh.");
		const asset = editor.media.getAssets().find((item) => item.id === video.mediaId);
		if (!asset?.file) throw new Error("Không tìm thấy file video trên timeline.");
		const start = mediaTimeToSeconds({ time: video.trimStart });
		const duration = mediaTimeToSeconds({ time: video.duration });
		const timelineStart = mediaTimeToSeconds({ time: video.startTime });
		const signature = JSON.stringify([scene.id, video.id, video.mediaId, start, duration, timelineStart, asset.file.size, asset.file.lastModified]);
		return { asset, start, duration, timelineStart, signature, elementId: video.id };
	};

	const handlePreview = async (force: boolean = false, overrideMaxLines?: number) => {
		const importedDataStr = sessionStorage.getItem(
			`imported_video_${projectId}`,
		);
		let videoPath = "";
		if (importedDataStr) {
			const data = JSON.parse(importedDataStr);
			videoPath = data.localMediaPath;
		}

		const effectiveMaxLines = overrideMaxLines ?? subtitleMaxLines;
		setIsPreviewing(true);
		setProgressStep(
			`Đang nhận diện lời thoại & tạo kịch bản phụ đề (tối đa ${effectiveMaxLines} dòng)...`,
		);
		const toastId = toast.loading("Đang trích xuất & tạo phụ đề xem trước...");

		try {
			const res = await fetch("/api/localization/preview", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					projectId,
					videoPath: videoPath || "default",
					mode: "dubbing",
					force,
					maxLines: effectiveMaxLines,
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
			toast.success(`Đã tạo ${cues.length} đoạn phụ đề (tối đa ${effectiveMaxLines} dòng)!`, { id: toastId });
			setProgressStep(
				`Sẵn sàng xem trước: ${cues.length} câu phụ đề (tối đa ${effectiveMaxLines} dòng). Bạn có thể chỉnh sửa trước khi tạo giọng.`,
			);
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
		const narrationId = localized.sourceElementId ?? projectId;
		const captionStorageKey = localized.mode === "narration" ? `ai-narration-caption-track-${projectId}-${narrationId}` : `ai-caption-track-${projectId}`;
		const resultStorageKey = localized.mode === "narration" ? `narrated_${projectId}_${narrationId}` : `localized_${projectId}`;
		if (localized.mode === "narration" && localized.sourceSignature !== getNarrationSelection().signature) {
			throw new Error("Video hoặc vị trí trên timeline đã thay đổi. Vui lòng phân tích lại.");
		}
		if (localized.mode !== "narration" && !localized.backgroundAudioUrl) {
			throw new Error("Chưa tách được giọng gốc. Vui lòng thử lại trước khi gắn lồng tiếng.");
		}

		// Update preview cues from result if not already previewed
		if (localized.mode !== "narration" && !hasPreviewed && localized.subtitles) {
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
			const fileName = localized.mode === "narration" ? `voice-narration-${narrationId}-${segment.id}.wav` : `${segment.id}.wav`;
			const file = new File([await audio.blob()], fileName, {
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
				startTime: mediaTimeFromSeconds({ seconds: segment.start + (localized.timelineStart ?? 0) }),
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
		if (localized.mode === "narration" && localized.sourceSignature !== getNarrationSelection().signature)
			throw new Error("Video hoặc vị trí trên timeline đã thay đổi. Vui lòng phân tích lại.");
		const scene = editor.scenes.getActiveScene();
		const sourceMediaIds = new Set(
			[scene.tracks.main, ...scene.tracks.overlay].flatMap((track) =>
				track.elements
					.filter((e) => e.type === "video")
					.map((e) => e.mediaId),
			),
		);
		const previousCaptionTrack = localStorage.getItem(
			captionStorageKey,
		);
		const previousResult = sessionStorage.getItem(resultStorageKey);
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
									(localized.mode === "narration"
										? element.name.startsWith(`voice-narration-${narrationId}-`)
										: element.name.startsWith("voice-") || element.name.startsWith("ai-background"))) ||
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
			const offsetY = subtitlePositionY - defaultBaselineY;
			const rawSubs = localized.subtitles;
			const cues: SubtitleCue[] = rawSubs.map((sub: any, idx: number) => {
				const nextSub = rawSubs[idx + 1];
				const videoEnd = localized.source?.duration ?? sub.end + 0.6;
				const maxEnd = nextSub ? nextSub.start : Math.max(sub.end, videoEnd);
				const gap = Math.max(0, maxEnd - sub.end);
				// Hold the last subtitle of each segment slightly longer so the original Chinese subtitle disappears first
				const tailHold =
					gap > 0.02
						? gap <= 0.7
							? gap
							: Math.min(0.55, gap)
						: 0;
				const effectiveEnd = sub.end + tailHold;

				return {
					text:
						subtitleMaxLines === 1
							? sub.text.replace(/\s+/g, " ").trim()
							: sub.text.replace(/\r\n/g, "\n"),
					startTime: sub.start + (localized.timelineStart ?? 0),
					duration: Math.max(0.6, effectiveEnd - sub.start),
					style: {
						fontWeight: "bold",
						fontFamily: "Arial",
						color: subtitleTextColor,
						strokeColor: "#000000",
						strokeWidth: 4,
						fontSize: subtitleFontSize,
						maxLines: subtitleMaxLines,
						positionX: subtitlePositionX,
						positionY: subtitlePositionY,
						placement: {
							verticalAlign: "bottom" as const,
							marginVerticalRatio: Math.max(
								0.01,
								(canvasSize.height / 2 - subtitlePositionY) / canvasSize.height,
							),
						},
						background: {
							enabled: subtitleBackground.enabled,
							color: getEffectiveBgColor(
								subtitleBackground.color,
								subtitleBackground.opacity ?? 0,
							),
							paddingX: subtitleBackground.paddingX ?? 0,
							paddingY: subtitleBackground.paddingY ?? 0,
							cornerRadius: subtitleBackground.cornerRadius ?? 12,
							blur: subtitleBackground.blur ?? 30,
							fullWidth: subtitleBackground.fullWidth ?? true,
							backdropBlur: subtitleBackground.backdropBlur ?? true,
							stripHeight: subtitleBackground.stripHeight ?? 12,
							stripWidth: subtitleBackground.stripWidth ?? 88,
							offsetY,
						},
					},
				};
			});
			const captionTrack = insertCaptionChunksAsTextTrack({
				editor,
				captions: cues,
			});
			if (captionTrack)
				localStorage.setItem(captionStorageKey, captionTrack);
		}

		// Save localized result for export
		sessionStorage.setItem(
			resultStorageKey,
			JSON.stringify(localized),
		);
		await editor.project.saveCurrentProject();

		if (toastId) {
			toast.success(localized.mode === "narration" ? "Đã thêm thuyết minh vào timeline." : "Việt hóa thành công! Đã gắn vào timeline.", {
				id: toastId,
			});
		} else {
			toast.success(localized.mode === "narration" ? "Đã thêm thuyết minh vào timeline." : "Đã gắn bản Việt hóa vào timeline!");
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
					mode: "dubbing",
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
				<div className="flex items-center gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => editor.playback.seek({ time: ZERO_MEDIA_TIME })}
						className="h-6 px-2 text-[10px] gap-1 border-neutral-700 bg-neutral-950 text-neutral-300 hover:text-white hover:bg-neutral-800"
						title="Chuyển playhead về 0 giây (Đầu timeline)"
					>
						<HugeiconsIcon icon={PreviousIcon} className="size-3" />
						Về 0s
					</Button>
					<span className="text-[11px] font-mono bg-rose-950 text-rose-300 px-2 py-0.5 rounded border border-rose-800/40">
						{canvasSize.width} × {canvasSize.height}
					</span>
				</div>
			</div>

			<div className="flex items-center gap-1.5 text-xs font-medium">
				<Languages className="size-3.5" />
				Lồng tiếng
			</div>
			<BackgroundMusicSection key={projectId} projectId={projectId} disabled={isProcessing || isPreviewing} />
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
							Giọng lồng tiếng
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
								localStorage.setItem("ai-global-selected-voice", chosenName);
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
							setOriginalVolume({ value });
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
							setVoiceoverVolume({ value });
							applyVolume("voice", value[0]);
						}}
						min={0}
						max={150}
						step={5}
						className="py-1"
					/>
				</div>

				{/* Subtitle Configuration - Auto: Chữ vàng + Nền video mờ */}
				<div className="flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-950/10 p-3">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<span className="flex size-2 rounded-full bg-amber-400 animate-pulse" />
							<Label className="text-xs font-semibold text-amber-200">
								Phụ đề tự động (Chữ vàng + Nền video mờ)
							</Label>
						</div>
						<div className="flex items-center gap-1.5">
							<Checkbox
								id="subtitle-backdrop-blur"
								checked={subtitleBackground.enabled && subtitleBackground.backdropBlur}
								disabled={isProcessing}
								onCheckedChange={(checked) =>
									updateSubtitleLayout({
										background: {
											enabled: checked === true,
											backdropBlur: checked === true,
											fullWidth: true,
										},
									})
								}
							/>
							<Label
								htmlFor="subtitle-backdrop-blur"
								className="cursor-pointer text-[11px] text-neutral-300"
							>
								Nền mờ
							</Label>
						</div>
					</div>

					<p className="text-[11px] text-neutral-400 leading-snug">
						Dải che mờ tách rời khỏi đáy video, tùy chỉnh tự do chiều cao và độ rộng 2 bên. Text tiêu đề/phụ đề luôn nằm gọn và căn giữa chính tâm dải mờ.
					</p>

					{/* 1. Cỡ chữ (Font Size) */}
					<div className="flex flex-col gap-1.5 border-t border-neutral-800/80 pt-2.5">
						<div className="flex justify-between items-center text-xs">
							<Label htmlFor="subtitle-font-size" className="text-xs font-medium text-neutral-300">
								Cỡ chữ (Font Size)
							</Label>
							<div className="flex items-center gap-1.5">
								<span className="font-mono text-xs font-semibold text-amber-300 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/50">
									{subtitleFontSize}
								</span>
							</div>
						</div>
						<input
							type="range"
							id="subtitle-font-size"
							min={2.0}
							max={6.5}
							step={0.1}
							disabled={isProcessing}
							value={subtitleFontSize}
							onChange={(e) => updateSubtitleLayout({ fontSize: Number(e.target.value) })}
							className="w-full accent-amber-400"
						/>
						<div className="flex gap-1.5">
							{[
								{ label: "Nhỏ (2.8)", size: 2.8 },
								{ label: "Chuẩn (3.5)", size: 3.5 },
								{ label: "Lớn (4.2)", size: 4.2 },
								{ label: "Rất to (5.0)", size: 5.0 },
							].map((p) => (
								<button
									key={p.size}
									type="button"
									disabled={isProcessing}
									onClick={() => updateSubtitleLayout({ fontSize: p.size })}
									className={cn(
										"flex-1 py-1 text-[10px] rounded border transition",
										subtitleFontSize === p.size
											? "border-amber-500 bg-amber-950/60 text-amber-200 font-semibold"
											: "border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:bg-neutral-800"
									)}
								>
									{p.label}
								</button>
							))}
						</div>
					</div>

					{/* 1.1. Số dòng tối đa của phụ đề */}
					<div className="flex flex-col gap-1.5 border-t border-neutral-800/80 pt-2.5">
						<div className="flex justify-between items-center text-xs">
							<Label className="text-xs font-medium text-neutral-300">
								Số dòng tối đa (Max Lines)
							</Label>
							<div className="flex items-center gap-1.5">
								<span className="text-[11px] text-neutral-400">Nhập:</span>
								<input
									type="number"
									min={1}
									max={4}
									value={subtitleMaxLines}
									disabled={isProcessing}
									onChange={(e) => {
										const val = Math.max(1, Math.min(4, parseInt(e.target.value, 10) || 1));
										updateSubtitleLayout({ maxLines: val });
									}}
									className="w-12 h-6 text-center font-mono text-xs font-semibold bg-neutral-900 border border-neutral-700 rounded text-amber-300 focus:outline-none focus:border-amber-400"
								/>
								<span className="text-xs font-medium text-amber-300">dòng</span>
							</div>
						</div>
						<div className="flex gap-1.5">
							{[
								{ label: "1 dòng (Đều đẹp)", lines: 1 },
								{ label: "2 dòng (Chuẩn)", lines: 2 },
								{ label: "3 dòng (Dài)", lines: 3 },
							].map((p) => (
								<button
									key={p.lines}
									type="button"
									disabled={isProcessing}
									onClick={() => updateSubtitleLayout({ maxLines: p.lines })}
									className={cn(
										"flex-1 py-1 text-[10px] rounded border transition",
										subtitleMaxLines === p.lines
											? "border-amber-500 bg-amber-950/60 text-amber-200 font-semibold"
											: "border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:bg-neutral-800",
									)}
								>
									{p.label}
								</button>
							))}
						</div>
						<p className="text-[10px] text-neutral-500">
							{subtitleMaxLines === 1
								? "Mọi câu phụ đề đều chỉ 1 dòng duy nhất, phông chữ đồng nhất 100% không bị khác cỡ."
								: subtitleMaxLines === 2
									? "Phụ đề ngắt tối đa 2 dòng cân đối, phông chữ giữ nguyên kích thước không bị lệch."
									: "Cho phép phụ đề ngắt tới 3 dòng khi giải thích nội dung dài."}
						</p>
					</div>

					{/* 2. Vị trí dọc khung phụ đề (Top / Bottom - Lên / Xuống) */}
					<div className="flex flex-col gap-1.5 border-t border-neutral-800/80 pt-2.5">
						<div className="flex justify-between items-center text-xs">
							<Label htmlFor="subtitle-pos-y" className="text-xs font-medium text-neutral-300">
								Vị trí dọc (Lên ⬆ / Xuống ⬇)
							</Label>
							<span className="font-mono text-[11px] text-neutral-400">
								Cách đáy: {Math.max(0, Math.round(canvasSize.height / 2 - subtitlePositionY))}px
							</span>
						</div>
						<p className="text-[10px] text-neutral-400">
							Dịch cả dải che mờ & phụ đề lên/xuống (dải mờ nổi độc lập, không bắt buộc kéo dài từ đáy).
						</p>
						<input
							type="range"
							id="subtitle-pos-y"
							min={Math.round(-canvasSize.height * 0.35)}
							max={Math.round(canvasSize.height * 0.46)}
							step={5}
							disabled={isProcessing}
							value={subtitlePositionY}
							onChange={(e) => updateSubtitleLayout({ positionY: Number(e.target.value) })}
							className="w-full accent-amber-400"
						/>
						<div className="flex gap-1.5">
							<button
								type="button"
								disabled={isProcessing}
								onClick={() => updateSubtitleLayout({ positionY: Math.round(canvasSize.height * 0.46) })}
								className="flex-1 py-1 text-[10px] rounded border border-neutral-800 bg-neutral-900/60 hover:bg-neutral-800 text-neutral-300 transition"
							>
								⬇ Sát đáy (~75px)
							</button>
							<button
								type="button"
								disabled={isProcessing}
								onClick={() => updateSubtitleLayout({ positionY: Math.round(canvasSize.height * 0.44) })}
								className={cn(
									"flex-1 py-1 text-[10px] rounded border transition",
									Math.abs(subtitlePositionY - defaultBaselineY) < 10
										? "border-amber-500 bg-amber-950/60 text-amber-200 font-semibold"
										: "border-neutral-800 bg-neutral-900/60 text-neutral-300 hover:bg-neutral-800"
								)}
							>
								🎯 Chuẩn (~115px)
							</button>
							<button
								type="button"
								disabled={isProcessing}
								onClick={() => updateSubtitleLayout({ positionY: Math.round(canvasSize.height * 0.38) })}
								className="flex-1 py-1 text-[10px] rounded border border-neutral-800 bg-neutral-900/60 hover:bg-neutral-800 text-neutral-300 transition"
							>
								⬆ Nâng cao (~230px)
							</button>
						</div>
					</div>

					{/* 3. Vị trí ngang (Left / Right - Trái / Phải) */}
					<div className="flex flex-col gap-1.5 border-t border-neutral-800/80 pt-2.5">
						<div className="flex justify-between items-center text-xs">
							<Label htmlFor="subtitle-pos-x" className="text-xs font-medium text-neutral-300">
								Vị trí ngang (Trái ⬅ / Phải ➡)
							</Label>
							<div className="flex items-center gap-2">
								<span className="font-mono text-[11px] text-neutral-400">
									{subtitlePositionX === 0 ? "Chính giữa (0)" : `${subtitlePositionX > 0 ? "+" : ""}${subtitlePositionX}px`}
								</span>
								{subtitlePositionX !== 0 && (
									<button
										type="button"
										onClick={() => updateSubtitleLayout({ positionX: 0 })}
										className="text-[10px] text-amber-400 hover:underline"
									>
										Căn giữa
									</button>
								)}
							</div>
						</div>
						<input
							type="range"
							id="subtitle-pos-x"
							min={-300}
							max={300}
							step={5}
							disabled={isProcessing}
							value={subtitlePositionX}
							onChange={(e) => updateSubtitleLayout({ positionX: Number(e.target.value) })}
							className="w-full accent-amber-400"
						/>
					</div>

					{/* 4. Khung dải nền mờ (Chiều rộng 2 bên, Chiều cao & Độ nhòe) */}
					{subtitleBackground.enabled && (
						<div className="flex flex-col gap-2 border-t border-neutral-800/80 pt-2.5">
							<div className="flex justify-between items-center text-xs">
								<Label htmlFor="subtitle-strip-width" className="text-xs font-medium text-neutral-300">
									Chiều rộng 2 bên dải mờ
								</Label>
								<span className="font-mono text-neutral-400">
									{subtitleBackground.stripWidth ?? 88}%
								</span>
							</div>
							<input
								type="range"
								id="subtitle-strip-width"
								min={25}
								max={100}
								step={1}
								disabled={isProcessing}
								value={subtitleBackground.stripWidth ?? 88}
								onChange={(e) =>
									updateSubtitleLayout({
										background: { stripWidth: Number(e.target.value) },
									})
								}
								className="w-full accent-amber-400"
							/>
							<div className="flex gap-1.5">
								{[
									{ label: "Gọn (65%)", width: 65 },
									{ label: "Chuẩn (88%)", width: 88 },
									{ label: "Full ngang (100%)", width: 100 },
								].map((p) => (
									<button
										key={p.width}
										type="button"
										disabled={isProcessing}
										onClick={() =>
											updateSubtitleLayout({
												background: { stripWidth: p.width },
											})
										}
										className={cn(
											"flex-1 py-1 text-[10px] rounded border transition",
											(subtitleBackground.stripWidth ?? 88) === p.width
												? "border-amber-500 bg-amber-950/60 text-amber-200 font-semibold"
												: "border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:bg-neutral-800",
										)}
									>
										{p.label}
									</button>
								))}
							</div>

							<div className="flex justify-between items-center text-xs mt-1">
								<Label htmlFor="subtitle-strip-height" className="text-xs font-medium text-neutral-300">
									Chiều cao dải che mờ (từ tâm)
								</Label>
								<span className="font-mono text-neutral-400">
									{subtitleBackground.stripHeight ?? 12}%
								</span>
							</div>
							<input
								type="range"
								id="subtitle-strip-height"
								min={5}
								max={35}
								step={1}
								disabled={isProcessing}
								value={subtitleBackground.stripHeight ?? 12}
								onChange={(e) =>
									updateSubtitleLayout({
										background: { stripHeight: Number(e.target.value) },
									})
								}
								className="w-full accent-amber-400"
							/>
							<div className="flex justify-between items-center text-[10px] text-neutral-500">
								<span>5% (1 dòng nhỏ)</span>
								<span>12% (Chuẩn)</span>
								<span>25% (2 dòng chữ to)</span>
							</div>

							<div className="flex justify-between items-center text-xs mt-1">
								<Label htmlFor="subtitle-blur" className="text-xs font-medium text-neutral-300">
									Độ nhòe mờ video (Blur)
								</Label>
								<span className="font-mono text-neutral-400">
									{subtitleBackground.blur ?? 30}px
								</span>
							</div>
							<input
								type="range"
								id="subtitle-blur"
								min={10}
								max={50}
								step={2}
								disabled={isProcessing}
								value={subtitleBackground.blur ?? 30}
								onChange={(e) =>
									updateSubtitleLayout({
										background: { blur: Number(e.target.value) },
									})
								}
								className="w-full accent-amber-400"
							/>
						</div>
					)}

					{/* 5. Tùy chọn màu chữ */}
					<div className="flex items-center justify-between border-t border-neutral-800/80 pt-2.5">
						<span className="text-xs font-medium text-neutral-300">Màu chữ</span>
						<div className="flex items-center gap-1.5">
							{[
								{ label: "Vàng", color: "#FFFF00" },
								{ label: "Trắng", color: "#FFFFFF" },
								{ label: "Xanh lơ", color: "#00FFFF" },
							].map((swatch) => (
								<button
									key={swatch.color}
									type="button"
									disabled={isProcessing}
									onClick={() => updateSubtitleLayout({ textColor: swatch.color })}
									className={cn(
										"flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border transition",
										subtitleTextColor.toUpperCase() === swatch.color
											? "border-amber-400 bg-neutral-800 font-semibold text-white"
											: "border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:bg-neutral-800"
									)}
								>
									<span
										className="size-2.5 rounded-full border border-black/40"
										style={{ backgroundColor: swatch.color }}
									/>
									{swatch.label}
								</button>
							))}
						</div>
					</div>

					{/* Nút đồng bộ và reset */}
					<div className="flex flex-col gap-1.5 pt-1">
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={isProcessing}
							onClick={() => {
								updateSubtitleLayout({
									fontSize: 3.5,
									positionY: defaultBaselineY,
									positionX: 0,
									textColor: "#FFFF00",
									background: {
										enabled: true,
										backdropBlur: true,
										fullWidth: true,
										stripHeight: 12,
										stripWidth: 88,
										color: "#000000",
										opacity: 0,
										blur: 30,
										cornerRadius: 12,
										paddingX: 0,
										paddingY: 0,
									},
								});
								toast.success("Đã khôi phục chuẩn mặc định: Chữ vàng + nền mờ!");
							}}
							className="w-full text-xs h-7 border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-300"
						>
							<RefreshCw className="mr-1.5 size-3" />
							Khôi phục chuẩn mặc định
						</Button>

						<Button
							type="button"
							variant="secondary"
							size="sm"
							disabled={isProcessing}
							onClick={addSubtitleCoverStrip}
							className="w-full text-xs h-7 bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
						>
							✨ Thêm dải mờ che phụ đề gốc riêng
						</Button>
					</div>
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
								Tối đa {subtitleMaxLines} dòng/câu
							</span>
						</div>
						<p className="text-[11px] text-neutral-400 leading-relaxed">
							Tự động tách câu thành các đoạn ngắn tối đa {subtitleMaxLines} dòng chuẩn TikTok / Reels. Bạn có thể xem trước và chỉnh sửa lời thoại trước khi AI thu âm.
						</p>
						<Button
							type="button"
							variant="outline"
							disabled={isProcessing || isPreviewing}
							onClick={handlePreview}
							className="mt-1 w-full border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 text-xs py-2 h-8"
						>
							{isPreviewing ? <Loader2 className="size-3.5 animate-spin" /> : <ScanEye className="size-3.5" />}
							{isPreviewing ? "Đang phân tích..." : "Xem trước kịch bản phụ đề"}
						</Button>
					</div>
				) : (
					<div className="flex flex-col gap-2.5">
						<div className="flex items-center justify-between flex-wrap gap-2">
							<div className="flex items-center gap-2">
								<span className="text-xs font-semibold text-neutral-200">
									Phụ đề ({previewCues.length} đoạn)
								</span>
								<div className="flex items-center gap-1 bg-neutral-900/80 border border-neutral-800 px-1.5 py-0.5 rounded text-[11px] text-neutral-300">
									<span className="text-neutral-400 text-[10px]">Tối đa</span>
									<input
										type="number"
										min={1}
										max={4}
										value={subtitleMaxLines}
										disabled={isProcessing || isPreviewing}
										onChange={(e) => {
											const val = Math.max(1, Math.min(4, parseInt(e.target.value, 10) || 1));
											updateSubtitleLayout({ maxLines: val });
										}}
										className="w-8 h-4 text-center font-mono font-bold bg-neutral-950 border border-neutral-700 rounded text-amber-300 focus:outline-none focus:border-amber-400 text-[11px]"
									/>
									<span className="text-amber-300 text-[10px]">dòng</span>
								</div>
								<div className="flex items-center gap-1">
									{[1, 2].map((lines) => (
										<button
											key={lines}
											type="button"
											disabled={isProcessing || isPreviewing}
											onClick={() => updateSubtitleLayout({ maxLines: lines })}
											className={cn(
												"px-1.5 py-0.5 rounded text-[10px] border transition",
												subtitleMaxLines === lines
													? "bg-amber-500/20 text-amber-300 border-amber-500/50 font-semibold"
													: "bg-neutral-900/60 text-neutral-400 border-neutral-800 hover:bg-neutral-800",
											)}
										>
											{lines} dòng
										</button>
									))}
								</div>
							</div>
							<button
								type="button"
								title="Phân tách lại kịch bản theo số dòng đã chọn"
								aria-label="Tạo lại kịch bản"
								disabled={isProcessing || isPreviewing}
								onClick={() => handlePreview(true)}
								className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700 transition"
							>
								<RefreshCw className={cn("size-3", isPreviewing && "animate-spin")} aria-label="Tạo lại kịch bản" />
								<span>Tách lại kịch bản</span>
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
													disabled={isProcessing || isPreviewing}
													onClick={() => removeCue(index)}
													className="text-neutral-500 hover:text-rose-400 ml-1 text-xs"
													title="Xóa câu này"
												>
													<Trash2 className="size-3.5" />
												</button>
											</div>
										</div>
										<textarea
											value={cue.text}
											maxLength={2000}
											disabled={isProcessing || isPreviewing}
											aria-label={`Lời đọc đoạn ${index + 1}`}
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
								disabled={isProcessing || isPreviewing}
								onClick={addCue}
								className="text-xs text-neutral-400 hover:text-neutral-200 h-7 px-2"
							>
								<Plus className="size-3.5" />Thêm câu phụ đề
							</Button>
							<span className="text-[10px] text-neutral-500">
								Chuẩn tối đa {subtitleMaxLines} dòng TikTok
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
							<Mic className="size-3.5" />Bản Việt hóa đã sẵn sàng
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
