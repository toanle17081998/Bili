"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
	Search01Icon,
	PlayIcon,
	SparklesIcon,
	VideoReplayIcon,
	Film01Icon,
	ArrowRight01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { SearchResult } from "@/source/types";

const SUGGESTION_TAGS = [
	{ label: "🍜 Mukbang", query: "mukbang" },
	{ label: "🍳 Ẩm thực", query: "chinese street food" },
	{ label: "✈️ Du lịch", query: "travel china vlog" },
	{ label: "📱 Công nghệ", query: "tech review" },
	{ label: "🐱 Thú cưng", query: "cute pets" },
];

export default function HomePage() {
	const router = useRouter();
	const [searchQuery, setSearchQuery] = useState("");
	const [isSearching, setIsSearching] = useState(false);
	const [hasSearched, setHasSearched] = useState(false);
	const [results, setResults] = useState<SearchResult[]>([]);
	const [previewVideo, setPreviewVideo] = useState<SearchResult | null>(null);
	const [isImporting, setIsImporting] = useState(false);

	const [page, setPage] = useState(1);
	const [total, setTotal] = useState(0);
	const [totalPages, setTotalPages] = useState(0);
	const [activeQuery, setActiveQuery] = useState("");
	const [searchError, setSearchError] = useState("");
	const requestRef = useRef<AbortController | null>(null);

	const handleSearch = async (
		e?: React.FormEvent,
		customQuery?: string,
		requestedPage = 1,
	) => {
		if (e) e.preventDefault();
		const query = (
			customQuery !== undefined ? customQuery : searchQuery
		).trim();
		if (!query) {
			toast.info("Vui lòng nhập từ khóa tìm kiếm hoặc mã BV");
			return;
		}

		if (customQuery !== undefined) {
			setSearchQuery(customQuery);
		}

		requestRef.current?.abort();
		const controller = new AbortController();
		requestRef.current = controller;
		setIsSearching(true);
		setSearchError("");
		setHasSearched(true);
		try {
			const res = await fetch(
				`/api/source/search?q=${encodeURIComponent(query)}&page=${requestedPage}`,
				{ signal: controller.signal },
			);
			const data = await res.json();
			if (controller.signal.aborted) return;
			if (res.ok && data.success && Array.isArray(data.results)) {
				setResults(data.results);
				setPage(data.page ?? 1);
				setTotal(data.total ?? data.results.length);
				setTotalPages(data.totalPages ?? 1);
				setActiveQuery(query);
				if (data.results.length === 0) {
					toast.info(
						"Không tìm thấy video nào. Hãy thử từ khóa khác hoặc mã BV.",
					);
				}
			} else {
				const message =
					data.error || "Không thể tìm kiếm video. Vui lòng thử lại.";
				setSearchError(message);
				toast.error(message);
			}
		} catch {
			if (controller.signal.aborted) return;
			const message = "Kết nối tìm kiếm bị lỗi. Vui lòng thử lại.";
			setSearchError(message);
			toast.error(message);
		} finally {
			if (requestRef.current === controller) setIsSearching(false);
		}
	};

	const handleImportAndCreateProject = async (video: SearchResult) => {
		setIsImporting(true);
		const toastId = toast.loading("Đang tải video về máy và khởi tạo dự án...");
		try {
			const res = await fetch("/api/source/import", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id: video.id }),
			});
			const data = await res.json();
			if (!data.success) {
				throw new Error(data.error || "Tải video thất bại");
			}

			toast.success(
				"Tải video thành công! Đang chuyển đến trình dựng phim...",
				{
					id: toastId,
				},
			);

			const imported = data.importedVideo;
			sessionStorage.setItem(
				`imported_video_${imported.sourceId}`,
				JSON.stringify(imported),
			);

			setPreviewVideo(null);
			router.push(`/editor/${imported.sourceId}?imported=true`);
		} catch (err: any) {
			toast.error(err.message || "Lỗi khi import video", { id: toastId });
		} finally {
			setIsImporting(false);
		}
	};

	return (
		<div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col selection:bg-rose-500/30">
			{/* Top Bar */}
			<header className="h-16 border-b border-neutral-800/80 px-6 sm:px-10 flex items-center justify-between bg-neutral-950/80 backdrop-blur-md sticky top-0 z-40">
				<div className="flex items-center gap-3">
					<div className="size-9 rounded-xl bg-gradient-to-tr from-rose-500 via-rose-600 to-indigo-600 flex items-center justify-center font-bold text-lg shadow-lg shadow-rose-950/40">
						V
					</div>
					<div>
						<h1 className="text-base font-semibold tracking-wide flex items-center gap-2">
							Video Việt AI
							<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">
								Beta
							</span>
						</h1>
						<p className="text-xs text-neutral-400">
							Tự động hóa chuyển ngữ video Bilibili sang TikTok / Shorts 9:16
						</p>
					</div>
				</div>
				<div className="flex items-center gap-4">
					<Link
						href="/projects"
						className="text-sm text-neutral-400 hover:text-neutral-100 transition px-3 py-1.5 rounded-lg hover:bg-neutral-900 border border-transparent hover:border-neutral-800"
					>
						Dự án gần đây
					</Link>
				</div>
			</header>

			{/* Hero & Search Section */}
			<main className="flex-1 max-w-6xl w-full mx-auto px-6 py-12 flex flex-col gap-10">
				<div className="text-center max-w-4xl mx-auto flex flex-col items-center gap-4">
					{/* Badge */}
					<div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-medium shadow-sm backdrop-blur-sm">
						<HugeiconsIcon icon={SparklesIcon} className="size-3.5 animate-pulse" />
						Công nghệ AI chuyển ngữ & lồng tiếng video Bilibili
					</div>

					{/* Title */}
					<h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
						Biến Video Bilibili Thành Clip{" "}
						<span className="bg-gradient-to-r from-rose-400 via-rose-500 to-indigo-400 bg-clip-text text-transparent">
							Viral 9:16
						</span>
					</h2>

					{/* Subtitle */}
					<p className="text-sm sm:text-base text-neutral-400 max-w-2xl leading-relaxed">
						Dán link, mã BV hoặc nhập từ khóa để tự động dịch thuật ngữ cảnh, lồng tiếng AI tiếng Việt truyền cảm và xuất video dọc TikTok / Reels chỉ trong vài phút.
					</p>

					{/* Search Form - Wide, modern & roomy */}
					<form
						onSubmit={handleSearch}
						className="mt-2 w-full max-w-3xl flex items-center gap-2 sm:gap-3 bg-neutral-900/90 p-2 rounded-2xl border border-neutral-800 shadow-2xl focus-within:border-rose-500/60 focus-within:ring-4 focus-within:ring-rose-500/10 transition backdrop-blur-md"
					>
						<HugeiconsIcon
							icon={Search01Icon}
							className="size-5 text-neutral-400 ml-3 shrink-0"
						/>
						<Input
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Dán link Bilibili, mã BV (ví dụ: BV18RHZ6TEeC) hoặc từ khóa tìm kiếm..."
							containerClassName="flex-1 min-w-0"
							className="bg-transparent border-none text-neutral-100 placeholder:text-neutral-500 focus-visible:ring-0 text-sm sm:text-base px-2 h-11 w-full shadow-none"
						/>
						<Button
							type="submit"
							disabled={isSearching}
							className="h-11 px-6 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-600 active:scale-95 text-white font-medium text-sm flex items-center gap-2 shadow-lg shadow-rose-900/30 transition shrink-0"
						>
							{isSearching ? "Đang tìm..." : "Tìm kiếm"}
						</Button>
					</form>

					{/* Suggestion Chips & 1-Click Sample */}
					<div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs text-neutral-400">
						<span className="text-neutral-500 font-medium">Gợi ý nhanh:</span>
						{SUGGESTION_TAGS.map((tag) => (
							<button
								key={tag.query}
								type="button"
								onClick={() => handleSearch(undefined, tag.query)}
								className="px-3 py-1 rounded-full bg-neutral-900 border border-neutral-800/80 hover:border-neutral-700 hover:bg-neutral-800/80 text-neutral-300 hover:text-white transition shadow-sm"
							>
								{tag.label}
							</button>
						))}

						{/* Quick Sample Button */}
						<button
							type="button"
							onClick={() => handleSearch(undefined, "BV18RHZ6TEeC")}
							className="px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 transition font-medium flex items-center gap-1 shadow-sm"
						>
							<span>✨ Thử mẫu BV18RHZ6TEeC</span>
						</button>
					</div>
				</div>

				{/* Results / Feature Grid Section */}
				<div className="flex flex-col gap-6">
					{hasSearched && (
						<div className="flex items-center justify-between border-b border-neutral-800/60 pb-3">
							<div className="flex items-center gap-3">
								<h3 className="text-lg font-semibold text-neutral-200">
									Kết quả tìm kiếm
								</h3>
								{activeQuery && (
									<span className="text-xs px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
										&quot;{activeQuery}&quot;
									</span>
								)}
							</div>
							<span className="text-xs text-neutral-500">
								{total > 0 ? `${total} video` : `${results.length} video`}
							</span>
						</div>
					)}

					{isSearching ? (
						<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
							{[1, 2, 3, 4, 5, 6].map((n) => (
								<div
									key={n}
									className="h-64 rounded-2xl bg-neutral-900 animate-pulse border border-neutral-800/60"
								/>
							))}
						</div>
					) : !hasSearched ? (
						/* Beautiful 3-Step Feature Showcase when no search yet */
						<div className="flex flex-col gap-6 pt-4">
							<div className="text-center">
								<h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
									Quy Trình Hoạt Động Tự Động
								</h3>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
								{/* Card 1 */}
								<div className="p-6 rounded-2xl bg-gradient-to-b from-neutral-900/80 to-neutral-900/40 border border-neutral-800 hover:border-neutral-700 transition flex flex-col gap-4 shadow-xl">
									<div className="size-11 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 font-semibold text-base shadow-sm">
										1
									</div>
									<div className="flex flex-col gap-1.5">
										<h4 className="font-semibold text-neutral-100 text-base">
											Chọn Video Bilibili
										</h4>
										<p className="text-xs text-neutral-400 leading-relaxed">
											Dán link, mã BV hoặc tìm kiếm bất kỳ clip ẩm thực, mukbang, vlog hay công nghệ yêu thích từ Bilibili.
										</p>
									</div>
									<div className="mt-auto pt-2 flex items-center text-xs text-rose-400 font-medium gap-1">
										<span>Xem trước & tải HD</span>
										<HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
									</div>
								</div>

								{/* Card 2 */}
								<div className="p-6 rounded-2xl bg-gradient-to-b from-neutral-900/80 to-neutral-900/40 border border-neutral-800 hover:border-neutral-700 transition flex flex-col gap-4 shadow-xl">
									<div className="size-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-semibold text-base shadow-sm">
										2
									</div>
									<div className="flex flex-col gap-1.5">
										<h4 className="font-semibold text-neutral-100 text-base">
											AI Việt Hóa Tự Động
										</h4>
										<p className="text-xs text-neutral-400 leading-relaxed">
											AI tự động nhận diện giọng nói, biên kịch bản dịch tự nhiên chuẩn tiếng Việt và lồng giọng thuyết minh truyền cảm.
										</p>
									</div>
									<div className="mt-auto pt-2 flex items-center text-xs text-indigo-400 font-medium gap-1">
										<span>Lồng tiếng Hoài My / Nam Minh</span>
										<HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
									</div>
								</div>

								{/* Card 3 */}
								<div className="p-6 rounded-2xl bg-gradient-to-b from-neutral-900/80 to-neutral-900/40 border border-neutral-800 hover:border-neutral-700 transition flex flex-col gap-4 shadow-xl">
									<div className="size-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-semibold text-base shadow-sm">
										3
									</div>
									<div className="flex flex-col gap-1.5">
										<h4 className="font-semibold text-neutral-100 text-base">
											Xuất Video Dọc 9:16
										</h4>
										<p className="text-xs text-neutral-400 leading-relaxed">
											Tự động crop chuẩn tỷ lệ TikTok, chèn phụ đề viền đậm bắt mắt và hòa trộn âm thanh gốc tạo clip hoàn hảo.
										</p>
									</div>
									<div className="mt-auto pt-2 flex items-center text-xs text-emerald-400 font-medium gap-1">
										<span>Sẵn sàng đăng TikTok / Shorts</span>
										<HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
									</div>
								</div>
							</div>
						</div>
					) : results.length === 0 ? (
						/* Empty State */
						<div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-800 rounded-2xl bg-neutral-900/30 flex flex-col items-center gap-3">
							<p className="text-base font-medium text-neutral-300">
								Không tìm thấy video nào phù hợp
							</p>
							<p className="text-xs text-neutral-500 max-w-sm">
								Hãy thử nhập từ khóa khác, hoặc dán trực tiếp mã BV của video Bilibili (ví dụ: BV18RHZ6TEeC).
							</p>
							<Button
								variant="outline"
								size="sm"
								onClick={() => handleSearch(undefined, "BV18RHZ6TEeC")}
								className="mt-2 border-neutral-700 hover:bg-neutral-800 text-neutral-300 text-xs"
							>
								Thử với video Mukbang mẫu
							</Button>
						</div>
					) : (
						/* Results Grid */
						<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
							{results.map((video) => (
								<Card
									key={video.id}
									className="group bg-neutral-900 border-neutral-800 hover:border-neutral-700 overflow-hidden cursor-pointer transition flex flex-col shadow-xl hover:shadow-2xl"
									onClick={() => setPreviewVideo(video)}
								>
									<div className="relative aspect-video bg-neutral-950 overflow-hidden">
										{video.thumbnail ? (
											<Image
												src={video.thumbnail}
												alt={video.title}
												fill
												unoptimized
												referrerPolicy="no-referrer"
												className="object-cover group-hover:scale-105 transition duration-300"
											/>
										) : (
											<div className="size-full flex items-center justify-center bg-neutral-900 text-neutral-600">
												<HugeiconsIcon
													icon={VideoReplayIcon}
													className="size-8"
												/>
											</div>
										)}
										<div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition" />
										<div className="absolute bottom-2 right-2 bg-black/75 px-2 py-0.5 rounded text-xs font-mono text-white">
											{video.durationFormatted}
										</div>
										<div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
											<div className="size-11 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-lg">
												<HugeiconsIcon
													icon={PlayIcon}
													className="size-5 ml-0.5"
												/>
											</div>
										</div>
									</div>
									<CardContent className="p-4 flex-1 flex flex-col justify-between gap-3">
										<h4 className="text-sm font-semibold line-clamp-2 text-neutral-200 group-hover:text-rose-400 transition">
											{video.title}
										</h4>
										<div className="flex items-center justify-between text-xs text-neutral-400">
											<span className="truncate max-w-[140px]">
												{video.uploader}
											</span>
											{video.viewCount && (
												<span>{video.viewCount} lượt xem</span>
											)}
										</div>
									</CardContent>
								</Card>
							))}
						</div>
					)}
				</div>

				{/* Pagination */}
				{totalPages > 1 && (
					<nav
						aria-label="Phân trang kết quả tìm kiếm"
						className="flex flex-wrap items-center justify-center gap-4 pt-4"
					>
						<Button
							variant="outline"
							disabled={isSearching || page <= 1}
							onClick={() => handleSearch(undefined, activeQuery, page - 1)}
							className="border-neutral-800 text-neutral-300 hover:bg-neutral-900 text-xs"
						>
							Trang trước
						</Button>
						<span aria-live="polite" className="text-sm text-neutral-400">
							Trang {page} / {totalPages}
						</span>
						<Button
							variant="outline"
							disabled={isSearching || page >= totalPages}
							onClick={() => handleSearch(undefined, activeQuery, page + 1)}
							className="border-neutral-800 text-neutral-300 hover:bg-neutral-900 text-xs"
						>
							Trang sau
						</Button>
					</nav>
				)}
			</main>

			{/* Preview Modal */}
			<Dialog
				open={!!previewVideo}
				onOpenChange={(open) => !open && setPreviewVideo(null)}
			>
				<DialogContent className="bg-neutral-900 border-neutral-800 text-neutral-100 sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle className="text-base font-semibold line-clamp-1">
							{previewVideo?.title}
						</DialogTitle>
					</DialogHeader>

					<div className="flex flex-col gap-4">
						{/* Real Bilibili Player Embed */}
						<div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-neutral-800">
							{previewVideo && (
								<iframe
									src={`https://player.bilibili.com/player.html?bvid=${previewVideo.id}&page=1&high_quality=1&danmaku=0&autoplay=1`}
									scrolling="no"
									frameBorder="0"
									allow="autoplay; fullscreen"
									allowFullScreen
									className="size-full"
								/>
							)}
						</div>

						<div className="flex items-center justify-between text-xs text-neutral-400">
							<span>
								Tác giả:{" "}
								<strong className="text-neutral-200">
									{previewVideo?.uploader}
								</strong>
							</span>
							<span>
								Thời lượng:{" "}
								<strong className="text-neutral-200">
									{previewVideo?.durationFormatted}
								</strong>
							</span>
						</div>

						<div className="p-3 bg-neutral-950/60 rounded border border-neutral-800 text-xs text-neutral-400 flex items-center justify-between">
							<span>
								Mã Bilibili: <strong className="text-neutral-300 font-mono">{previewVideo?.id}</strong>
							</span>
							<a
								href={previewVideo?.url}
								target="_blank"
								rel="noreferrer"
								className="text-rose-400 hover:underline"
							>
								Xem gốc trên Bilibili ↗
							</a>
						</div>
					</div>

					<DialogFooter className="flex gap-2 sm:justify-end mt-2">
						<Button
							variant="outline"
							onClick={() => setPreviewVideo(null)}
							className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
						>
							Đóng
						</Button>
						<Button
							disabled={isImporting}
							onClick={() =>
								previewVideo && handleImportAndCreateProject(previewVideo)
							}
							className="bg-rose-600 hover:bg-rose-500 text-white font-medium"
						>
							{isImporting ? "Đang tải video..." : "Sử dụng video này"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
