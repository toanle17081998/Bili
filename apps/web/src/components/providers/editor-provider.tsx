"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { EditorCore } from "@/core";
import { useEditor } from "@/editor/use-editor";
import { useKeybindingsListener } from "@/actions/use-keybindings";
import { useKeybindingsStore } from "@/actions/keybindings-store";
import { useTimelineStore } from "@/timeline/timeline-store";
import { useEditorActions } from "@/actions/use-editor-actions";
import { loadFontAtlas } from "@/fonts/google-fonts";
import {
	initializeGpuRenderer,
	isGpuAvailable,
} from "@/services/renderer/gpu-renderer";
import { processMediaAssets } from "@/media/processing";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { mediaTimeFromSeconds, ZERO_MEDIA_TIME } from "@/wasm";

// React Strict Mode can mount the provider twice while the same file is loading.
const projectLoads = new Map<string, Promise<void>>();

async function loadImportedVideo(editor: EditorCore, projectId: string) {
	const response = await fetch(
		`/api/source/import?id=${encodeURIComponent(projectId)}`,
	);
	const data = await response.json();
	if (!response.ok || !data.success)
		throw new Error(data.error || "Không thể nạp video đã import.");
	const imported = data.importedVideo;
	const key = `imported_video_${projectId}`;
	let previous = {};
	try {
		previous = JSON.parse(sessionStorage.getItem(key) || "{}");
	} catch {
		/* Recover from the server. */
	}
	sessionStorage.setItem(
		key,
		JSON.stringify({
			...previous,
			...imported,
			localMediaPath: imported.localMediaPath,
			streamUrl: imported.streamUrl,
		}),
	);

	const fileName = imported.fullVideo
		? `${projectId}.full.mp4`
		: `${projectId}.mp4`;
	let asset = editor.media
		.getAssets()
		.find((item) => item.name === fileName || item.file.name === fileName);
	if (!asset) {
		const videoResponse = await fetch(imported.streamUrl);
		if (!videoResponse.ok) throw new Error("Không thể đọc file video đã tải.");
		const file = new File([await videoResponse.blob()], fileName, {
			type: "video/mp4",
		});
		const [processed] = await processMediaAssets({ files: [file] });
		if (
			!processed ||
			!processed.duration ||
			!processed.width ||
			!processed.height
		) {
			throw new Error(
				"Không thể đọc video. File có thể bị hỏng hoặc codec chưa được hỗ trợ.",
			);
		}
		if (editor.project.getActiveOrNull()?.metadata.id !== projectId) return;
		asset =
			(await editor.media.addMediaAsset({ projectId, asset: processed })) ??
			undefined;
		if (!asset) throw new Error("Không thể lưu video vào bộ nhớ trình duyệt.");
	}
	const scene = editor.scenes.getActiveScene();
	const tracks = [
		scene.tracks.main,
		...scene.tracks.overlay,
		...scene.tracks.audio,
	];
	if (
		!tracks.some((track) =>
			track.elements.some(
				(element) => "mediaId" in element && element.mediaId === asset.id,
			),
		)
	) {
		editor.timeline.insertElement({
			element: buildElementFromMedia({
				mediaId: asset.id,
				mediaType: "video",
				name: asset.name,
				duration: mediaTimeFromSeconds({ seconds: asset.duration! }),
				startTime: ZERO_MEDIA_TIME,
			}),
			placement: { mode: "auto" },
		});
		await editor.project.saveCurrentProject();
	}
}

interface EditorProviderProps {
	projectId: string;
	children: React.ReactNode;
}

export function EditorProvider({ projectId, children }: EditorProviderProps) {
	const activeProject = useEditor((e) => e.project.getActiveOrNull());
	const router = useRouter();
	const searchParams = useSearchParams();
	const isImported = searchParams.get("imported") === "true";
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { setLoadingProject } = useKeybindingsStore();

	useEffect(() => {
		setLoadingProject(isLoading);
	}, [isLoading, setLoadingProject]);

	useEffect(() => {
		let cancelled = false;
		const editor = EditorCore.getInstance();

		const loadProject = async () => {
			try {
				setIsLoading(true);
				let request = projectLoads.get(projectId);
				if (!request) {
					request = (async () => {
						await initializeGpuRenderer();
						editor.renderer.setDegraded(!isGpuAvailable());
						await editor.project.loadProject({ id: projectId });
						if (isImported) await loadImportedVideo(editor, projectId);
					})();
					projectLoads.set(projectId, request);
				}
				try {
					await request;
				} finally {
					if (projectLoads.get(projectId) === request)
						projectLoads.delete(projectId);
				}

				if (cancelled) return;

				setIsLoading(false);
				loadFontAtlas();
			} catch (err) {
				if (cancelled) return;

				const isNotFound =
					err instanceof Error &&
					(err.message.includes("not found") ||
						err.message.includes("does not exist"));

				if (isNotFound) {
					try {
						const newProjectId = await editor.project.createNewProject({
							name: "Untitled Project",
						});
						router.replace(`/editor/${newProjectId}`);
					} catch (_createErr) {
						setError("Failed to create project");
						setIsLoading(false);
					}
				} else {
					const wasmPanic = (window as Window & { __wasmPanic?: string })
						.__wasmPanic;
					if (wasmPanic) {
						delete (window as Window & { __wasmPanic?: string }).__wasmPanic;
						setError(wasmPanic);
					} else {
						setError(
							err instanceof Error ? err.message : "Failed to load project",
						);
					}
					setIsLoading(false);
				}
			}
		};

		loadProject();

		return () => {
			cancelled = true;
		};
	}, [projectId, router, isImported]);

	if (error) {
		return (
			<div className="bg-background flex h-screen w-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<p className="text-destructive text-sm">{error}</p>
				</div>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="bg-background flex h-screen w-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<Loader2 className="text-muted-foreground size-8 animate-spin" />
					<p className="text-muted-foreground text-sm">Loading project...</p>
				</div>
			</div>
		);
	}

	if (!activeProject) {
		return (
			<div className="bg-background flex h-screen w-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<Loader2 className="text-muted-foreground size-8 animate-spin" />
					<p className="text-muted-foreground text-sm">Exiting project...</p>
				</div>
			</div>
		);
	}

	return (
		<>
			<EditorRuntimeBindings />
			{children}
		</>
	);
}

function EditorRuntimeBindings() {
	const editor = useEditor();
	const rippleEditingEnabled = useTimelineStore(
		(state) => state.rippleEditingEnabled,
	);

	useEffect(() => {
		editor.command.isRippleEnabled = rippleEditingEnabled;
	}, [editor, rippleEditingEnabled]);

	useEffect(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!editor.save.getIsDirty()) return;
			event.preventDefault();
			(event as unknown as { returnValue: string }).returnValue = "";
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [editor]);

	useEditorActions();
	useKeybindingsListener();
	return null;
}
