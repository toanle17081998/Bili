"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, LoaderCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEditor } from "@/editor/use-editor";
import { useLocalStorage } from "@/services/storage/use-local-storage";
import type { SceneTracks } from "@/timeline";
import type {
	SocialCopyResult,
	SocialPlatform,
	SocialPost,
	SocialTone,
} from "@/social-copy/types";
import {
	SocialCopyResultSchema,
	SocialPlatformSchema,
	SocialToneSchema,
} from "@/social-copy/schemas";

interface SavedCopy {
	title: string;
	content: string;
	tone: SocialTone;
	result: SocialCopyResult | null;
	automatic?: boolean;
	detectedContent?: string;
}

const PLATFORMS = [
	{
		id: "tiktok",
		label: "TikTok",
		hint: "Hook ngắn, caption cuốn hút và hashtag theo chủ đề.",
	},
	{
		id: "facebook",
		label: "FB Reels",
		hint: "Caption gần gũi, gợi mở thảo luận cùng hashtag liên quan.",
	},
	{
		id: "youtube",
		label: "YT Shorts",
		hint: "Tiêu đề rõ chủ đề, mô tả ngắn và hashtag cho Shorts.",
	},
] as const;

export function SocialCopyPanel({ projectId }: { projectId: string }) {
	const editor = useEditor();
	const projectName = useEditor((e) => e.project.getActive().metadata.name);
	const scene = useEditor((e) => e.scenes.getActiveSceneOrNull());
	const [saved, setSaved, isReady] = useLocalStorage<SavedCopy>({
		key: `social-copy:v1:${projectId}`,
		defaultValue: {
			title: "",
			content: "",
			tone: "engaging",
			result: null,
			automatic: true,
		},
	});
	const [platform, setPlatform] = useState<SocialPlatform>("tiktok");
	const [isGenerating, setIsGenerating] = useState(false);
	const [error, setError] = useState("");
	const [status, setStatus] = useState("");
	const requestRef = useRef<AbortController | null>(null);
	const transcriptRef = useRef<{ tracks: SceneTracks; content: string } | null>(null);
	const attemptedAutoRef = useRef(false);
	const automatic = saved.automatic ?? !saved.content.trim();
	const timelineContent = useMemo(() =>
		scene?.tracks.overlay
			.flatMap((track) => track.type === "text" && !track.hidden ? track.elements : [])
			.filter((element) => !element.hidden && typeof element.params.content === "string")
			.sort((a, b) => a.startTime - b.startTime)
			.map((element) => String(element.params.content).trim())
			.filter(Boolean).join("\n").slice(0, 12000) ?? "",
		[scene],
	);
	const content = automatic ? timelineContent || saved.detectedContent || "" : saved.content;

	useEffect(function cancelOnUnmount() {
		return () => requestRef.current?.abort();
	}, []);

	const updateForm = (patch: Partial<SavedCopy>) => {
		setSaved({ value: (previous) => ({ ...previous, ...patch }) });
	};

	const useSubtitles = () => {
		if (!timelineContent) {
			toast.info(
				"Chưa có phụ đề trên timeline. Hãy nhập mô tả video hoặc tạo phụ đề ở tab AI Việt hóa.",
			);
			return;
		}
		updateForm({ content: timelineContent, automatic: false });
		toast.success("Đã lấy nội dung chữ/phụ đề từ timeline.");
	};

	const generate = useCallback(async () => {
		if (requestRef.current) return;
		setError("");
		setIsGenerating(true);
		const controller = new AbortController();
		requestRef.current = controller;
		try {
			let sourceContent = automatic ? timelineContent : saved.content;
			if (automatic && !sourceContent) {
				const activeScene = editor.scenes.getActiveSceneOrNull();
				if (!activeScene) throw new Error("Chưa có video trên timeline.");
				if (transcriptRef.current?.tracks === activeScene.tracks) {
					sourceContent = transcriptRef.current.content;
				} else {
					const { transcribeTimeline } = await import("@/social-copy/transcribe-timeline");
					sourceContent = await transcribeTimeline({
						tracks: activeScene.tracks,
						mediaAssets: editor.media.getAssets(),
						duration: editor.timeline.getTotalDuration(),
						signal: controller.signal,
						onStatus: (message) => { if (!controller.signal.aborted) setStatus(message); },
					});
					controller.signal.throwIfAborted();
					transcriptRef.current = { tracks: activeScene.tracks, content: sourceContent };
					setSaved({ value: (previous) => ({ ...previous, detectedContent: sourceContent }) });
				}
			}
			controller.signal.throwIfAborted();
			if (!sourceContent.trim()) throw new Error("Nhập mô tả hoặc dùng nội dung tự động từ video.");
			setStatus("Đang viết caption và chọn hashtag theo nội dung video...");
			const response = await fetch("/api/social-copy", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					title: saved.title,
					content: sourceContent,
					tone: saved.tone,
				}),
				signal: controller.signal,
			});
			const data = await response.json();
			if (!response.ok)
				throw new Error(data.error || "Không thể tạo caption. Vui lòng thử lại.");
			if (!controller.signal.aborted) {
				setSaved({ value: (previous) => ({
					...previous,
					result: SocialCopyResultSchema.parse(data),
					...(automatic ? { detectedContent: sourceContent } : {}),
				}) });
				toast.success("Đã tạo caption và hashtag cho cả 3 nền tảng.");
			}
		} catch (cause) {
			if (!controller.signal.aborted) {
				setError(
					cause instanceof Error
						? cause.message
						: "Không thể tạo caption. Vui lòng thử lại.",
				);
			}
		} finally {
			if (requestRef.current === controller) requestRef.current = null;
			if (!controller.signal.aborted) {
				setIsGenerating(false);
				setStatus("");
			}
		}
	}, [automatic, timelineContent, saved.content, saved.title, saved.tone, editor, setSaved]);

	useEffect(function generateFromVideoOnOpen() {
		if (!isReady || !automatic || saved.result || attemptedAutoRef.current) return;
		const timer = setTimeout(() => {
			attemptedAutoRef.current = true;
			void generate();
		}, 0);
		return () => clearTimeout(timer);
	}, [isReady, automatic, saved.result, generate]);

	const editPost = ({
		id,
		patch,
	}: {
		id: SocialPlatform;
		patch: Partial<SocialPost>;
	}) => {
		setSaved({
			value: (previous) =>
				previous.result
					? {
							...previous,
							result: {
								...previous.result,
								posts: {
									...previous.result.posts,
									[id]: { ...previous.result.posts[id], ...patch },
								},
							},
						}
						: previous,
		});
	};

	const copy = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			toast.success("Đã sao chép.");
		} catch {
			toast.error(
				"Không thể truy cập clipboard. Bạn có thể chọn nội dung và sao chép thủ công.",
			);
		}
	};

	const result = saved.result;
	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<div>
				<h3 className="flex items-center gap-2 text-sm font-semibold">
					<Sparkles className="size-4" />
					Caption & hashtag
				</h3>
				<p className="mt-1 text-xs text-muted-foreground">
					Tự tạo caption và hashtag từ nội dung video cho TikTok, Facebook Reels và YouTube Shorts.
				</p>
			</div>
			<form
				className="flex flex-col gap-3"
				onSubmit={(event) => {
					event.preventDefault();
					void generate();
				}}
			>
				<div className="flex items-center gap-2">
					<Checkbox
						id="social-auto-content"
						checked={automatic}
						disabled={!isReady || isGenerating}
						onCheckedChange={(checked) => updateForm({ automatic: checked === true })}
					/>
					<Label htmlFor="social-auto-content">Tự động lấy nội dung video</Label>
				</div>
				{automatic && (
					<p className="text-xs text-muted-foreground">
						Ưu tiên phụ đề trên timeline; nếu chưa có, tự nhận diện lời thoại từ audio.
					</p>
				)}
				<div className="space-y-1.5">
					<Label htmlFor="social-source-title">Chủ đề / tiêu đề video (không bắt buộc)</Label>
					<Input
						id="social-source-title"
						value={saved.title}
						maxLength={300}
						disabled={!isReady || isGenerating}
						onChange={(event) => updateForm({ title: event.target.value })}
						placeholder={`Tự suy ra từ nội dung · ${projectName}`}
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="social-source-content">Nội dung video</Label>
					<Textarea
						id="social-source-content"
						value={content}
						rows={5}
						maxLength={12000}
						required={!automatic}
						readOnly={automatic}
						disabled={!isReady || isGenerating}
						onChange={(event) => updateForm({ content: event.target.value })}
						placeholder={automatic
							? "Nội dung lời thoại/phụ đề sẽ được lấy tự động từ video..."
							: "Mô tả nội dung, điểm nổi bật hoặc dán lời thoại/phụ đề..."}
					/>
					<div className="flex flex-wrap items-center justify-between gap-1">
						<Button
							size="sm"
							variant="ghost"
							disabled={!isReady || isGenerating}
							onClick={useSubtitles}
						>
							Dùng phụ đề timeline
						</Button>
						<span className="text-xs text-muted-foreground">
							{content.length.toLocaleString("vi-VN")} / 12.000
						</span>
					</div>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="social-tone">Giọng điệu</Label>
					<Select
						value={saved.tone}
						disabled={!isReady || isGenerating}
						onValueChange={(value) => {
							const tone = SocialToneSchema.safeParse(value);
							if (tone.success) updateForm({ tone: tone.data });
						}}
					>
						<SelectTrigger id="social-tone">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="engaging">Cuốn hút</SelectItem>
							<SelectItem value="friendly">Gần gũi</SelectItem>
							<SelectItem value="informative">Thông tin hữu ích</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<Button
					type="submit"
					disabled={!isReady || isGenerating || (!automatic && !saved.content.trim())}
				>
					{isGenerating ? (
						<LoaderCircle className="animate-spin" />
					) : (
						<Sparkles />
					)}
					{isGenerating
						? "Đang tạo nội dung..."
						: result
							? "Tạo lại cho 3 nền tảng"
							: "Tạo cho 3 nền tảng"}
				</Button>
				{isGenerating && (
					<>
						<p role="status" className="text-xs text-muted-foreground">
							{status || "Đang lấy nội dung video..."}
						</p>
						<Button variant="outline" onClick={() => {
							requestRef.current?.abort();
							requestRef.current = null;
							setIsGenerating(false);
							setStatus("");
						}}>
							Dừng tạo nội dung
						</Button>
					</>
				)}
				{error && (
					<p role="alert" className="text-xs text-destructive">{error}</p>
				)}
			</form>
			{result ? (
				<div className="space-y-3 border-t pt-4">
					<p className="text-xs text-muted-foreground">
						{result.mode === "ai"
							? "Đã tạo bằng AI · Bạn có thể chỉnh sửa trước khi đăng."
							: "Bản nháp nhanh · Cấu hình GEMINI_API_KEY hoặc OPENAI_API_KEY trên server để AI viết nội dung phong phú hơn."}
					</p>
					<Tabs
						value={platform}
						onValueChange={(value) => {
							const next = SocialPlatformSchema.safeParse(value);
							if (next.success) setPlatform(next.data);
						}}
					>
						<TabsList
							className="grid w-full grid-cols-3"
							aria-label="Nền tảng đăng video"
						>
							{PLATFORMS.map((item) => (
								<TabsTrigger key={item.id} value={item.id} className="px-1 text-xs">
									{item.label}
								</TabsTrigger>
							))}
						</TabsList>
						{PLATFORMS.map((item) => {
							const post = result.posts[item.id];
							const hashtags = post.hashtags.join(" ");
							return (
								<TabsContent key={item.id} value={item.id} className="space-y-3 pt-3">
									<p className="text-xs text-muted-foreground">{item.hint}</p>
									{item.id === "youtube" && (
										<div className="space-y-1.5">
											<Label htmlFor="youtube-post-title">Tiêu đề Shorts</Label>
											<Input
												id="youtube-post-title"
												value={post.title}
												maxLength={100}
												disabled={isGenerating}
												onChange={(event) => editPost({ id: item.id, patch: { title: event.target.value } })}
											/>
											<p className="text-xs text-muted-foreground">
												{Array.from(post.title).length} / 100 ký tự
											</p>
										</div>
									)}
									<div className="space-y-1.5">
										<div className="flex items-center justify-between">
											<Label htmlFor={`${item.id}-post-caption`}>
												{item.id === "youtube" ? "Mô tả" : "Caption"}
											</Label>
											<Button
												size="sm"
												variant="ghost"
												disabled={!post.caption.trim()}
												onClick={() => void copy(post.caption)}
												aria-label={`Sao chép caption ${item.label}`}
											>
												<Copy />Copy
											</Button>
										</div>
										<Textarea
											id={`${item.id}-post-caption`}
											rows={6}
											value={post.caption}
											disabled={isGenerating}
											onChange={(event) => editPost({ id: item.id, patch: { caption: event.target.value } })}
										/>
										<p className="text-xs text-muted-foreground">
											{Array.from(post.caption).length} ký tự
										</p>
									</div>
									<div className="space-y-1.5">
										<div className="flex items-center justify-between">
											<Label htmlFor={`${item.id}-post-tags`}>Hashtag / tag</Label>
											<Button
												size="sm"
												variant="ghost"
												disabled={!hashtags.trim()}
												onClick={() => void copy(hashtags)}
												aria-label={`Sao chép hashtag ${item.label}`}
											>
												<Copy />Copy
											</Button>
										</div>
										<Textarea
											id={`${item.id}-post-tags`}
											rows={3}
											value={hashtags}
											disabled={isGenerating}
											onChange={(event) => editPost({ id: item.id, patch: { hashtags: event.target.value.split(" ") } })}
										/>
									</div>
									<Button
										variant="outline"
										className="w-full"
										disabled={!post.caption.trim()}
										onClick={() => void copy(
											[item.id === "youtube" ? post.title : "", post.caption, hashtags]
												.filter(Boolean).join("\n\n"),
										)}
									>
										<Copy />Sao chép bài đăng
									</Button>
								</TabsContent>
							);
						})}
					</Tabs>
					<p className="text-xs text-muted-foreground">
						Nội dung được lưu tự động cho dự án này trên trình duyệt.
					</p>
				</div>
			) : (
				<p className="text-xs text-muted-foreground">
					Caption và hashtag được tạo theo lời thoại/phụ đề của video. Bạn có thể
					chuyển sang nhập mô tả thủ công để bổ sung nội dung hình ảnh.
				</p>
			)}
		</div>
	);
}
