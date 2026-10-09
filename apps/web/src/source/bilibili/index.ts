import type {
	SearchPage,
	VideoMetadata,
	VideoPreview,
	ImportedVideo,
	VideoSourceProvider,
} from "../types";
import { fetchBilibiliSearch } from "./search-transport";
import path from "path";
import fs from "fs/promises";
import { spawn } from "child_process";

export class BilibiliProvider implements VideoSourceProvider {
	readonly name = "bilibili";
	private downloadDir: string;
	private ytdlpPath: string;
	private ffmpegDir?: string;

	constructor(downloadDir?: string) {
		this.downloadDir =
			downloadDir || path.join(process.cwd(), ".local_storage", "downloads");

		this.ytdlpPath = process.env.YTDLP_PATH || "yt-dlp";
		this.ffmpegDir = process.env.FFMPEG_PATH || undefined;
	}

	async search(query: string, page = 1): Promise<SearchPage> {
		const cleanQuery = query.trim();
		if (!cleanQuery)
			return { results: [], page: 1, pageSize: 20, total: 0, totalPages: 0 };

		// Check if user entered a direct Bilibili BV ID or URL
		const bvMatch = cleanQuery.match(/BV[a-zA-Z0-9]{10}/i);
		if (bvMatch) {
			const bvid = bvMatch[0];
			try {
				const meta = await this.getMetadata(bvid);
				return {
					page: 1,
					pageSize: 20,
					total: 1,
					totalPages: 1,
					results: [
						{
							id: meta.id,
							title: meta.title,
							duration: meta.duration,
							durationFormatted: this.formatSeconds(meta.duration),
							thumbnail: meta.thumbnail,
							uploader: meta.uploader,
							url: meta.url,
							provider: "bilibili",
						},
					],
				};
			} catch (e) {
				console.warn(
					"Direct BV lookup failed, proceeding to keyword search:",
					e,
				);
			}
		}

		const data = await fetchBilibiliSearch(cleanQuery, page);
		const results = (data.result ?? []).map((item: any) => {
			const rawPic = item.pic || "";
			const pic = rawPic.startsWith("//")
				? `https:${rawPic}`
				: rawPic.startsWith("http://")
					? rawPic.replace("http://", "https://")
					: rawPic;

			return {
				id: item.bvid || String(item.aid),
				title: (item.title || "").replace(/<[^>]*>?/gm, "").trim(),
				duration: this.parseDuration(item.duration),
				durationFormatted: item.duration || "01:00",
				thumbnail: pic,
				uploader: item.author || "Bilibili Creator",
				viewCount:
					typeof item.play === "number"
						? `${Math.round(item.play / 1000)}K`
						: item.play,
				url: `https://www.bilibili.com/video/${item.bvid || item.aid}`,
				provider: "bilibili",
			};
		});
		return {
			results,
			page: data.page,
			pageSize: data.pagesize,
			total: data.numResults,
			totalPages: data.numPages,
		};
	}

	private getFfmpegBin(): string {
		if (!this.ffmpegDir) return "ffmpeg";
		const isFile =
			this.ffmpegDir.toLowerCase().endsWith(".exe") ||
			this.ffmpegDir.endsWith("/ffmpeg") ||
			this.ffmpegDir.endsWith("\\ffmpeg");
		if (isFile) return this.ffmpegDir;
		return path.join(
			this.ffmpegDir,
			process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
		);
	}

	private replaceMirror(url: string): string {
		return url.replace(
			/upos-hz-mirrorakam\.akamaized\.net/g,
			"upos-sz-mirrorhw.bilivideo.com",
		);
	}

