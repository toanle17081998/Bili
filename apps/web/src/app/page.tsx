"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Search01Icon, PlayIcon, SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { SearchResult } from "@/source/types";

export default function HomePage() {
	const router = useRouter();
	const [searchQuery, setSearchQuery] = useState("food");
	const [isSearching, setIsSearching] = useState(false);
	const [results, setResults] = useState<SearchResult[]>([]);
	const [previewVideo, setPreviewVideo] = useState<SearchResult | null>(null);
	const [isImporting, setIsImporting] = useState(false);

	const handleSearch = async (e?: React.FormEvent) => {
		if (e) e.preventDefault();
		if (!searchQuery.trim()) return;

		setIsSearching(true);
		try {
			const res = await fetch(`/api/source/search?q=${encodeURIComponent(searchQuery)}`);
			const data = await res.json();
			if (data.success && Array.isArray(data.results)) {
				setResults(data.results);
			} else {
				toast.error(data.error || "Không tìm thấy video");
			}
		} catch (err) {
			toast.error("Lỗi khi tìm kiếm video Bilibili");
		} finally {
			setIsSearching(false);
		}
	};

	useEffect(() => {
		handleSearch();
	}, []);

	const handleImportAndCreateProject = async (video: SearchResult) => {
		setIsImporting(true);
		const toastId = toast.loading("Đang tải video về bộ nhớ...");
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

			toast.success("Tải video thành công! Đang tạo dự án...", { id: toastId });

			// Store imported video details in sessionStorage for editor bootstrap
			const imported = data.importedVideo;
			sessionStorage.setItem(`imported_video_${imported.sourceId}`, JSON.stringify(imported));

			// Redirect to editor
			setPreviewVideo(null);
			router.push(`/editor/${imported.sourceId}?imported=true`);
		} catch (err: any) {
			toast.error(err.message || "Lỗi khi import video", { id: toastId });
		} finally {
			setIsImporting(false);
		}
	};

	return (
		<div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
			{/* Top Bar */}
			<header className="h-16 border-b border-neutral-800 px-8 flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="size-9 rounded-lg bg-gradient-to-tr from-rose-500 to-indigo-600 flex items-center justify-center font-bold text-lg shadow-lg">
						V
					</div>
					<div>
						<h1 className="text-base font-semibold tracking-wide">Video Việt AI</h1>
						<p className="text-xs text-neutral-400">AI-assisted Vietnamese video localization & editor</p>
					</div>
				</div>
				<div className="flex items-center gap-4">
					<Link href="/projects" className="text-sm text-neutral-400 hover:text-neutral-200 transition">
						Dự án gần đây
					</Link>
				</div>
			</header>

			{/* Hero & Search Section */}
			<main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 flex flex-col gap-8">
				<div className="text-center max-w-2xl mx-auto flex flex-col gap-3">
					<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-medium self-center">
						<HugeiconsIcon icon={SparklesIcon} className="size-3.5" />
						Chuyển ngữ video Bilibili tự động sang tiếng Việt
					</div>
					<h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
						Tìm kiếm & Việt hóa Video Nhanh Chóng
					</h2>
					<p className="text-sm text-neutral-400">
						Nhập từ khóa video trên Bilibili (ẩm thực, công nghệ, vlog) để tự động dịch, lồng tiếng và tạo video dọc 9:16 cho TikTok / Reels / Shorts.
					</p>

					{/* Search Form */}
					<form onSubmit={handleSearch} className="mt-4 flex items-center gap-2 bg-neutral-900 p-2 rounded-xl border border-neutral-800 shadow-xl focus-within:border-rose-500/50 transition">
						<HugeiconsIcon icon={Search01Icon} className="size-5 text-neutral-400 ml-2" />
						<Input
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Tìm video trên Bilibili (ví dụ: food, street food, cooking)..."
							className="bg-transparent border-none text-neutral-100 placeholder:text-neutral-500 focus-visible:ring-0 text-base"
						/>
						<Button type="submit" disabled={isSearching} className="bg-rose-600 hover:bg-rose-500 text-white px-6 font-medium">
							{isSearching ? "Đang tìm..." : "Tìm kiếm"}
						</Button>
					</form>
				</div>

				{/* Results Grid */}
				<div className="flex flex-col gap-4">
					<div className="flex items-center justify-between">
						<h3 className="text-lg font-semibold text-neutral-200">Kết quả tìm kiếm</h3>
						<span className="text-xs text-neutral-500">{results.length} video tìm thấy</span>
					</div>

					{isSearching ? (
						<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
							{[1, 2, 3].map((n) => (
								<div key={n} className="h-64 rounded-xl bg-neutral-900 animate-pulse" />
							))}
						</div>
					) : results.length === 0 ? (
						<div className="p-12 text-center text-neutral-500 border border-dashed border-neutral-800 rounded-xl">
							Không tìm thấy video nào. Hãy thử tìm từ khóa khác.
						</div>
					) : (
						<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
							{results.map((video) => (
								<Card
									key={video.id}
									className="group bg-neutral-900 border-neutral-800 hover:border-neutral-700 overflow-hidden cursor-pointer transition flex flex-col"
									onClick={() => setPreviewVideo(video)}
								>
									<div className="relative aspect-video bg-neutral-950 overflow-hidden">
										<Image
											src={video.thumbnail}
											alt={video.title}
											fill
											unoptimized
											className="object-cover group-hover:scale-105 transition duration-300"
										/>
										<div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition" />
										<div className="absolute bottom-2 right-2 bg-black/75 px-2 py-0.5 rounded text-xs font-mono text-white">
											{video.durationFormatted}
										</div>
										<div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
											<div className="size-11 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-lg">
												<HugeiconsIcon icon={PlayIcon} className="size-5 ml-0.5" />
											</div>
										</div>
									</div>
									<CardContent className="p-4 flex-1 flex flex-col justify-between gap-3">
										<h4 className="text-sm font-semibold line-clamp-2 text-neutral-200 group-hover:text-rose-400 transition">
											{video.title}
										</h4>
										<div className="flex items-center justify-between text-xs text-neutral-400">
											<span className="truncate max-w-[140px]">{video.uploader}</span>
											{video.viewCount && <span>{video.viewCount} views</span>}
										</div>
									</CardContent>
								</Card>
							))}
						</div>
					)}
				</div>
			</main>

			{/* Preview Modal */}
			<Dialog open={!!previewVideo} onOpenChange={(open) => !open && setPreviewVideo(null)}>
				<DialogContent className="bg-neutral-900 border-neutral-800 text-neutral-100 sm:max-w-xl">
					<DialogHeader>
						<DialogTitle className="text-base font-semibold line-clamp-1">
							{previewVideo?.title}
						</DialogTitle>
					</DialogHeader>

					<div className="flex flex-col gap-4">
						<div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-neutral-800">
							<video
								src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
								controls
								autoPlay
								className="size-full object-contain"
							/>
						</div>

						<div className="flex items-center justify-between text-xs text-neutral-400">
							<span>Tác giả: <strong className="text-neutral-200">{previewVideo?.uploader}</strong></span>
							<span>Thời lượng: <strong className="text-neutral-200">{previewVideo?.durationFormatted}</strong></span>
						</div>

						<div className="p-3 bg-neutral-950/60 rounded border border-neutral-800 text-xs text-neutral-400">
							ℹ️ Bằng việc nhấn &quot;Sử dụng video này&quot;, bạn xác nhận rằng bạn có quyền biên tập hoặc chuyển ngữ nội dung cho mục đích hợp pháp.
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
							onClick={() => previewVideo && handleImportAndCreateProject(previewVideo)}
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
