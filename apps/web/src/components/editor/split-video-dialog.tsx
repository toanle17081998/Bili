"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useEditor } from "@/editor/use-editor";
import { generateUUID } from "@/utils/id";
import type { SplitPlanner } from "@/split-video/core";
import type { DownloadedVideo, SplitJob } from "@/split-video/types";
import {
	completeSplitBatch,
	pauseSplitBatch,
	saveSplitDraft,
	createProjectsFromSplits,
	listDownloadedVideos,
	loadBrowserSplitPlanner,
	splitProjectsAlreadySaved,
	splitVideo,
	type CreatedSplitProject,
} from "@/services/split-video";
import {
	readSplitDrafts,
	removeSplitDraft,
	splitJobToDraft,
	writeSplitDraft,
	type SplitDraft,
} from "@/services/split-video/drafts";

interface CutPoint {
	id: string;
	time: number;
}
type Step = "select" | "cuts" | "confirm";

function formatTime({ seconds }: { seconds: number }) {
	if (!Number.isFinite(seconds)) return "—";
	const milliseconds = Math.round(seconds * 1000);
	const hours = Math.floor(milliseconds / 3_600_000);
	const minutes = Math.floor(milliseconds / 60_000) % 60;
	const remainder = (milliseconds % 60_000) / 1000;
	return `${hours ? `${hours}:` : ""}${String(minutes).padStart(2, "0")}:${remainder.toFixed(3).padStart(6, "0")}`;
}