	private async downloadViaFfmpeg(
		videoUrl: string,
		audioUrl: string | null,
		downloadFile: string,
	): Promise<void> {
		const ffmpegBin = this.getFfmpegBin();
		const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
		const args = [
			"-y",
			...(proxy ? ["-http_proxy", proxy] : []),
			"-headers",
			"Referer: https://www.bilibili.com/\r\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\r\n",
			"-i",
			this.replaceMirror(videoUrl),
		];
		if (audioUrl) {
			args.push(
				...(proxy ? ["-http_proxy", proxy] : []),
				"-headers",
				"Referer: https://www.bilibili.com/\r\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\r\n",
				"-i",
				this.replaceMirror(audioUrl),
				"-c",
				"copy",
				"-movflags",
				"+faststart",
			);
		} else {
			args.push("-c", "copy", "-movflags", "+faststart");
		}
		args.push(downloadFile);

		await new Promise<void>((resolve, reject) => {
			const proc = spawn(ffmpegBin, args, {
				env: {
					...process.env,
					...(proxy ? { HTTP_PROXY: proxy, HTTPS_PROXY: proxy } : {}),
				},
			});
			let stderr = "";
			proc.stderr.on("data", (d) => (stderr += d.toString()));
			proc.on("close", (code) => {
				if (code === 0) resolve();
				else
					reject(
						new Error(
							`ffmpeg tải video thất bại (code ${code}): ${stderr.slice(-500)}`,
						),
					);
			});
			proc.on("error", reject);
		});
	}

	private async fetchVideoDetails(
		id: string,
	): Promise<{ meta: VideoMetadata; formats: any[] }> {
		const jsonOutput = await new Promise<string>((resolve, reject) => {
			const proc = spawn(this.ytdlpPath, [
				"-j",
				"--skip-download",
				"--force-ipv4",
				"--socket-timeout",
				"15",
				"--retries",
				"3",
				`https://www.bilibili.com/video/${id}`,
			]);
			let stdout = "";
			let stderr = "";
			proc.stdout.on("data", (chunk) => (stdout += chunk));
			proc.stderr.on("data", (chunk) => (stderr += chunk));
			proc.on("close", (code) => {
				if (code === 0) resolve(stdout);
				else reject(new Error(`yt-dlp exited ${code}: ${stderr}`));
			});
			proc.on("error", reject);
		});

		const parsed = JSON.parse(jsonOutput);
		const thumbnail = parsed.thumbnails?.[0]?.url || parsed.thumbnail || "";
		return {
			meta: {
				id,
				title: parsed.fulltitle || parsed.title || id,
				duration: Math.round(parsed.duration || 60),
				thumbnail: thumbnail.replace("http://", "https://"),
				uploader: parsed.uploader || "Bilibili Creator",
				url: `https://www.bilibili.com/video/${id}`,
			},
			formats: parsed.formats || [],
		};
	}

	async getMetadata(id: string): Promise<VideoMetadata> {
		try {
			const details = await this.fetchVideoDetails(id);
			return details.meta;
		} catch (err) {
			console.warn("yt-dlp metadata failed, using fallback:", err);
			return {
				id,
				title: `Video Bilibili ${id}`,
				duration: 60,
				thumbnail: "",
				uploader: "Bilibili Creator",
				url: `https://www.bilibili.com/video/${id}`,
			};
		}
	}

	async getPreview(id: string): Promise<VideoPreview> {
		const meta = await this.getMetadata(id);
		return {
			id: meta.id,
			title: meta.title,
			thumbnail: meta.thumbnail,
			duration: meta.duration,
			videoUrl: `/api/source/preview?id=${id}`,
		};
	}

