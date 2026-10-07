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

	async getMetadata(id: string): Promise<VideoMetadata> {
		try {
			const jsonOutput = await new Promise<string>((resolve, reject) => {
				const proc = spawn(this.ytdlpPath, [
					"-j",
					"--skip-download",
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
				id,
				title: parsed.fulltitle || parsed.title || id,
				duration: Math.round(parsed.duration || 60),
				thumbnail: thumbnail.replace("http://", "https://"),
				uploader: parsed.uploader || "Bilibili Creator",
				url: `https://www.bilibili.com/video/${id}`,
			};
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

		// Fetch real video metadata first
		const meta = await this.getMetadata(id);

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
			await new Promise<void>((resolve, reject) => {
				const proc = spawn(this.ytdlpPath, [
					...(this.ffmpegDir ? ["--ffmpeg-location", this.ffmpegDir] : []),
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
								`yt-dlp tải video thất bại (code ${code}): ${stderr.slice(0, 200)}`,
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
