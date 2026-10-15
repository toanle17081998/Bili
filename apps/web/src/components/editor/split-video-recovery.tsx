"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import {
	completeSplitBatch,
	createProjectsFromSplits,
	listSplitJobs,
	type SplitImportStage,
} from "@/services/split-video";
import { useEditor } from "@/editor/use-editor";
import { toast } from "sonner";
import {
	readSplitDrafts,
	removeSplitDraft,
	SPLIT_DRAFTS_EVENT,
	type SplitDraft,
} from "@/services/split-video/drafts";
import type { SplitJob } from "@/split-video/types";

const SplitVideoDialog = dynamic(() => import("./split-video-dialog"), {
	ssr: false,
});
interface RecoveryEntry {
	id: string;
	job?: SplitJob;
	draft?: SplitDraft;
}

export function SplitVideoRecovery() {
	const editor = useEditor();
	const [jobs, setJobs] = useState<SplitJob[]>([]);
	const [drafts, setDrafts] = useState<SplitDraft[]>([]);
	const [selected, setSelected] = useState<RecoveryEntry | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState<{
		batchId: string;
		text: string;
		saved: number;
		total: number;
	} | null>(null);
	const activeImport = useRef<string | null>(null);
	const failedImports = useRef(new Set<string>());
	const selectedId = useRef<string | null>(null);

	useEffect(() => {
		const controller = new AbortController();
		let polling = false;
		const autoSave = async (job: SplitJob) => {
			if (!job.result) return;
			activeImport.current = job.batchId;
			const onStage = (stage: SplitImportStage) => {
				const progress = stage.totalBytes
					? ` · ${Math.floor(((stage.receivedBytes ?? 0) / stage.totalBytes) * 100)}% tải file`
					: "";
				const phase =
					stage.phase === "waiting" ? "Đang chờ lượt lưu (có thể tab khác đang lưu)" : stage.phase === "download"
						? "Đang tải file để lưu"
						: stage.phase === "thumbnail"
							? "Đang tạo ảnh xem trước"
							: "Đang ghi vào bộ nhớ trình duyệt";
				setSaving({
					batchId: job.batchId,
					text: `${phase} · part ${stage.index}/${stage.total}${progress}`,
					saved: Math.max(0, stage.index - 1),
					total: stage.total,
				});
			};
			try {
				const outcome = await createProjectsFromSplits({
					result: job.result,
					baseName: job.baseName,
					editor,
					signal: controller.signal,
					onStage,
					onProgress: (value) =>
						setSaving({
							batchId: job.batchId,
							text: `Đã lưu ${value.created.length}/${value.total} project`,
							saved: value.created.length,
							total: value.total,
						}),
				});
				if (controller.signal.aborted || outcome.cancelled) return;
				if (outcome.failures.length)
					throw new Error(outcome.failures.join("\n"));
				await completeSplitBatch({ batchId: job.batchId });
				await removeSplitDraft({ batchId: job.batchId });
				await editor.project.loadAllProjects();
				toast.success(
					`Đã lưu ${outcome.created.length} project từ video đã chia.`,
				);
			} catch (failure: unknown) {
				if (!controller.signal.aborted) {
					failedImports.current.add(job.batchId);
					setError(
						failure instanceof Error
							? failure.message
							: "Không tự lưu được project. Các file cắt và mốc vẫn còn; bấm tiếp tục để thử lại.",
					);
				}
			} finally {
				activeImport.current = null;
				if (!controller.signal.aborted) setSaving(null);
			}
		};
		const readLocal = () => setDrafts(readSplitDrafts());
		const animationFrame = requestAnimationFrame(readLocal);
		const refresh = async () => {
			if (polling) return;
			polling = true;
			try {
				const records = await listSplitJobs({ signal: controller.signal });
				if (controller.signal.aborted) return;
				for (const job of records)
					if (
						job.status === "completed" &&
						readSplitDrafts().some((draft) => draft.batchId === job.batchId)
					)
						await removeSplitDraft({ batchId: job.batchId });
				setJobs(records);
				setDrafts(readSplitDrafts());
				if (!failedImports.current.size) setError(null);
				if (!activeImport.current && !selectedId.current) {
					const localIds = new Set(
						readSplitDrafts().map((draft) => draft.batchId),
					);
					const ready = records.find(
						(job) =>
							job.status === "ready" &&
							job.result &&
							localIds.has(job.batchId) &&
							!failedImports.current.has(job.batchId),
					);
					if (ready) void autoSave(ready);
				}
			} catch (failure: unknown) {
				if (!controller.signal.aborted)
					setError(
						failure instanceof Error
							? failure.message
							: "Không đọc được các phiên chia video.",
					);
			} finally {
				polling = false;
			}
		};
		void refresh();
		const timer = setInterval(() => void refresh(), 2000);
		window.addEventListener(SPLIT_DRAFTS_EVENT, readLocal);
		window.addEventListener("storage", readLocal);
		return () => {
			controller.abort();
			cancelAnimationFrame(animationFrame);
			clearInterval(timer);
			window.removeEventListener(SPLIT_DRAFTS_EVENT, readLocal);
			window.removeEventListener("storage", readLocal);
		};
	}, [editor]);

	const entries = new Map<string, RecoveryEntry>();
	for (const draft of drafts)
		entries.set(draft.batchId, { id: draft.batchId, draft });
	for (const job of jobs) {
		if (job.status === "completed") {
			entries.delete(job.batchId);
			continue;
		}
		const local = entries.get(job.batchId)?.draft;
		if (job.status === "draft" && local && local.revision > job.draftRevision)
			continue;
		entries.set(job.batchId, { id: job.batchId, job });
	}
	if (!entries.size && !selected) return null;
	return (
		<section
			className="mx-8 my-4 rounded-md border p-4 space-y-3"
			aria-label="Các phiên chia video đã lưu"
		>
			<div>
				<h2 className="text-sm font-semibold">
					Phiên chia video đang chờ / bản nháp đã lưu
				</h2>
				<p className="text-xs text-muted-foreground mt-1">
					Các mốc được giữ khi reload. Trang này tự lưu các phiên đã cắt xong
					của trình duyệt này; phần mới hiện trong danh sách ngay sau khi lưu.
				</p>
			</div>
			{error && (
				<p className="text-xs text-destructive" role="alert">
					{error}
				</p>
			)}
			{[...entries.values()].map((entry) => {
				const { job, draft } = entry;
				const name = job?.baseName ?? draft?.baseName;
				const count = job?.cuts.length ?? draft?.cuts.length ?? 0;
				const status = job?.status;
				const encoder = job?.encoderProgress;
				const label =
					saving?.batchId === entry.id
						? saving.text
						: status === "queued" || status === "splitting"
							? encoder
								? `Đang cắt đoạn ${encoder.part}/${job?.totalParts} · ${Math.min(100, Math.floor((encoder.seconds / encoder.partDuration) * 100))}% đoạn hiện tại${encoder.speed ? ` · tốc độ ${encoder.speed.toFixed(2)}×` : ""}`
								: `Đang cắt đoạn ${(job?.completedParts ?? 0) + 1}/${job?.totalParts} · đã xong ${job?.completedParts} đoạn`
							: status === "ready"
								? `Đã cắt xong · đã lưu ${job?.createdProjects.length}/${job?.totalParts} project`
								: status === "error"
									? "Lần trước gặp lỗi · mốc cắt còn nguyên"
									: status === "paused"
										? "Đã dừng · có thể tiếp tục"
										: "Bản nháp điểm cắt";
				return (
					<div
						key={entry.id}
						className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"
					>
						<div className="min-w-0">
							<p className="text-sm font-medium truncate">
								{name || job?.video.name || draft?.video.name}
							</p>
							<p className="text-xs text-muted-foreground">
								{count} điểm cắt · {label}
							</p>
							{saving?.batchId === entry.id && (
								<progress
									aria-label="Tiến độ lưu project"
									className="w-full mt-2"
									max={saving.total}
									value={saving.saved}
								/>
							)}
						</div>
						<Button
							variant="outline"
							disabled={saving?.batchId === entry.id}
							onClick={() => {
								selectedId.current = entry.id;
								setSelected(entry);
							}}
						>
							{saving?.batchId === entry.id
								? "Đang tự lưu project…"
								: "Tiếp tục phiên chia"}
						</Button>
					</div>
				);
			})}
			{selected && (
				<SplitVideoDialog
					initialJob={selected.job}
					initialDraft={selected.draft}
					onClose={() => {
						selectedId.current = null;
						setSelected(null);
					}}
				/>
			)}
		</section>
	);
}
