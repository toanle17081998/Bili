"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Check,
	Loader2,
	Mic,
	Pause,
	Play,
	Search,
	Sparkles,
	Volume2,
	VolumeX,
	X,
} from "lucide-react";
import { VIENEU_PRESET_VOICES } from "@/providers/tts/voices";
import type { TTSVoice } from "@/providers/tts/types";
import { toast } from "sonner";
import { cn } from "@/utils/ui";

interface VoicePickerDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	selectedVoice: string;
	onSelectVoice: (voice: TTSVoice) => void;
}

export function VoicePickerDialog({
	open,
	onOpenChange,
	selectedVoice,
	onSelectVoice,
}: VoicePickerDialogProps) {
	const [voices, setVoices] = useState<TTSVoice[]>(VIENEU_PRESET_VOICES);
	const [searchQuery, setSearchQuery] = useState("");
	const [regionFilter, setRegionFilter] = useState<string>("all");
	const [genderFilter, setGenderFilter] = useState<string>("all");
	const [styleFilter, setStyleFilter] = useState<string>("all");

	// Audio preview state
	const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
	const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	// Fetch dynamic voices from backend
	useEffect(() => {
		let isMounted = true;
		async function fetchVoices() {
			try {
				const res = await fetch("/api/tts/voices");
				if (!res.ok) return;
				const data = await res.json();
				if (isMounted && data.success && Array.isArray(data.voices) && data.voices.length > 0) {
					setVoices(data.voices);
				}
			} catch {
				// Keep preset voices
			}
		}
		fetchVoices();
		return () => {
			isMounted = false;
		};
	}, []);

	// Clean up audio on unmount or dialog close
	const stopAudio = () => {
		if (audioRef.current) {
			audioRef.current.pause();
			audioRef.current.currentTime = 0;
			audioRef.current = null;
		}
		setPlayingVoiceId(null);
		setLoadingVoiceId(null);
	};

	useEffect(() => {
		if (!open) {
			stopAudio();
		}
	}, [open]);

	useEffect(() => {
		return () => {
			stopAudio();
		};
	}, []);

	const togglePlayPreview = async (voice: TTSVoice, event?: React.MouseEvent) => {
		event?.stopPropagation();

		const voiceName = voice.name || voice.id;

		if (playingVoiceId === voiceName) {
			stopAudio();
			return;
		}

		stopAudio();
		setLoadingVoiceId(voiceName);

		try {
			const previewUrl =
				voice.previewUrl || `/api/tts/preview?voice=${encodeURIComponent(voiceName)}`;
			const audio = new Audio(previewUrl);
			audioRef.current = audio;

			audio.oncanplay = () => {
				setLoadingVoiceId((current) => (current === voiceName ? null : current));
			};

			audio.onplay = () => {
				setLoadingVoiceId(null);
				setPlayingVoiceId(voiceName);
			};

			audio.onended = () => {
				setPlayingVoiceId(null);
				audioRef.current = null;
			};

			audio.onerror = () => {
				setLoadingVoiceId(null);
				setPlayingVoiceId(null);
				audioRef.current = null;
				toast.error(`Không thể phát nghe thử cho giọng "${voiceName}"`);
			};

			await audio.play();
		} catch (error) {
			console.error("Audio playback error:", error);
			setLoadingVoiceId(null);
			setPlayingVoiceId(null);
			toast.error(`Lỗi khi phát giọng đọc "${voiceName}"`);
		}
	};

	// Filter voices
	const filteredVoices = useMemo(() => {
		return voices.filter((v) => {
			const voiceName = v.name || v.id;
			if (searchQuery.trim()) {
				const q = searchQuery.toLowerCase().trim();
				const matchesName = voiceName.toLowerCase().includes(q);
				const matchesDesc = (v.description || "").toLowerCase().includes(q);
				const matchesRegion = (v.region || "").toLowerCase().includes(q);
				const matchesStyle = (v.style || "").toLowerCase().includes(q);
				if (!matchesName && !matchesDesc && !matchesRegion && !matchesStyle) {
					return false;
				}
			}

			if (regionFilter !== "all" && v.region !== regionFilter) {
				return false;
			}

			if (genderFilter !== "all" && v.gender !== genderFilter) {
				return false;
			}

			if (styleFilter !== "all" && v.style !== styleFilter) {
				return false;
			}

			return true;
		});
	}, [voices, searchQuery, regionFilter, genderFilter, styleFilter]);

	// Counts
	const regionCounts = useMemo(() => {
		const counts: Record<string, number> = { all: voices.length, Bắc: 0, Trung: 0, Nam: 0 };
		for (const v of voices) {
			if (v.region && counts[v.region] !== undefined) {
				counts[v.region]++;
			}
		}
		return counts;
	}, [voices]);

	const genderCounts = useMemo(() => {
		const counts: Record<string, number> = { all: voices.length, female: 0, male: 0 };
		for (const v of voices) {
			if (v.gender && counts[v.gender] !== undefined) {
				counts[v.gender]++;
			}
		}
		return counts;
	}, [voices]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-3xl bg-neutral-900 border-neutral-800 text-neutral-100 p-0 overflow-hidden shadow-2xl">
				<DialogHeader className="p-5 border-b border-neutral-800 bg-neutral-950/60 space-y-1.5">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<div className="size-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
								<Mic className="size-4" />
							</div>
							<div>
								<DialogTitle className="text-base font-semibold text-neutral-100">
									Kho giọng đọc TTS tiếng Việt (VieNeu)
								</DialogTitle>
								<DialogDescription className="text-xs text-neutral-400 mt-0.5">
									Hệ thống hỗ trợ 25 giọng đọc tự nhiên. Bấm nút nghe thử và chọn giọng phù hợp nhất với video của bạn.
								</DialogDescription>
							</div>
						</div>
						<Badge
							variant="outline"
							className="bg-rose-500/10 text-rose-300 border-rose-500/30 text-[11px] font-mono px-2.5 py-0.5"
						>
							{voices.length} Giọng AI
						</Badge>
					</div>

					{/* Search & filter bars */}
					<div className="flex flex-col gap-2.5 pt-2">
						<div className="relative">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
							<input
								type="text"
								placeholder="Tìm kiếm giọng theo tên, vùng miền hoặc phong cách..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-9 pr-8 py-2 text-xs text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-rose-500/60 focus:ring-1 focus:ring-rose-500/40 transition"
							/>
							{searchQuery && (
								<button
									type="button"
									onClick={() => setSearchQuery("")}
									className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200"
								>
									<X className="size-3.5" />
								</button>
							)}
						</div>

						{/* Filter Pills */}
						<div className="flex flex-wrap items-center gap-2 text-xs">
							{/* Region filters */}
							<div className="flex items-center bg-neutral-950 p-0.5 rounded-md border border-neutral-800">
								<button
									type="button"
									onClick={() => setRegionFilter("all")}
									className={cn(
										"px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer",
										regionFilter === "all"
											? "bg-neutral-800 text-neutral-100 shadow-xs"
											: "text-neutral-400 hover:text-neutral-200",
									)}
								>
									Tất cả miền ({regionCounts.all})
								</button>
								<button
									type="button"
									onClick={() => setRegionFilter("Bắc")}
									className={cn(
										"px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer",
										regionFilter === "Bắc"
											? "bg-neutral-800 text-neutral-100 shadow-xs"
											: "text-neutral-400 hover:text-neutral-200",
									)}
								>
									Bắc ({regionCounts["Bắc"]})
								</button>
								<button
									type="button"
									onClick={() => setRegionFilter("Trung")}
									className={cn(
										"px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer",
										regionFilter === "Trung"
											? "bg-neutral-800 text-neutral-100 shadow-xs"
											: "text-neutral-400 hover:text-neutral-200",
									)}
								>
									Trung ({regionCounts["Trung"]})
								</button>
								<button
									type="button"
									onClick={() => setRegionFilter("Nam")}
									className={cn(
										"px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer",
										regionFilter === "Nam"
											? "bg-neutral-800 text-neutral-100 shadow-xs"
											: "text-neutral-400 hover:text-neutral-200",
									)}
								>
									Nam ({regionCounts["Nam"]})
								</button>
							</div>

							{/* Gender filters */}
							<div className="flex items-center bg-neutral-950 p-0.5 rounded-md border border-neutral-800">
								<button
									type="button"
									onClick={() => setGenderFilter("all")}
									className={cn(
										"px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer",
										genderFilter === "all"
											? "bg-neutral-800 text-neutral-100 shadow-xs"
											: "text-neutral-400 hover:text-neutral-200",
									)}
								>
									Tất cả ({genderCounts.all})
								</button>
								<button
									type="button"
									onClick={() => setGenderFilter("female")}
									className={cn(
										"px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer",
										genderFilter === "female"
											? "bg-rose-900/60 text-rose-200 shadow-xs border border-rose-700/50"
											: "text-neutral-400 hover:text-rose-300",
									)}
								>
									Nữ ({genderCounts.female})
								</button>
								<button
									type="button"
									onClick={() => setGenderFilter("male")}
									className={cn(
										"px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer",
										genderFilter === "male"
											? "bg-blue-900/60 text-blue-200 shadow-xs border border-blue-700/50"
											: "text-neutral-400 hover:text-blue-300",
									)}
								>
									Nam ({genderCounts.male})
								</button>
							</div>

							{/* Style filters */}
							<div className="flex items-center bg-neutral-950 p-0.5 rounded-md border border-neutral-800">
								{["all", "Tự nhiên", "Kể chuyện", "Tin tức"].map((style) => (
									<button
										key={style}
										type="button"
										onClick={() => setStyleFilter(style)}
										className={cn(
											"px-2 py-1 rounded text-[11px] font-medium transition cursor-pointer",
											styleFilter === style
												? "bg-neutral-800 text-neutral-100 shadow-xs"
												: "text-neutral-400 hover:text-neutral-200",
										)}
									>
										{style === "all" ? "Mọi phong cách" : style}
									</button>
								))}
							</div>
						</div>
					</div>
				</DialogHeader>

				<DialogBody className="p-4 max-h-[56vh] overflow-y-auto">
					{filteredVoices.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12 text-center">
							<VolumeX className="size-8 text-neutral-500 mb-2" />
							<p className="text-sm font-medium text-neutral-300">
								Không tìm thấy giọng đọc nào
							</p>
							<p className="text-xs text-neutral-500 mt-1">
								Thử thay đổi từ khóa hoặc bộ lọc vùng miền / giới tính.
							</p>
							<Button
								variant="outline"
								size="sm"
								className="mt-3 text-xs border-neutral-800 bg-neutral-950"
								onClick={() => {
									setSearchQuery("");
									setRegionFilter("all");
									setGenderFilter("all");
									setStyleFilter("all");
								}}
							>
								Xóa bộ lọc
							</Button>
						</div>
					) : (
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
							{filteredVoices.map((v) => {
								const voiceName = v.name || v.id;
								const isSelected =
									selectedVoice === voiceName ||
									selectedVoice === v.id ||
									(selectedVoice === "vi-VN-HoaiMyNeural" && voiceName === "Ngọc Huyền") ||
									(selectedVoice === "vi-VN-NamMinhNeural" && voiceName === "Hải Đăng");
								const isPlaying = playingVoiceId === voiceName;
								const isLoading = loadingVoiceId === voiceName;

								return (
									<div
										key={v.id}
										onClick={() => onSelectVoice(v)}
										className={cn(
											"group relative flex flex-col justify-between p-3 rounded-lg border transition cursor-pointer select-none",
											isSelected
												? "bg-rose-950/20 border-rose-500/70 shadow-sm shadow-rose-950/30 ring-1 ring-rose-500/40"
												: "bg-neutral-950/60 border-neutral-800 hover:bg-neutral-800/50 hover:border-neutral-700",
										)}
									>
										{/* Top Row: Name + Badges + Selection indicator */}
										<div className="flex items-start justify-between gap-2">
											<div className="flex flex-col gap-0.5">
												<div className="flex items-center gap-1.5 flex-wrap">
													<span className="font-semibold text-sm text-neutral-100 group-hover:text-white">
														{voiceName}
													</span>
													{v.featured && v.featured <= 10 && (
														<span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
															<Sparkles className="size-2.5" />
															Nổi bật #{v.featured}
														</span>
													)}
												</div>
												<span className="text-[11px] text-neutral-400 line-clamp-1">
													{v.description || "Giọng đọc tiếng Việt chất lượng cao"}
												</span>
											</div>

											{/* Selected checkmark or Radio indicator */}
											<div
												className={cn(
													"size-5 rounded-full flex items-center justify-center shrink-0 border transition",
													isSelected
														? "bg-rose-500 border-rose-500 text-white"
														: "border-neutral-700 bg-neutral-900 text-transparent group-hover:border-neutral-500",
												)}
											>
												<Check className="size-3 stroke-[3]" />
											</div>
										</div>

										{/* Middle Row: Tag pills */}
										<div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
											{v.gender && (
												<span
													className={cn(
														"text-[10px] px-2 py-0.5 rounded font-medium border",
														v.gender === "female"
															? "bg-rose-950/50 text-rose-300 border-rose-800/40"
															: "bg-blue-950/50 text-blue-300 border-blue-800/40",
													)}
												>
													{v.gender === "female" ? "Giọng Nữ" : "Giọng Nam"}
												</span>
											)}
											{v.region && (
												<span className="text-[10px] px-2 py-0.5 rounded font-medium bg-neutral-900 text-neutral-300 border border-neutral-800">
													Miền {v.region}
												</span>
											)}
											{v.style && (
												<span className="text-[10px] px-2 py-0.5 rounded font-medium bg-neutral-900/80 text-neutral-400 border border-neutral-800/70">
													{v.style}
												</span>
											)}
										</div>

										{/* Bottom Row: Actions */}
										<div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-neutral-800/70">
											{/* Preview play button */}
											<button
												type="button"
												onClick={(e) => togglePlayPreview(v, e)}
												className={cn(
													"flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer border",
													isPlaying
														? "bg-rose-500 text-white border-rose-400 shadow-xs"
														: isLoading
															? "bg-neutral-800 text-neutral-300 border-neutral-700"
															: "bg-neutral-900 text-neutral-300 border-neutral-800 hover:bg-neutral-800 hover:text-white hover:border-neutral-700",
												)}
											>
												{isLoading ? (
													<>
														<Loader2 className="size-3.5 animate-spin text-rose-400" />
														<span className="text-[11px]">Đang tải mẫu...</span>
													</>
												) : isPlaying ? (
													<>
														<Pause className="size-3.5 fill-white" />
														<span className="text-[11px] font-medium">Đang phát</span>
														{/* Animated sound bars */}
														<span className="flex items-center gap-0.5 h-3 ml-0.5">
															<span className="w-0.5 h-2.5 bg-white animate-pulse rounded-full" />
															<span className="w-0.5 h-1.5 bg-white animate-pulse delay-75 rounded-full" />
															<span className="w-0.5 h-3 bg-white animate-pulse delay-150 rounded-full" />
														</span>
													</>
												) : (
													<>
														<Play className="size-3.5 fill-current text-rose-400" />
														<span className="text-[11px]">Nghe thử</span>
													</>
												)}
											</button>

											{/* Select button */}
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													onSelectVoice(v);
												}}
												className={cn(
													"text-[11px] font-medium px-2.5 py-1 rounded transition cursor-pointer",
													isSelected
														? "text-rose-400 font-semibold"
														: "text-neutral-400 hover:text-neutral-200",
												)}
											>
												{isSelected ? "Đã chọn" : "Chọn giọng này"}
											</button>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