export default function SplitVideoDialog({
	onClose,
	initialJob,
	initialDraft,
}: {
	onClose: () => void;
	initialJob?: SplitJob;
	initialDraft?: SplitDraft;
}) {
	const editor = useEditor();
	const router = useRouter();
	const [restored] = useState(() =>
		initialJob
			? splitJobToDraft({ job: initialJob })
			: (initialDraft ?? readSplitDrafts()[0] ?? null),
	);
	const [draftId, setDraftId] = useState(
		() => restored?.batchId ?? generateUUID(),
	);
	const [step, setStep] = useState<Step>(restored?.step ?? "select");
	const [editorId] = useState(generateUUID);
	const [videos, setVideos] = useState<DownloadedVideo[]>([]);
	const [planner, setPlanner] = useState<SplitPlanner | null>(null);
	const [loading, setLoading] = useState(true);
	const [reload, setReload] = useState(0);
	const [warnings, setWarnings] = useState<string[]>([]);
	const [selected, setSelected] = useState<DownloadedVideo | null>(
		restored?.video ?? null,
	);
	const [cuts, setCuts] = useState<CutPoint[]>(restored?.cuts ?? []);
	const [baseName, setBaseName] = useState(restored?.baseName ?? "");
	const [currentTime, setCurrentTime] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [status, setStatus] = useState("");
	const [progress, setProgress] = useState<number | null>(null);
	const [created, setCreated] = useState<CreatedSplitProject[]>(
		initialJob?.createdProjects ?? [],
	);
	const [job, setJob] = useState<SplitJob | null>(initialJob ?? null);
	const [snapshot, setSnapshot] = useState<SplitDraft | null>(restored);
	const [draftStatus, setDraftStatus] = useState(
		restored ? "Đã khôi phục bản nháp điểm cắt. Bạn có thể tiếp tục." : "",
	);
	const latestDraftRef = useRef<SplitDraft | null>(restored);
	const pendingDraftWrite = useRef<Promise<SplitDraft> | null>(null);
	const draftWriteSequence = useRef(0);
	const createPending = useRef(false);
	const closing = useRef(false);
	const editBaseRef = useRef({
		batchId: restored?.batchId ?? draftId,
		revision: restored?.revision ?? 0,
	});
	const runRef = useRef<{
		controller: AbortController;
		batchId: string;
	} | null>(null);
	const videoRef = useRef<HTMLVideoElement>(null);
	const timelineRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const controller = new AbortController();
		void Promise.all([
			listDownloadedVideos({ signal: controller.signal }),
			loadBrowserSplitPlanner(),
		])
			.then(([data, core]) => {
				if (controller.signal.aborted) return;
				setVideos(data.videos);
				setWarnings(data.warnings);
				setPlanner(core);
			})
			.catch((failure: unknown) => {
				if (!controller.signal.aborted)
					setError(
						failure instanceof Error
							? failure.message
							: "Không tải được video nguồn.",
					);
			})
			.finally(() => {
				if (!controller.signal.aborted) setLoading(false);
			});
		return () => controller.abort();
	}, [reload]);

	useEffect(
		() => () => {
			const run = runRef.current;
			if (!run) return;
			runRef.current = null;
			run.controller.abort();
		},
		[],
	);

	useEffect(() => {
		if (!snapshot) return;
		const timer = setTimeout(() => {
			void saveSplitDraft({ draft: snapshot })
				.then(() => {
					if (latestDraftRef.current?.revision !== snapshot.revision) return;
					setDraftStatus(
						`Đã lưu ${snapshot.cuts.length} điểm cắt trên máy và server. Reload hoặc đóng hộp thoại vẫn giữ bản nháp.`,
					);
				})
				.catch((failure: unknown) => {
					if (latestDraftRef.current?.revision !== snapshot.revision) return;
					setDraftStatus(
						`Bản nháp trên trình duyệt đã giữ lại. Chưa lưu được trên server: ${failure instanceof Error ? failure.message : "Thử lại sau."}`,
					);
				});
		}, 400);
		return () => clearTimeout(timer);
	}, [snapshot]);

	useEffect(() => {
		if (restored) void saveSplitDraft({ draft: restored }).catch(console.error);
	}, [restored]);

	useEffect(() => {
		const saveBeforeLeaving = () => {
			const draft = latestDraftRef.current;
			if (draft) void saveSplitDraft({ draft }).catch(console.error);
		};
		window.addEventListener("beforeunload", saveBeforeLeaving);
		return () => {
			window.removeEventListener("beforeunload", saveBeforeLeaving);
			saveBeforeLeaving();
		};
	}, []);

	const preview = useMemo(() => {
		if (!selected || !planner) return { ranges: [], error: null };
		try {
			return {
				ranges: planner.plan({
					duration: selected.duration,
					cuts: cuts.map((cut) => cut.time),
				}),
				error: null,
			};
		} catch (failure: unknown) {
			return {
				ranges: [],
				error:
					failure instanceof Error ? failure.message : "Điểm cắt không hợp lệ.",
			};
		}
	}, [selected, planner, cuts]);
	const sortedCuts = useMemo(
		() => [...cuts].sort((a, b) => a.time - b.time),
		[cuts],
	);

	function seek({ time }: { time: number }) {
		if (videoRef.current) videoRef.current.currentTime = time;
		setCurrentTime(time);
	}
	async function persistDraft({
		nextCuts = cuts,
		name = baseName,
		nextStep = step,
		video = selected,
		id = draftId,
	}: {
		nextCuts?: CutPoint[];
		name?: string;
		nextStep?: Step;
		video?: DownloadedVideo | null;
		id?: string;
	} = {}) {
		if (!video || !planner || nextStep === "select") return null;
		try {
			planner.plan({
				duration: video.duration,
				cuts: nextCuts.map((cut) => cut.time),
			});
		} catch {
			return null;
		}
		let draft: SplitDraft = {
			batchId: id,
			video,
			cuts: nextCuts,
			baseName: name,
			step: nextStep,
			revision: (latestDraftRef.current?.revision ?? 0) + 1,
			baseRevision:
				editBaseRef.current.batchId === id ? editBaseRef.current.revision : 0,
			localBaseRevision:
				latestDraftRef.current?.batchId === id
					? latestDraftRef.current.revision
					: 0,
			editorId,
		};
		const sequence = ++draftWriteSequence.current;
		latestDraftRef.current = draft;
		try {
			const pending = writeSplitDraft({ draft });
			pendingDraftWrite.current = pending;
			draft = await pending;
			if (pendingDraftWrite.current === pending)
				pendingDraftWrite.current = null;
			if (sequence !== draftWriteSequence.current) return draft;
			if (draft.batchId !== id) {
				setDraftId(draft.batchId);
				setJob(null);
				toast.info(
					"Tab khác đã cập nhật mốc cắt. Chỉnh sửa của bạn được giữ thành bản nháp riêng.",
				);
			}
			setDraftStatus(`Đã giữ ${nextCuts.length} điểm cắt trong bản nháp.`);
		} catch {
			setError(
				"Không lưu được bản nháp trong trình duyệt. App đang thử lưu trên server.",
			);
		}
		latestDraftRef.current = draft;
		setSnapshot(draft);
		return draft;
	}
	function applyValidCuts({ next }: { next: CutPoint[] }) {
		if (!selected || !planner) return;
		try {
			planner.plan({
				duration: selected.duration,
				cuts: next.map((cut) => cut.time),
			});
			setCuts(next);
			persistDraft({ nextCuts: next });
			setError(null);
		} catch (failure: unknown) {
			setError(
				failure instanceof Error ? failure.message : "Điểm cắt không hợp lệ.",
			);
		}
	}
	function cancel() {
		const run = runRef.current;
		if (!run) return;
		setStatus("Đang dừng. Các điểm cắt và project đã lưu được giữ lại…");
		run.controller.abort();
		void pauseSplitBatch({ batchId: run.batchId })
			.then(setJob)
			.catch((failure: unknown) =>
				setError(
					failure instanceof Error
						? failure.message
						: "Không dừng được tác vụ.",
				),
			);
	}
	async function requestClose() {
		closing.current = true;
		const run = runRef.current;
		if (run) {
			runRef.current = null;
			run.controller.abort();
		}
		await pendingDraftWrite.current?.catch(console.error);
		onClose();
	}
	async function openProject({ id }: { id: string }) {
		if (editor.project.getActiveOrNull()) {
			await editor.save.flush();
			await editor.project.prepareExit();
		}
		onClose();
		router.push(`/editor/${id}`);
	}
	async function createProjects() {
		if (
			!selected ||
			busy ||
			createPending.current ||
			preview.error ||
			!cuts.length ||
			!baseName.trim()
		)
			return;
		createPending.current = true;
		const draft = await persistDraft({ nextStep: "confirm" });
		createPending.current = false;
		if (!draft || closing.current) return;
		const run = { controller: new AbortController(), batchId: draft.batchId };
		runRef.current = run;
		setBusy(true);
		setError(null);
		setProgress(null);
		setStatus("Đang lưu mốc cắt và bắt đầu tác vụ nền…");
		let firstProject: string | undefined;
		try {
			const savedJob = await saveSplitDraft({ draft });
			let notified = false;
			const result =
				savedJob.result &&
				(await splitProjectsAlreadySaved({ result: savedJob.result }))
					? savedJob.result
					: await splitVideo({
							batchId: run.batchId,
							sourceVideoPath: selected.path,
							cuts: cuts.map((cut) => cut.time),
							baseName,
							signal: run.controller.signal,
							onJob: (value) => {
								setJob(value);
								setProgress((value.completedParts / value.totalParts) * 0.5);
								setStatus(
									value.status === "ready"
										? "Đã cắt xong video. Đang chuẩn bị lưu project vào trình duyệt…"
										: `Đang cắt đoạn ${Math.min(value.completedParts + 1, value.totalParts)}/${value.totalParts}. Mốc cắt đã lưu; có thể đóng và tiếp tục từ trang Projects.`,
								);
								if (!notified) {
									notified = true;
									toast.info(
										"Đã lưu các điểm cắt. Tác vụ chạy nền; reload không mất bản nháp.",
									);
								}
							},
						});
			setProgress(0.5);
			setStatus(`Đang lưu ${result.parts.length} project…`);
			const outcome = await createProjectsFromSplits({
				result,
				baseName,
				editor,
				signal: run.controller.signal,
				onProgress: (value) => {
					setProgress(0.5 + (value.completed / value.total) * 0.5);
					setCreated(value.created);
					setStatus(`Đang lưu project ${value.completed}/${value.total}…`);
				},
			});
			if (outcome.cancelled)
				setError(
					`Đã hủy. ${outcome.created.length} project đã lưu được giữ lại.`,
				);
			else if (outcome.failures.length) setError(outcome.failures.join("\n"));
			else if (outcome.created.length) {
				if (run.controller.signal.aborted || runRef.current !== run) return;
				setJob(await completeSplitBatch({ batchId: run.batchId }));
				await removeSplitDraft({ batchId: run.batchId });
				latestDraftRef.current = null;
				setSnapshot(null);
				await editor.project.loadAllProjects();
				firstProject = outcome.created[0].id;
				toast.success(`Đã tạo ${outcome.created.length} project.`);
			}
		} catch (failure: unknown) {
			setError(
				run.controller.signal.aborted
					? "Đã dừng theo dõi trong hộp thoại. Điểm cắt và tác vụ nền được giữ để tiếp tục."
					: failure instanceof Error
						? failure.message
						: "Không tạo được project.",
			);
		} finally {
			if (runRef.current === run) {
				setBusy(false);
				setStatus("");
			}
		}
		if (runRef.current !== run) return;
		if (run.controller.signal.aborted) {
			setError("Đã hủy. Các project đã lưu được giữ lại.");
		} else if (firstProject) {
			if (editor.project.getActiveOrNull()) {
				await editor.save.flush();
				await editor.project.prepareExit();
			}
			if (runRef.current === run && !run.controller.signal.aborted) {
				runRef.current = null;
				onClose();
				router.push(`/editor/${firstProject}`);
			}
		}
		if (runRef.current === run) runRef.current = null;
	}

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) requestClose();
			}}
		>
			<DialogContent className="max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
				<DialogHeader>
					<DialogTitle>Chia video thành nhiều project</DialogTitle>
					<DialogDescription>
						{step === "select"
							? "1. Chọn video đã tải từ Bilibili."
							: step === "cuts"
								? "2. Xem video và đánh dấu các điểm cắt."
								: "3. Đặt tên và tạo project riêng cho từng đoạn."}
					</DialogDescription>
				</DialogHeader>
				<DialogBody className="overflow-y-auto min-h-0">
					{draftStatus && (
						<p className="text-xs text-muted-foreground" role="status">
							{draftStatus}
						</p>
					)}
					{error && (
						<p
							role="alert"
							className="text-destructive text-sm whitespace-pre-line"
						>
							{error}
						</p>
					)}
					{step === "select" && (
						<>
							{loading ? (
								<p role="status" className="text-muted-foreground text-sm">
									Đang đọc các video đã tải…
								</p>
							) : (
								<>
									{warnings.length > 0 && (
										<p className="text-muted-foreground text-sm">
											{warnings.join(" ")}
										</p>
									)}
									{!videos.length && (
										<p className="text-muted-foreground text-sm">
											Chưa có video phù hợp. Tải video Bilibili về thư mục
											downloads, rồi bấm Làm mới.
										</p>
									)}
									<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
										{videos.map((video) => (
											<button
												key={video.id}
												type="button"
												disabled={
													!planner || video.duration < planner.minSourceDuration
												}
												className="text-left rounded-md border overflow-hidden hover:border-primary focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed"
												onClick={() => {
													const id = generateUUID();
													setDraftId(id);
													setJob(null);
													setSelected(video);
													setBaseName(video.name);
													setCuts([]);
													setCurrentTime(0);
													setError(null);
													setCreated([]);
													setStep("cuts");
													persistDraft({
														video,
														nextCuts: [],
														name: video.name,
														nextStep: "cuts",
														id,
													});
												}}
											>
												<div className="relative aspect-video bg-muted">
													<Image
														src={video.thumbnailUrl}
														alt=""
														fill
														sizes="320px"
														className="object-cover"
														unoptimized
													/>
												</div>
												<div className="p-3 space-y-1">
													<p className="text-sm font-medium line-clamp-2">
														{video.name}
													</p>
													<p className="text-xs text-muted-foreground">
														{formatTime({ seconds: video.duration })} ·{" "}
														{video.width} × {video.height}
													</p>
													{planner &&
														video.duration < planner.minSourceDuration && (
															<p className="text-xs text-muted-foreground">
																Cần video dài ít nhất{" "}
																{planner.minSourceDuration} giây.
															</p>
														)}
												</div>
											</button>
										))}
									</div>
								</>
							)}
						</>
					)}
					{step === "cuts" && selected && (
						<div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_17rem]">
							<div className="space-y-3 min-w-0">
								{/* eslint-disable-next-line jsx-a11y/media-has-caption -- Preview of the unedited source; captions are authored in the resulting projects. */}
								<video
									ref={videoRef}
									src={selected.streamUrl}
									controls
									preload="metadata"
									className="w-full max-h-[40vh] bg-black rounded-md"
									onTimeUpdate={(event) =>
										setCurrentTime(event.currentTarget.currentTime)
									}
								/>
								<div ref={timelineRef} className="relative h-8">
									<input
										type="range"
										aria-label="Vị trí video"
										min={0}
										max={selected.duration}
										step={0.01}
										value={currentTime}
										className="w-full h-8 accent-primary"
										onChange={(event) =>
											seek({ time: Number(event.currentTarget.value) })
										}
									/>
									{sortedCuts
										.filter((cut) => Number.isFinite(cut.time))
										.map((cut, index) => (
											<button
												key={cut.id}
												type="button"
												aria-label={`Điểm cắt ${index + 1}`}
												title={formatTime({ seconds: cut.time })}
												className="absolute top-1 bottom-1 w-3 -translate-x-1/2 rounded-sm border border-background bg-primary cursor-ew-resize touch-none"
												style={{
													left: `${Math.max(0, Math.min(100, (cut.time / selected.duration) * 100))}%`,
												}}
												onPointerDown={(event) => {
													event.stopPropagation();
													event.currentTarget.setPointerCapture(
														event.pointerId,
													);
													seek({ time: cut.time });
												}}
												onPointerMove={(event) => {
													if (
														!event.currentTarget.hasPointerCapture(
															event.pointerId,
														) ||
														!timelineRef.current
													)
														return;
													const bounds =
														timelineRef.current.getBoundingClientRect();
													const time =
														Math.round(
															Math.max(
																0,
																Math.min(
																	1,
																	(event.clientX - bounds.left) / bounds.width,
																),
															) *
																selected.duration *
																1000,
														) / 1000;
													applyValidCuts({
														next: cuts.map((point) =>
															point.id === cut.id ? { ...point, time } : point,
														),
													});
												}}
												onPointerUp={(event) => {
													if (
														event.currentTarget.hasPointerCapture(
															event.pointerId,
														)
													)
														event.currentTarget.releasePointerCapture(
															event.pointerId,
														);
												}}
												onKeyDown={(event) => {
													if (
														event.key !== "ArrowLeft" &&
														event.key !== "ArrowRight"
													)
														return;
													event.preventDefault();
													event.stopPropagation();
													applyValidCuts({
														next: cuts.map((point) =>
															point.id === cut.id
																? {
																		...point,
																		time:
																			Math.round(
																				(point.time +
																					(event.key === "ArrowRight"
																						? 0.1
																						: -0.1)) *
																					1000,
																			) / 1000,
																	}
																: point,
														),
													});
												}}
											/>
										))}
								</div>
								<div className="flex items-center justify-between gap-3">
									<span className="text-xs font-mono">
										{formatTime({ seconds: currentTime })} /{" "}
										{formatTime({ seconds: selected.duration })}
									</span>
									<Button
										variant="outline"
										onClick={() =>
											applyValidCuts({
												next: [
													...cuts,
													{
														id: generateUUID(),
														time:
															Math.round(
																(videoRef.current?.currentTime ?? currentTime) *
																	1000,
															) / 1000,
													},
												],
											})
										}
									>
										Thêm điểm cắt
									</Button>
								</div>
								<p className="text-xs text-muted-foreground">
									Kéo marker để chỉnh vị trí, hoặc nhập thời điểm chính xác bằng
									giây ở bên phải.
								</p>
							</div>
							<div className="space-y-3">
								<h3 className="text-sm font-medium">
									Điểm cắt ({cuts.length})
								</h3>
								{!cuts.length && (
									<p className="text-sm text-muted-foreground">
										Dừng video tại vị trí muốn chia rồi bấm Thêm điểm cắt.
									</p>
								)}
								<div className="space-y-2 max-h-64 overflow-y-auto">
									{sortedCuts.map((cut, index) => (
										<div key={cut.id} className="flex items-center gap-2">
											<label
												htmlFor={`cut-${cut.id}`}
												className="text-xs shrink-0"
											>
												#{index + 1}
											</label>
											<Input
												id={`cut-${cut.id}`}
												aria-label={`Thời điểm cắt ${index + 1} (giây)`}
												type="number"
												min={0}
												max={selected.duration}
												step={0.001}
												value={Number.isFinite(cut.time) ? cut.time : ""}
												onChange={(event) => {
													const time = event.currentTarget.valueAsNumber;
													const next = cuts.map((point) =>
														point.id === cut.id ? { ...point, time } : point,
													);
													setCuts(next);
													persistDraft({ nextCuts: next });
													setError(null);
												}}
											/>
											<Button
												variant="ghost"
												size="icon"
												aria-label={`Xóa điểm cắt ${index + 1}`}
												onClick={() => {
													const next = cuts.filter(
														(point) => point.id !== cut.id,
													);
													setCuts(next);
													persistDraft({ nextCuts: next });
													setError(null);
												}}
											>
												×
											</Button>
										</div>
									))}
								</div>
								{preview.error ? (
									<p role="alert" className="text-sm text-destructive">
										{preview.error}
									</p>
								) : (
									<div className="border-t pt-3 space-y-2">
										<h3 className="text-sm font-medium">
											Sẽ tạo {preview.ranges.length} đoạn
										</h3>
										<div className="max-h-48 overflow-y-auto space-y-1">
											{preview.ranges.map((range, index) => (
												<p
													key={range.start}
													className="text-xs text-muted-foreground"
												>
													Part {index + 1}:{" "}
													{formatTime({ seconds: range.start })} →{" "}
													{formatTime({ seconds: range.end })}
												</p>
											))}
										</div>
									</div>
								)}
							</div>
						</div>
					)}
					{step === "confirm" && selected && (
						<>
							<p className="text-sm text-muted-foreground">
								Mỗi project chứa một đoạn video với âm thanh gốc, chưa có chỉnh
								sửa. Video nguồn được giữ lại.
							</p>
							<label htmlFor="split-base-name" className="text-sm font-medium">
								Tên project
							</label>
							<Input
								id="split-base-name"
								value={baseName}
								maxLength={150}
								disabled={
									busy ||
									created.length > 0 ||
									(!!job && job.status !== "draft")
								}
								onChange={(event) => {
									setBaseName(event.currentTarget.value);
									persistDraft({ name: event.currentTarget.value });
								}}
							/>
							<ol className="divide-y rounded-md border max-h-64 overflow-y-auto">
								{preview.ranges.map((range, index) => (
									<li
										key={range.start}
										className="px-3 py-2 flex flex-col sm:flex-row sm:justify-between gap-1 text-sm"
									>
										<span className="truncate">
											{baseName.trim()} - Part {index + 1}
										</span>
										<span className="text-muted-foreground text-xs shrink-0">
											{formatTime({ seconds: range.start })} →{" "}
											{formatTime({ seconds: range.end })}
										</span>
									</li>
								))}
							</ol>
							{busy && (
								<div role="status" className="space-y-2">
									<p className="text-sm">{status}</p>
									<progress
										aria-label="Tiến độ tạo project"
										max={1}
										value={progress ?? undefined}
										className="w-full accent-primary"
									/>
								</div>
							)}
							{created.length > 0 && !busy && (
								<div className="space-y-2">
									<p className="text-sm">Đã lưu {created.length} project:</p>
									{created.map((project) => (
										<Button
											key={project.id}
											variant="link"
											className="block text-left"
											onClick={() => void openProject({ id: project.id })}
										>
											{project.name}
										</Button>
									))}
								</div>
							)}
						</>
					)}
				</DialogBody>
				<DialogFooter>
					{step === "select" ? (
						<Button
							variant="outline"
							disabled={loading}
							onClick={() => {
								setError(null);
								setLoading(true);
								setReload((value) => value + 1);
							}}
						>
							Làm mới
						</Button>
					) : (
						<Button
							variant="outline"
							disabled={
								busy ||
								created.length > 0 ||
								job?.status === "queued" ||
								job?.status === "splitting" ||
								job?.status === "ready"
							}
							onClick={() => {
								setError(null);
								if (job && job.status !== "draft") {
									setJob(null);
									setDraftId(generateUUID());
								}
								setStep(step === "confirm" ? "cuts" : "select");
								persistDraft({
									nextStep: step === "confirm" ? "cuts" : "select",
								});
							}}
						>
							Quay lại
						</Button>
					)}
					<Button variant="outline" onClick={requestClose}>
						{busy ? "Đóng, xử lý nền" : "Đóng, giữ bản nháp"}
					</Button>
					{busy && (
						<Button variant="outline" onClick={cancel}>
							Dừng tác vụ
						</Button>
					)}
					{step === "cuts" && (
						<Button
							disabled={!cuts.length || !!preview.error}
							onClick={() => {
								videoRef.current?.pause();
								setError(null);
								setStep("confirm");
								persistDraft({ nextStep: "confirm" });
							}}
						>
							Tiếp tục · {preview.ranges.length} project
						</Button>
					)}
					{step === "confirm" && job?.status !== "completed" && (
						<Button
							disabled={
								busy || !baseName.trim() || !!preview.error || !cuts.length
							}
							onClick={() => void createProjects()}
						>
							{job && job.status !== "draft" ? "Tiếp tục tạo/lưu" : "Tạo"}{" "}
							{preview.ranges.length} project
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
