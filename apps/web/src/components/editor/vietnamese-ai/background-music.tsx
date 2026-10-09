"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Music2, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { EditorCore } from "@/core";
import { useEditor } from "@/editor/use-editor";
import { AddTrackCommand, BatchCommand, DeleteElementsCommand, InsertElementCommand } from "@/commands";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { processMediaAssets } from "@/media/processing";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { dBToLinear, getElementVolume, isElementMuted } from "@/timeline/audio-state";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";
import { volumeControlParams } from "./volume-control";

function findMusicTarget({ scene, selection }: {
	scene: ReturnType<EditorCore["scenes"]["getActiveSceneOrNull"]>;
	selection: ReturnType<EditorCore["selection"]["getSelectedElements"]>;
}) {
	if (!scene) return null;
	const videos = [scene.tracks.main, ...scene.tracks.overlay].flatMap((track) =>
		track.elements.flatMap((video) => video.type === "video" ? [{ video, trackId: track.id }] : []),
	);
	const selected = videos.filter(({ video, trackId }) =>
		selection.some((ref) => ref.elementId === video.id && ref.trackId === trackId),
	);
	const target = selected.length === 1 ? selected[0] : videos.length === 1 ? videos[0] : null;
	if (!target) return null;
	const { video } = target;
	return {
		...target,
		sceneId: scene.id,
		prefix: `bgm-${video.id}-`,
		signature: JSON.stringify([scene.id, video.id, video.mediaId, video.startTime, video.duration, video.trimStart, video.trimEnd]),
	};
}

