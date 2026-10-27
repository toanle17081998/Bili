"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VIENEU_PRESET_VOICES } from "@/providers/tts/voices";
import type {
	StoryDefaults,
	StoryDocument,
	StoryJob,
	StoryProject,
	StorySegment,
	StorySettings,
	StorySource,
} from "@/story-narrator/types";

const endpoint = "/api/localization/story";
const fieldClass =
	"w-full rounded-md border border-neutral-700 bg-neutral-950 p-2 text-xs";
const timeLabel = (seconds: number) =>
	`${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
function isStoryStyle(value: string): value is StorySettings["style"] {
	return [
		"dramatic_challenge",
		"funny_commentary",
		"documentary",
		"engineering_explainer",
		"viral_short_form",
	].includes(value);
}
const claimLabels: Record<string, string> = {
	main_character: "Nhân vật",
	setting: "Bối cảnh",
	central_challenge: "Thử thách",
	goal: "Mục tiêu",
	stakes: "Điều được/mất",
	initial_situation: "Tình huống đầu",
	obstacles: "Trở ngại",
	attempts: "Các lần thử",
	turning_point: "Bước ngoặt",
	climax: "Cao trào",
	resolution: "Kết thúc",
	final_outcome: "Kết quả thực tế",
};

export function StoryNarratorPanel({
	projectId,
	getSource,
	onImportRender,
}: {
	projectId: string;
	getSource: () => StorySource;
	onImportRender: (project: StoryProject) => Promise<void>;
}) {
	const [project, setProject] = useState<StoryProject | null>(null);
	const [job, setJob] = useState<StoryJob | null>(null);
	const [settings, setSettings] = useState<StorySettings | null>(null);
	const [mix, setMix] = useState<StoryProject["mix"] | null>(null);
	const [voice, setVoice] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const [tab, setTab] = useState("analysis");
	const video = useRef<HTMLVideoElement>(null);
	const uploadAbort = useRef<AbortController | null>(null);
	const alive = useRef(true);
	const busy = pending || job?.status === "running";
	const accept = useCallback(
		(data: {
			project: StoryProject | null;
			job: StoryJob | null;
			defaults: StoryDefaults;
		}) => {
			setProject(data.project);
			setJob(data.job);
			setSettings(
				(old) => old ?? data.project?.settings ?? data.defaults.settings,
			);
			setMix((old) => old ?? data.project?.mix ?? data.defaults.mix);
			setVoice((old) => old || data.project?.voice || data.defaults.voice);
		},
		[],
	);
	const reload = useCallback(
		async (signal?: AbortSignal) => {
			const response = await fetch(
				`${endpoint}?projectId=${encodeURIComponent(projectId)}`,
				{ cache: "no-store", signal },
			);
			const data = await response.json();
			if (!response.ok || !data.success)
				throw new Error(data.error || "Không tải được Story Narrator.");
			if (alive.current) accept(data);
		},
		[projectId, accept],
	);
	useEffect(() => {
		alive.current = true;
		const controller = new AbortController();
		void reload(controller.signal).catch((reason: Error) => {
			if (!controller.signal.aborted) setError(reason.message);
		});
		return () => {
			alive.current = false;
			controller.abort();
			uploadAbort.current?.abort();
		};
	}, [reload]);
	useEffect(() => {
		if (job?.status !== "running") return;
		const controller = new AbortController();
		let timer: ReturnType<typeof setTimeout>;
		const poll = async () => {
			try {
				await reload(controller.signal);
			} catch (reason) {
				if (!controller.signal.aborted)
					setError(
						reason instanceof Error
							? reason.message
							: "Mất kết nối; job tiếp tục trên máy chủ.",
					);
			}
			if (!controller.signal.aborted) timer = setTimeout(poll, 1500);
		};
		timer = setTimeout(poll, 1500);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	}, [job?.status, reload]);
	async function request({ method, body }: { method: string; body: unknown }) {
		const response = await fetch(endpoint, {
			method,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		const data = await response.json();
		if (!response.ok || !data.success)
			throw new Error(data.error || "Yêu cầu thất bại.");
		return data;
	}
	async function run({
		action,
		extra = {},
	}: {
		action: string;
		extra?: Record<string, unknown>;
	}) {
		setPending(true);
		setError("");
		try {
			const data = await request({
				method: "POST",
				body: {
					projectId,
					action,
					revision: project?.revision,
					voice,
					settings,
					...extra,
				},
			});
			setJob(data.job);
		} catch (reason) {
			setError(
				reason instanceof Error ? reason.message : "Không chạy được job.",
			);
		} finally {
			setPending(false);
		}
	}
	async function analyze() {
		setPending(true);
		setError("");
		const controller = new AbortController();
		uploadAbort.current = controller;
		try {
			const source = getSource();
			if (project?.source_signature === source.signature) {
				await run({ action: "story" });
				return;
			}
			const form = new FormData();
			form.set("video", source.file);
			form.set("projectId", projectId);
			form.set("start", String(source.start));
			form.set("duration", String(source.duration));
			form.set("purpose", "story");
			const response = await fetch("/api/localization/sources", {
				method: "POST",
				body: form,
				signal: controller.signal,
			});
			const data = await response.json();
			if (!response.ok || !data.success)
				throw new Error(data.error || "Không chuẩn bị được video.");
			await run({
				action: "analyze",
				extra: {
					videoPath: data.videoPath,
					sourceSignature: source.signature,
					timelineStart: source.timelineStart,
					sourceElementId: source.elementId,
				},
			});
		} catch (reason) {
			setError(
				controller.signal.aborted
					? "Đã hủy chuẩn bị nguồn."
					: reason instanceof Error
						? reason.message
						: "Không phân tích được video.",
			);
		} finally {
			setPending(false);
			uploadAbort.current = null;
		}
	}
	async function save(body: Record<string, unknown>) {
		setPending(true);
		setError("");
		try {
			const data = await request({
				method: "PATCH",
				body: { projectId, revision: project?.revision, ...body },
			});
			setProject(data.project);
		} catch (reason) {
			setError(
				reason instanceof Error ? reason.message : "Không lưu được chỉnh sửa.",
			);
		} finally {
			setPending(false);
		}
	}
	async function cancel() {
		uploadAbort.current?.abort();
		try {
			const response = await fetch(
				`${endpoint}?projectId=${encodeURIComponent(projectId)}`,
				{ method: "DELETE" },
			);
			if (!response.ok) throw new Error("Không hủy được job.");
		} catch (reason) {
			setError(
				reason instanceof Error ? reason.message : "Không hủy được job.",
			);
		}
	}
	const issues = [
		...(project?.review?.issues ?? []),
		...(project?.ai_review?.issues ?? []),
	];
	return (
		<div className="flex flex-col gap-4 text-xs">
			<div>
				<h4 className="font-semibold text-rose-300">
					AI Story Narrator · LEGO Challenge
				</h4>
				<p className="mt-1 text-neutral-400">
					Chọn một video trên timeline. Phân tích diễn biến, duyệt câu chuyện
					rồi tạo giọng VieNeu.
				</p>
			</div>
			{error && (
				<p
					role="alert"
					className="rounded border border-red-800 bg-red-950/40 p-2 text-red-300"
				>
					{error}
				</p>
			)}
			{job && (
				<div
					className="rounded border border-neutral-700 p-2"
					role="status"
					aria-live="polite"
				>
					<p>
						{job.stage} · {Math.round(job.progress)}% · {job.status}
					</p>
					{job.status === "running" && (
						<progress value={job.progress} max={100} className="mt-2 w-full" />
					)}
					{job.error && <p className="mt-1 text-amber-300">{job.error}</p>}
				</div>
			)}
			<div className="flex gap-2">
				<Button
					size="sm"
					disabled={busy || !settings}
					onClick={analyze}
					className="flex-1 text-xs"
				>
					{pending ? "Đang chuẩn bị..." : "Phân tích & Tạo kịch bản AI"}
				</Button>
				{busy && (
					<Button size="sm" variant="outline" onClick={cancel}>
						Hủy
					</Button>
				)}
				{!busy && (
					<Button
						size="sm"
						variant="outline"
						onClick={() => {
							void reload().catch((reason: Error) => setError(reason.message));
						}}
					>
						Tải lại
					</Button>
				)}
			</div>
			{settings && (
				<details className="rounded border border-neutral-800 p-2">
					<summary className="cursor-pointer font-medium">
						Phong cách kể chuyện
					</summary>
					<fieldset disabled={busy} className="mt-3 grid grid-cols-2 gap-3">
						<label className="col-span-2">
							Phong cách
							<select
								className={fieldClass}
								value={settings.style}
								onChange={(e) => {
									if (isStoryStyle(e.target.value))
										setSettings({ ...settings, style: e.target.value });
								}}
							>
								<option value="dramatic_challenge">
									Dramatic Challenge · Kịch tính
								</option>
								<option value="funny_commentary">
									Funny Commentary · Hài hước
								</option>
								<option value="documentary">Documentary · Tài liệu</option>
								<option value="engineering_explainer">
									Engineering Explainer · Kỹ thuật
								</option>
								<option value="viral_short_form">
									Viral Short-Form · Video ngắn
								</option>
							</select>
						</label>
						<label htmlFor="story-language">
							Ngôn ngữ
							<Input
								id="story-language"
								size="xs"
								value={settings.language}
								onChange={(e) =>
									setSettings({ ...settings, language: e.target.value })
								}
							/>
						</label>
						<label>
							Ngôi kể
							<select
								className={fieldClass}
								value={settings.perspective}
								onChange={(e) =>
									setSettings({
										...settings,
										perspective: e.target.value === "first" ? "first" : "third",
									})
								}
							>
								<option value="third">Ngôi thứ ba</option>
								<option value="first">Ngôi thứ nhất</option>
							</select>
						</label>
						{(
							[
								"drama",
								"humor",
								"density",
								"speaking_rate",
								"sentence_words",
							] as const
						).map((key) => (
							<label key={key} htmlFor={`story-setting-${key}`}>
								{
									{
										drama: "Kịch tính",
										humor: "Hài hước",
										density: "Mật độ lời",
										speaking_rate: "Tốc độ kể",
										sentence_words: "Số từ/câu",
									}[key]
								}
								<Input
									id={`story-setting-${key}`}
									type="number"
									size="xs"
									value={settings[key]}
									min={
										key === "speaking_rate"
											? 0.8
											: key === "sentence_words"
												? 8
												: 0
									}
									max={
										key === "speaking_rate"
											? 1.2
											: key === "sentence_words"
												? 50
												: 1
									}
									step={key === "sentence_words" ? 1 : 0.05}
									onChange={(e) =>
										setSettings({ ...settings, [key]: Number(e.target.value) })
									}
								/>
							</label>
						))}
						<label className="col-span-2" htmlFor="story-notes">
							Ngữ cảnh và yêu cầu biên tập
							<Textarea
								id="story-notes"
								className="text-xs"
								maxLength={1000}
								value={settings.notes}
								onChange={(e) =>
									setSettings({ ...settings, notes: e.target.value })
								}
							/>
						</label>
						{project && (
							<Button
								size="sm"
								variant="outline"
								className="col-span-2"
								onClick={() => run({ action: "story" })}
							>
								Áp dụng phong cách · dùng lại phân tích
							</Button>
						)}
					</fieldset>
				</details>
			)}
			<Tabs value={tab} onValueChange={setTab}>
				<TabsList className="grid w-full grid-cols-4">
					<TabsTrigger value="analysis" className="px-1 text-[11px]">
						Phân tích
					</TabsTrigger>
					<TabsTrigger value="story" className="px-1 text-[11px]">
						Câu chuyện
					</TabsTrigger>
					<TabsTrigger value="timeline" className="px-1 text-[11px]">
						Timeline
					</TabsTrigger>
					<TabsTrigger value="export" className="px-1 text-[11px]">
						Xuất video
					</TabsTrigger>
				</TabsList>
				<TabsContent value="analysis" className="mt-3 space-y-3">
					{project ? (
						<>
							{/* Source videos may have no speech transcript. Narration text is shown in the other tabs. */}
							{/* eslint-disable-next-line jsx-a11y/media-has-caption -- No transcript is fabricated for the original audio. */}
							<video
								ref={video}
								src={`/api/media/stream?file=${encodeURIComponent(project.original_path)}`}
								controls
								preload="metadata"
								className="w-full rounded bg-black"
								aria-label="Video nguồn"
							/>
							<p>
								{timeLabel(project.duration)} · {project.metadata.width} ×{" "}
								{project.metadata.height} · {project.metadata.fps.toFixed(2)}{" "}
								FPS ·{" "}
								{project.metadata.hasAudio
									? "Có âm thanh"
									: "Không có âm thanh"}
							</p>
							<div className="flex flex-wrap gap-1" aria-label="Scene timeline">
								{project.scenes.map((scene) => (
									<Button
										key={scene.id}
										size="sm"
										variant="outline"
										className="text-[10px]"
										onClick={() => {
											if (video.current)
												video.current.currentTime = scene.start;
										}}
									>
										{timeLabel(scene.start)}
									</Button>
								))}
							</div>
							{[...project.warnings, ...project.uncertainties].map(
								(warning, i) => (
									<p key={i} className="text-amber-300">
										{warning}
									</p>
								),
							)}
							{project.story &&
								["setting", "goal", "obstacles", "final_outcome"].map((key) => (
									<p key={key}>
										<strong>{claimLabels[key]}:</strong>{" "}
										{project.story!.understanding[key]?.text ||
											"Chưa đủ bằng chứng"}
									</p>
								))}
							{project.events.map((event) => (
								<div
									key={event.id}
									className="rounded border border-neutral-800 p-2"
								>
									<button
										className="text-rose-300 underline"
										onClick={() => {
											if (video.current)
												video.current.currentTime = event.start;
										}}
									>
										{timeLabel(event.start)} – {timeLabel(event.end)}
									</button>
									<p className="mt-1">{event.description}</p>
									<p className="mt-1 text-neutral-400">
										{event.id} · {event.event_type} · {event.source} · độ tin
										cậy {Math.round(event.confidence * 100)}%
										{event.preserve_audio ? " · Giữ âm gốc" : ""}
									</p>
								</div>
							))}
						</>
					) : (
						<p className="text-neutral-400">
							Phân tích video đã chọn để xem cảnh, sự kiện và bằng chứng.
						</p>
					)}
				</TabsContent>
				<TabsContent value="story" className="mt-3 space-y-3">
					{project?.story ? (
						<StoryEditor
							key={project.revision}
							story={project.story}
							disabled={busy}
							onSave={(story) => save({ story })}
						/>
					) : (
						<p className="text-neutral-400">
							Câu chuyện sẽ xuất hiện sau khi tổng hợp toàn bộ sự kiện.
						</p>
					)}
				</TabsContent>
				<TabsContent value="timeline" className="mt-3 space-y-3">
					<label>
						Giọng đọc VieNeu
						<select
							className={fieldClass}
							disabled={busy}
							value={voice}
							onChange={(e) => setVoice(e.target.value)}
						>
							{VIENEU_PRESET_VOICES.map((v) => (
								<option key={v.id} value={v.id}>
									{v.name}
								</option>
							))}
						</select>
					</label>
					<p className="text-neutral-400">
						Đổi giọng dùng lại câu chuyện và phân tích. TTS chỉ hỗ trợ tiếng
						Việt.
					</p>
					<Button
						size="sm"
						disabled={busy || !project?.segments.length}
						onClick={() => run({ action: "tts" })}
					>
						Tạo giọng cho timeline
					</Button>
					{project?.segments.map((segment) => (
						<SegmentEditor
							key={`${segment.segment_id}-${project.revision}`}
							segment={segment}
							disabled={busy}
							onSave={(patch) => save({ segmentId: segment.segment_id, patch })}
							onRewrite={() =>
								run({
									action: "rewrite",
									extra: { segmentId: segment.segment_id },
								})
							}
							onVoice={() =>
								run({ action: "tts", extra: { segmentId: segment.segment_id } })
							}
						/>
					))}
				</TabsContent>
				<TabsContent value="export" className="mt-3 space-y-3">
					{mix && (
						<fieldset disabled={busy} className="grid grid-cols-2 gap-3">
							<label htmlFor="story-original-volume">
								Âm lượng gốc
								<Input
									id="story-original-volume"
									size="xs"
									type="number"
									min={0}
									max={2}
									step={0.1}
									value={mix.original_volume}
									onChange={(e) =>
										setMix({ ...mix, original_volume: Number(e.target.value) })
									}
								/>
							</label>
							<label htmlFor="story-voice-volume">
								Âm lượng giọng
								<Input
									id="story-voice-volume"
									size="xs"
									type="number"
									min={0}
									max={2}
									step={0.1}
									value={mix.voice_volume}
									onChange={(e) =>
										setMix({ ...mix, voice_volume: Number(e.target.value) })
									}
								/>
							</label>
							<label className="col-span-2 flex items-center gap-2">
								<input
									type="checkbox"
									checked={mix.ducking}
									onChange={(e) =>
										setMix({ ...mix, ducking: e.target.checked })
									}
								/>
								Giảm âm nền khi có lời đọc
							</label>
							<label className="col-span-2">
								Chất lượng
								<select
									className={fieldClass}
									value={mix.quality}
									onChange={(e) =>
										setMix({
											...mix,
											quality:
												e.target.value === "preview"
													? "preview"
													: e.target.value === "high"
														? "high"
														: "standard",
										})
									}
								>
									<option value="preview">Xem thử nhanh</option>
									<option value="standard">Tiêu chuẩn</option>
									<option value="high">Chất lượng cao</option>
								</select>
							</label>
							<Button
								className="col-span-2"
								size="sm"
								disabled={
									!project?.segments.length ||
									project.segments.some((s) => !s.audio) ||
									project.voice !== voice
								}
								onClick={() => run({ action: "render", extra: { mix } })}
							>
								Mix & Xuất video
							</Button>
						</fieldset>
					)}
					{project?.render && (
						<>
							<video
								src={project.render.url}
								controls
								preload="metadata"
								className="w-full rounded bg-black"
								aria-label="Video đã thuyết minh"
							>
								<track
									kind="captions"
									srcLang={project.settings.language}
									label="Lời thuyết minh"
									src={project.render.captions_url}
									default
								/>
							</video>
							<a
								href={project.render.url}
								download="lego-story.mp4"
								className="text-rose-300 underline"
							>
								Tải video
							</a>
						</>
					)}
					{project?.render && (
						<Button
							size="sm"
							variant="outline"
							disabled={busy}
							onClick={async () => {
								setPending(true);
								setError("");
								try {
									await onImportRender(project);
								} catch (reason) {
									setError(
										reason instanceof Error
											? reason.message
											: "Không nhập được thành phẩm.",
									);
								} finally {
									setPending(false);
								}
							}}
						>
							Thêm thành phẩm vào thư viện video
						</Button>
					)}
					{project && (
						<>
							<p className="text-neutral-400">
								Project và audio được lưu tự động trên máy chủ sau mỗi bước. Mở
								lại dự án để tiếp tục chỉnh sửa.
							</p>
							<Button
								size="sm"
								variant="outline"
								onClick={() => {
									const url = URL.createObjectURL(
										new Blob([JSON.stringify(project, null, 2)], {
											type: "application/json",
										}),
									);
									const link = document.createElement("a");
									link.href = url;
									link.download = "story-project.json";
									link.click();
									setTimeout(() => URL.revokeObjectURL(url), 1000);
								}}
							>
								Tải dữ liệu project JSON
							</Button>
						</>
					)}
				</TabsContent>
			</Tabs>
			{project?.story && (
				<div className="rounded border border-neutral-800 p-3">
					<div className="mb-2 flex items-center justify-between">
						<strong>Script Quality Review</strong>
						<Button
							size="sm"
							variant="outline"
							disabled={busy}
							onClick={() => run({ action: "review" })}
						>
							Kiểm tra
						</Button>
					</div>
					{issues.length ? (
						issues.map((issue, i) => (
							<p
								key={i}
								className={`mb-2 ${issue.severity === "error" ? "text-red-300" : "text-amber-300"}`}
							>
								{issue.segment_id ? `${issue.segment_id}: ` : ""}
								{issue.message}
							</p>
						))
					) : (
						<p className="text-neutral-400">
							{project.ai_review
								? "Chưa phát hiện lỗi qua các kiểm tra hiện có. Cần duyệt video và lời đọc trước khi xuất."
								: "Cần chạy kiểm tra trước khi tạo TTS."}
						</p>
					)}
				</div>
			)}
		</div>
	);
}

function StoryEditor({
	story,
	disabled,
	onSave,
}: {
	story: StoryDocument;
	disabled: boolean;
	onSave: (story: StoryDocument) => Promise<void>;
}) {
	const [draft, setDraft] = useState(story);
	return (
		<fieldset disabled={disabled} className="space-y-3">
			<label className="block" htmlFor="story-title">
				Tiêu đề
				<Input
					id="story-title"
					size="xs"
					value={draft.title}
					onChange={(e) => setDraft({ ...draft, title: e.target.value })}
				/>
			</label>
			<label className="block" htmlFor="story-summary">
				Tóm tắt
				<Textarea
					id="story-summary"
					className="text-xs"
					value={draft.summary}
					onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
				/>
			</label>
			{Object.entries(draft.understanding).map(([key, claim]) => (
				<div key={key}>
					{claim ? (
						<label htmlFor={`story-claim-${key}`}>
							{claimLabels[key] || key}
							<Textarea
								id={`story-claim-${key}`}
								className="text-xs"
								value={claim.text}
								onChange={(e) =>
									setDraft({
										...draft,
										understanding: {
											...draft.understanding,
											[key]: { ...claim, text: e.target.value },
										},
									})
								}
							/>
						</label>
					) : (
						<p className="mt-1 text-neutral-500">
							{claimLabels[key] || key}: Chưa có bằng chứng trong video
						</p>
					)}
				</div>
			))}
			<div>
				<strong>Story outline</strong>
				{draft.outline.map((act, index) => (
					<p key={index} className="mt-1 text-neutral-300">
						{act.role}: {act.description}
					</p>
				))}
			</div>
			<strong className="block">Kịch bản toàn bộ · các đoạn liên tục</strong>
			{draft.paragraphs.map((paragraph, index) => (
				<label
					key={paragraph.id}
					htmlFor={`story-paragraph-${paragraph.id}`}
					className="block"
				>
					{paragraph.role} · {paragraph.event_ids.join(", ")}
					<Textarea
						id={`story-paragraph-${paragraph.id}`}
						className="text-xs"
						rows={4}
						value={paragraph.text}
						onChange={(e) =>
							setDraft({
								...draft,
								paragraphs: draft.paragraphs.map((p, i) =>
									i === index ? { ...p, text: e.target.value } : p,
								),
							})
						}
					/>
				</label>
			))}
			<Button size="sm" onClick={() => onSave(draft)}>
				Lưu câu chuyện
			</Button>
		</fieldset>
	);
}

function SegmentEditor({
	segment,
	disabled,
	onSave,
	onRewrite,
	onVoice,
}: {
	segment: StorySegment;
	disabled: boolean;
	onSave: (patch: Record<string, unknown>) => Promise<void>;
	onRewrite: () => Promise<void>;
	onVoice: () => Promise<void>;
}) {
	const [text, setText] = useState(segment.narration_text);
	const [start, setStart] = useState(String(segment.start_time));
	const [end, setEnd] = useState(String(segment.end_time));
	return (
		<div className="space-y-2 rounded border border-neutral-700 p-3">
			<div className="flex justify-between">
				<strong>
					{segment.segment_id} · {segment.story_role}
				</strong>
				<label className="flex items-center gap-1">
					<input
						type="checkbox"
						checked={segment.locked}
						disabled={disabled}
						onChange={(e) => onSave({ locked: e.target.checked })}
					/>
					Khóa
				</label>
			</div>
			<p className="text-neutral-400">
				{segment.emotion} · dự kiến {segment.estimated_duration.toFixed(2)}s ·
				TTS{" "}
				{segment.audio
					? `${segment.audio.duration.toFixed(2)}s (×${segment.audio.tempo.toFixed(2)})`
					: "chưa tạo"}
			</p>
			<fieldset disabled={disabled || segment.locked} className="space-y-2">
				<div className="grid grid-cols-2 gap-2">
					<label htmlFor={`story-start-${segment.segment_id}`}>
						Bắt đầu (s)
						<Input
							id={`story-start-${segment.segment_id}`}
							size="xs"
							type="number"
							step="0.05"
							value={start}
							onChange={(e) => setStart(e.target.value)}
						/>
					</label>
					<label htmlFor={`story-end-${segment.segment_id}`}>
						Kết thúc (s)
						<Input
							id={`story-end-${segment.segment_id}`}
							size="xs"
							type="number"
							step="0.05"
							value={end}
							onChange={(e) => setEnd(e.target.value)}
						/>
					</label>
				</div>
				<label className="block" htmlFor={`story-text-${segment.segment_id}`}>
					Lời thuyết minh
					<Textarea
						id={`story-text-${segment.segment_id}`}
						className="text-xs"
						rows={4}
						value={text}
						onChange={(e) => setText(e.target.value)}
					/>
				</label>
				<div className="flex gap-2">
					<Button
						size="sm"
						variant="outline"
						onClick={() =>
							onSave({
								narration_text: text,
								start_time: Number(start),
								end_time: Number(end),
							})
						}
					>
						Lưu đoạn
					</Button>
					<Button size="sm" variant="outline" onClick={onRewrite}>
						AI viết lại
					</Button>
				</div>
			</fieldset>
			<Button size="sm" variant="outline" disabled={disabled} onClick={onVoice}>
				Tạo lại giọng đoạn này
			</Button>
			{segment.audio && (
				// eslint-disable-next-line jsx-a11y/media-has-caption -- The complete transcript is the labeled narration field above.
				<audio
					controls
					preload="none"
					src={segment.audio.url}
					className="h-8 w-full"
					aria-label={`Nghe ${segment.segment_id}`}
					aria-describedby={`story-text-${segment.segment_id}`}
				/>
			)}
			<p className="text-[10px] text-neutral-500">
				Bằng chứng: {segment.associated_event_ids.join(", ")} · nghỉ{" "}
				{segment.pause_before}s / {segment.pause_after}s
			</p>
		</div>
	);
}
