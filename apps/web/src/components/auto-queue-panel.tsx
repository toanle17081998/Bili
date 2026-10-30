"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/utils/ui";
import {
	AutoQueueOptionsDialog,
	type EditableQueueJob,
} from "./auto-queue-options-dialog";

interface QueueJob extends EditableQueueJob {
	stage: string;
	progress: number;
	outputPath?: string;
	error?: string;
}

const STATUS_LABEL: Record<QueueJob["status"], string> = {
	queued: "Chờ",
	running: "Đang chạy",
	done: "Xong",
	failed: "Lỗi",
	cancelled: "Đã hủy",
};

export function AutoQueuePanel({ refreshKey }: { refreshKey: number }) {
	const [jobs, setJobs] = useState<QueueJob[]>([]);
	const [open, setOpen] = useState(true);
	const [editingJob, setEditingJob] = useState<QueueJob | null>(null);
	const [editQuality, setEditQuality] = useState("best");

	const refresh = useCallback(async () => {
		try {
			const res = await fetch("/api/auto-queue", { cache: "no-store" });
			const data = await res.json();
			if (data.success) setJobs(data.jobs);
		} catch {
			/* keep previous state */
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh, refreshKey]);

	const active = jobs.some(
		(job) => job.status === "queued" || job.status === "running",
	);
	useEffect(() => {
		if (!active) return;
		const timer = setInterval(() => void refresh(), 3000);
		return () => clearInterval(timer);
	}, [active, refresh]);

	const remove = async (job: QueueJob) => {
		const res = await fetch(`/api/auto-queue?id=${encodeURIComponent(job.id)}`, {
			method: "DELETE",
		});
		if (!res.ok) toast.error("Không thể xóa job.");
		void refresh();
	};

	const retry = async (job: QueueJob) => {
		const res = await fetch(`/api/auto-queue?id=${encodeURIComponent(job.id)}`, {
			method: "PATCH",
		});
		if (!res.ok) toast.error("Không thể chạy lại job.");
		else toast.success("Đã đưa lại vào hàng đợi!");
		void refresh();
	};

	const requeueAllDone = async () => {
		const doneCount = jobs.filter((job) => job.status === "done").length;
		if (
			!window.confirm(
				`Render lại ${doneCount} video đã xong để áp dụng hiệu ứng âm thanh mới? File cũ trong thư mục đích sẽ được ghi đè.`,
			)
		)
			return;
		const res = await fetch("/api/auto-queue?action=requeue-done", {
			method: "PATCH",
		});
		if (!res.ok) toast.error("Không thể đưa các video vào hàng đợi lại.");
		else toast.success(`Đã đưa ${doneCount} video vào hàng đợi render lại!`);
		void refresh();
	};

	if (!jobs.length) return null;

	return (
		<div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-neutral-800 bg-neutral-900/95 shadow-2xl backdrop-blur">
			<button
				type="button"
				onClick={() => setOpen((value) => !value)}
				className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-neutral-100"
			>
				<span>Hàng đợi Auto ({jobs.length})</span>
				<span className="text-xs text-neutral-400">{open ? "Thu gọn" : "Mở"}</span>
			</button>
			{open && jobs.some((job) => job.status === "done") && (
				<div className="border-t border-neutral-800 px-3 pt-2">
					<button
						type="button"
						onClick={() => void requeueAllDone()}
						className="w-full rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/20"
					>
						🔄 Render lại tất cả video đã xong ({jobs.filter((job) => job.status === "done").length})
					</button>
				</div>
			)}
			{open && (
				<ul className="max-h-72 space-y-2 overflow-y-auto border-t border-neutral-800 p-3">
					{jobs.map((job) => {
						const baseMusicLabel =
							!job.options?.musicFile || job.options.musicFile === "random"
								? "Nhạc random (nối bài)"
								: job.options.musicFile === "none"
									? "Tắt nhạc"
									: job.options.musicFiles && job.options.musicFiles.length > 1
										? `${job.options.musicFiles.length} bài nhạc`
										: job.options.musicFile;
						const musicLabel =
							job.options?.audioMode === "keep_original_bgm"
								? "Giữ SFX & nhạc gốc"
								: job.options?.audioMode === "keep_sfx_add_music"
									? `Giữ SFX + ${baseMusicLabel}`
									: baseMusicLabel;
						return (
							<li
								key={job.id}
								className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-2.5 text-xs"
							>
								<div className="flex items-center justify-between gap-2">
									<span
										className="truncate font-medium text-neutral-200"
										title={job.title}
									>
										{job.title}
									</span>
									<span
										className={cn(
											"shrink-0 rounded-full px-2 py-0.5",
											job.status === "done" && "bg-emerald-500/15 text-emerald-300",
											job.status === "failed" && "bg-rose-500/15 text-rose-300",
											job.status === "running" && "bg-indigo-500/15 text-indigo-300",
											(job.status === "queued" || job.status === "cancelled") &&
												"bg-neutral-800 text-neutral-400",
										)}
									>
										{STATUS_LABEL[job.status]}
									</span>
								</div>
								{job.options?.voice && (
									<p className="mt-0.5 truncate text-[11px] text-neutral-500">
										🎙 {job.options.voice} · 🎵 {musicLabel}
									</p>
								)}
								<p className="mt-1 text-neutral-400">{job.error || job.stage}</p>
								{(job.status === "running" || job.status === "queued") && (
									<div className="mt-1.5 h-1 overflow-hidden rounded bg-neutral-800">
										<div
											className="h-full bg-rose-500 transition-all"
											style={{ width: `${job.progress}%` }}
										/>
									</div>
								)}
								{job.outputPath && (
									<p className="mt-1 truncate text-neutral-500" title={job.outputPath}>
										{job.outputPath}
									</p>
								)}
								<div className="mt-1.5 flex items-center gap-3">
									<button
										type="button"
										onClick={() => {
											setEditQuality(
												job.options?.quality ? String(job.options.quality) : "best",
											);
											setEditingJob(job);
										}}
										className="font-medium text-indigo-400 hover:text-indigo-300"
									>
										⚙️ Sửa cấu hình
									</button>
									{(job.status === "failed" || job.status === "cancelled") && (
										<button
											type="button"
											onClick={() => void retry(job)}
											className="font-medium text-amber-400 hover:text-amber-300"
										>
											🔄 Chạy lại
										</button>
									)}
									<button
										type="button"
										onClick={() => void remove(job)}
										className="text-neutral-500 hover:text-rose-400"
									>
										{job.status === "running" || job.status === "queued" ? "Hủy" : "Xóa"}
									</button>
								</div>
							</li>
						);
					})}
				</ul>
			)}
			<AutoQueueOptionsDialog
				open={!!editingJob}
				onOpenChange={(nextOpen) => {
					if (!nextOpen) setEditingJob(null);
				}}
				video={null}
				editingJob={editingJob}
				qualities={[]}
				isLoadingQualities={false}
				selectedQuality={editQuality}
				onSelectedQualityChange={setEditQuality}
				onQueued={() => {
					setEditingJob(null);
					void refresh();
				}}
			/>
		</div>
	);
}