export function BackgroundMusicSection({ projectId, disabled }: { projectId: string; disabled: boolean }) {
	const editor = useEditor();
	const scene = useEditor((e) => e.scenes.getActiveSceneOrNull());
	const selection = useEditor((e) => e.selection.getSelectedElements());
	const assets = useEditor((e) => e.media.getAssets());
	const target = findMusicTarget({ scene, selection });
	const musicElements = scene?.tracks.audio.flatMap((track) => track.elements
		.filter((element) => target && element.name.startsWith(target.prefix))
		.map((element) => ({ trackId: track.id, element }))) ?? [];
	const [file, setFile] = useState<File | null>(null);
	const [assetId, setAssetId] = useState("");
	const [volume, setVolume] = useState(15);
	const [isAdding, setIsAdding] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const audioRef = useRef<HTMLAudioElement>(null);
	const requestRef = useRef<AbortController | null>(null);
	const sourceFile = file ?? assets.find((asset) => asset.id === assetId && asset.type === "audio")?.file;
	const busy = disabled || isAdding;
	const applied = musicElements[0]?.element;
	const musicVolume = applied ? isElementMuted({ element: applied }) ? 0 : Math.min(100, Math.round(dBToLinear(getElementVolume({ element: applied })) * 100)) : volume;

	useEffect(function prepareMusicPreview() {
		const audio = audioRef.current;
		if (!sourceFile || !audio) return;
		const url = URL.createObjectURL(sourceFile);
		audio.src = url;
		return () => {
			audio.pause();
			audio.removeAttribute("src");
			audio.load();
			URL.revokeObjectURL(url);
		};
	}, [sourceFile]);

	useEffect(function cancelMusicOnUnmount() {
		return () => {
			requestRef.current?.abort();
			requestRef.current = null;
		};
	}, []);

	const readTarget = () => findMusicTarget({
		scene: editor.scenes.getActiveSceneOrNull(),
		selection: editor.selection.getSelectedElements(),
	});

	const changeVolume = (percent: number) => {
		setVolume(percent);
		if (audioRef.current) audioRef.current.volume = percent / 100;
		if (musicElements.length) editor.timeline.updateElements({
			updates: musicElements.map(({ trackId, element }) => ({
				trackId,
				elementId: element.id,
				patch: { params: { ...element.params, ...volumeControlParams(percent) } },
			})),
		});
	};

	const addMusic = async () => {
		if (busy || requestRef.current || !sourceFile) return;
		const captured = readTarget();
		if (!captured) { toast.error("Chọn một video trên timeline để thêm nhạc nền."); return; }
		const controller = new AbortController();
		requestRef.current = controller;
		setIsAdding(true);
		audioRef.current?.pause();
		const assertTarget = () => {
			controller.signal.throwIfAborted();
			if (editor.project.getActive()?.metadata.id !== projectId || readTarget()?.signature !== captured.signature)
				throw new Error("Video hoặc vị trí trên timeline đã thay đổi. Vui lòng thêm nhạc lại.");
		};
		try {
			const duration = mediaTimeToSeconds({ time: captured.video.duration });
			const form = new FormData();
			form.set("music", sourceFile);
			form.set("duration", String(duration));
			const response = await fetch("/api/localization/music", { method: "POST", body: form, signal: controller.signal });
			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Không chuẩn bị được nhạc nền.");
			}
			const name = `${captured.prefix}${sourceFile.name.replace(/\.[^.]+$/, "")}.mp3`;
			const fitted = new File([await response.blob()], name, { type: "audio/mpeg" });
			const [processed] = await processMediaAssets({ files: [fitted] });
			if (!processed?.duration || !Number.isFinite(processed.duration))
				throw new Error("Không thể nạp file nhạc đã chuẩn bị.");
			assertTarget();
			const asset = await editor.media.addMediaAsset({ projectId, asset: processed });
			if (!asset) throw new Error("Không thể lưu nhạc vào dự án.");
			assertTarget();
			const element = buildElementFromMedia({
				mediaId: asset.id, mediaType: "audio", name,
				duration: captured.video.duration, startTime: captured.video.startTime,
			});
			if (element.type !== "audio" || element.sourceType !== "upload") throw new Error("Track nhạc không hợp lệ.");
			element.sourceDuration = mediaTimeFromSeconds({ seconds: processed.duration });
			element.trimEnd = mediaTimeFromSeconds({ seconds: Math.max(0, processed.duration - duration) });
			Object.assign(element.params, volumeControlParams(musicVolume));
			const current = editor.scenes.getActiveScene();
			const previous = current.tracks.audio.flatMap((track) => track.elements
				.filter((item) => item.name.startsWith(captured.prefix))
				.map((item) => ({ trackId: track.id, elementId: item.id })));
			const musicTrack = current.tracks.audio.find((track) => !track.muted && track.elements.length > 0 && track.elements.every((item) => item.name.startsWith(captured.prefix)));
			const newTrack = musicTrack ? null : new AddTrackCommand({ type: "audio" });
			const insertion = new InsertElementCommand({ element, placement: { mode: "explicit", trackId: musicTrack?.id ?? newTrack!.getTrackId() } });
			editor.command.execute({ command: new BatchCommand([
				...(previous.length ? [new DeleteElementsCommand({ elements: previous })] : []),
				...(newTrack ? [newTrack] : []), insertion,
			]), ripple: "preserve" });
			editor.selection.setSelectedElements({ elements: [{ trackId: captured.trackId, elementId: captured.video.id }] });
			await editor.project.saveCurrentProject();
			toast.success(previous.length ? "Đã thay nhạc nền cho video." : "Đã thêm nhạc nền cho video.");
		} catch (error) {
			if (!controller.signal.aborted) toast.error(error instanceof Error ? error.message : "Không thể thêm nhạc nền.");
		} finally {
			if (requestRef.current === controller) {
				requestRef.current = null;
				setIsAdding(false);
			}
		}
	};

	return <section className="flex flex-col gap-3 rounded-lg border border-neutral-800 p-3 text-neutral-100" aria-label="Nhạc nền">
		<div className="flex items-center gap-2 text-sm font-medium"><Music2 className="size-4 text-rose-400" />Nhạc nền</div>
		<p className="text-[11px] leading-relaxed text-neutral-400">Nhạc được cắt hoặc lặp vừa đoạn video, fade nhẹ ở đầu/cuối. Âm lượng mặc định 15% để lời thuyết minh rõ hơn.</p>
		<input ref={inputRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" className="hidden" aria-label="Chọn file nhạc nền" disabled={busy}
			onChange={(event) => {
				const chosen = event.target.files?.[0];
				if (chosen) { setFile(chosen); setAssetId(""); }
				event.target.value = "";
			}} />
		<Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy} className="border-neutral-700 bg-neutral-950 text-xs text-neutral-200 hover:bg-neutral-900 hover:text-white"><Upload />Chọn nhạc từ máy</Button>
		{assets.some((asset) => asset.type === "audio") && <Select value={file ? "uploaded-file" : assetId} disabled={busy} onValueChange={(value) => {
			if (value !== "uploaded-file") { setFile(null); setAssetId(value); }
		}}>
			<SelectTrigger className="h-8 w-full min-w-0 border-neutral-700 bg-neutral-950 text-xs text-neutral-200 [&>div]:min-w-0 [&_span]:truncate" aria-label="Nhạc trong dự án"><SelectValue placeholder="Hoặc chọn audio trong dự án" /></SelectTrigger>
			<SelectContent className="max-w-80 border-neutral-700 bg-neutral-950 text-neutral-200">
				{file && <SelectItem value="uploaded-file" className="text-neutral-200 data-[highlighted]:bg-neutral-800"><span className="truncate">{file.name}</span></SelectItem>}
				{assets.filter((asset) => asset.type === "audio").map((asset) => <SelectItem key={asset.id} value={asset.id} className="text-neutral-200 data-[highlighted]:bg-neutral-800"><span className="truncate">{asset.name}</span></SelectItem>)}
			</SelectContent>
		</Select>}
		{sourceFile && <div className="flex min-w-0 flex-col gap-2">
			<p className="truncate text-xs" title={sourceFile.name}>{sourceFile.name}</p>
			{/* eslint-disable-next-line jsx-a11y/media-has-caption -- User-supplied music preview has no available transcript. */}
			<audio ref={audioRef} controls preload="metadata" aria-label="Nghe thử nhạc nền" className="h-8 w-full"
				onLoadedMetadata={(event) => { event.currentTarget.volume = musicVolume / 100; }} />
		</div>}
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between"><Label htmlFor="background-music-volume" className="text-neutral-400">Âm lượng nhạc nền</Label><span className="text-xs text-neutral-400">{musicVolume}%</span></div>
			<Slider id="background-music-volume" aria-label="Âm lượng nhạc nền" value={[musicVolume]} min={0} max={100} step={1} disabled={busy} onValueChange={([value]) => changeVolume(value)} />
		</div>
		<p className="truncate text-[11px] text-neutral-400" title={target?.video.name}>{target ? `Áp dụng cho: ${target.video.name}` : "Chọn một video trên timeline để thêm nhạc."}</p>
		<div className="flex gap-2">
			<Button size="sm" className="flex-1 text-xs" disabled={busy || !sourceFile || !target} onClick={addMusic}>
				{isAdding ? <Loader2 className="animate-spin" /> : <Plus />}{isAdding ? "Đang chuẩn bị nhạc..." : musicElements.length ? "Thay nhạc nền" : "Thêm nhạc nền"}
			</Button>
			{musicElements.length > 0 && <Button variant="ghost" size="icon" aria-label="Xóa nhạc nền của video" title="Xóa nhạc nền" disabled={busy} onClick={() => {
				editor.command.execute({ command: new DeleteElementsCommand({ elements: musicElements.map(({ trackId, element }) => ({ trackId, elementId: element.id })) }), ripple: "preserve" });
				if (target) editor.selection.setSelectedElements({ elements: [{ trackId: target.trackId, elementId: target.video.id }] });
				toast.success("Đã xóa nhạc nền của video.");
			}}><Trash2 /></Button>}
		</div>
	</section>;
}