	async importVideo(id: string): Promise<ImportedVideo> {
		await fs.mkdir(this.downloadDir, { recursive: true });
		const targetFile = path.join(this.downloadDir, `${id}.full.mp4`);

		let meta: VideoMetadata;
		let formats: any[] = [];
		try {
			const details = await this.fetchVideoDetails(id);
			meta = details.meta;
			formats = details.formats;
		} catch (error: any) {
			if (error?.code === "ENOENT") {
				throw new Error(
					"yt-dlp was not found. Install yt-dlp on PATH or set YTDLP_PATH in apps/web/.env.local.",
					{ cause: error },
				);
			}
			meta = await this.getMetadata(id);
		}

		let needsDownload = false;
		try {
			const stat = await fs.stat(targetFile);
			if (stat.size < 50000) needsDownload = true;
		} catch {
			needsDownload = true;
		}

		if (needsDownload) {
			const downloadFile = path.join(
				this.downloadDir,
				`${id}.full.download.mp4`,
			);
			const videoUrl = `https://www.bilibili.com/video/${id}`;

			let downloadedSuccess = false;

			// 1. Try fast and reliable direct FFmpeg stream muxing with Bilibili mirror CDN
			if (formats.length > 0) {
				const videos = formats.filter(
					(f: any) => f.vcodec && f.vcodec !== "none" && f.url,
				);
				const audios = formats.filter(
					(f: any) => (!f.vcodec || f.vcodec === "none") && f.url,
				);
				const avcVideos = videos.filter(
					(f: any) => f.vcodec && f.vcodec.toLowerCase().startsWith("avc"),
				);
				const candidateVideos = avcVideos.length ? avcVideos : videos;
				candidateVideos.sort(
					(a: any, b: any) =>
						(b.height || 0) * 100000 +
						(b.tbr || 0) -
						((a.height || 0) * 100000 + (a.tbr || 0)),
				);
				audios.sort((a: any, b: any) => (b.tbr || 0) - (a.tbr || 0));

				const bestVideo = candidateVideos[0];
				const bestAudio = audios[0];

				if (bestVideo?.url) {
					try {
						await this.downloadViaFfmpeg(
							bestVideo.url,
							bestAudio?.url || null,
							downloadFile,
						);
						const downloaded = await fs.stat(downloadFile);
						if (downloaded.size > 0) {
							downloadedSuccess = true;
						}
					} catch (ffmpegErr) {
						console.warn(
							"Direct FFmpeg download with mirror failed, falling back to yt-dlp:",
							ffmpegErr,
						);
						await fs.rm(downloadFile, { force: true });
					}
				}
			}

			// 2. Fallback to standard yt-dlp if FFmpeg stream download was not used or failed
			if (!downloadedSuccess) {
				await new Promise<void>((resolve, reject) => {
					const proc = spawn(this.ytdlpPath, [
						...(this.ffmpegDir ? ["--ffmpeg-location", this.ffmpegDir] : []),
						"--force-ipv4",
						"--socket-timeout",
						"15",
						"--retries",
						"3",
						"--continue",
						"--no-playlist",
						"--no-progress",
						// Prefer H.264 because HEVC cannot be decoded by all supported browsers.
						"-f",
						"bv*[ext=mp4][vcodec^=avc]+ba[ext=m4a]/b[ext=mp4][vcodec^=avc]/best[vcodec^=avc]",
						"-o",
						downloadFile,
						videoUrl,
					]);

					proc.stdout.resume();
					let stderr = "";
					proc.stderr.on("data", (d) => (stderr += d.toString()));
					proc.on("close", (code) => {
						if (code === 0) resolve();
						else
							reject(
								new Error(
									`yt-dlp tải video thất bại (code ${code}): ${stderr.slice(-1500)}`,
								),
							);
					});
					proc.on("error", reject);
				}).catch((error: NodeJS.ErrnoException) => {
					if (error.code === "ENOENT") {
						throw new Error(
							"yt-dlp was not found. Install yt-dlp on PATH or set YTDLP_PATH in apps/web/.env.local.",
							{ cause: error },
						);
					}
					throw error;
				});
			}

			const downloaded = await fs.stat(downloadFile);
			if (!downloaded.size) throw new Error("Downloaded video is empty");
			await fs.rename(downloadFile, targetFile);
		}

		return {
			fullVideo: true,
			provider: "bilibili",
			sourceId: id,
			sourceUrl: `https://www.bilibili.com/video/${id}`,
			title: meta.title,
			thumbnail: meta.thumbnail,
			duration: meta.duration,
			localMediaPath: targetFile,
			createdAt: new Date().toISOString(),
		};
	}

	private parseDuration(durStr?: string): number {
		if (!durStr) return 60;
		const parts = durStr.split(":").map(Number);
		if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
		if (parts.length === 3)
			return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
		return 60;
	}

	private formatSeconds(sec: number): string {
		const m = Math.floor(sec / 60);
		const s = Math.floor(sec % 60);
		return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
	}
}
