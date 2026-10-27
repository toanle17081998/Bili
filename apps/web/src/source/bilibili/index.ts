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
import { publishDownloadedFile } from "./download-files";

// Route modules can reload independently in development. Keep the filesystem
// writer shared across provider instances and hot reloads, keyed by output path.
const runtime = globalThis as typeof globalThis & {
	__bilibiliImports?: Map<string, Promise<ImportedVideo>>;
};
const importsInFlight = (runtime.__bilibiliImports ??= new Map());

const BILIBILI_HEADERS = {
	Referer: "https://www.bilibili.com/",
};

interface BilibiliStream {
	baseUrl?: string;
	base_url?: string;
	url?: string;
	codecid?: number;
	codecs?: string;
	height?: number;
	bandwidth?: number;
}

interface VideoFormat {
	url?: string;
	vcodec?: string;
	height?: number;
	tbr?: number;
}

interface BilibiliViewResponse {
	code: number;
	message?: string;
	data?: {
		cid?: number;
		title?: string;
		duration?: number;
		pic?: string;
		owner?: { name?: string };
	};
}

interface BilibiliPlayResponse {
	code: number;
	message?: string;
	data?: {
		quality?: number;
		dash?: { video?: BilibiliStream[]; audio?: BilibiliStream[] };
		durl?: BilibiliStream[];
	};
}

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

	private async fetchApiVideoDetails(
		id: string,
	): Promise<{ meta: VideoMetadata; formats: VideoFormat[] }> {
		const viewUrl = new URL("https://api.bilibili.com/x/web-interface/view");
		viewUrl.searchParams.set("bvid", id);
		const viewResponse = await fetch(viewUrl, { headers: BILIBILI_HEADERS });
		if (!viewResponse.ok) {
			throw new Error(`Bilibili view API returned ${viewResponse.status}`);
		}

		const view: BilibiliViewResponse = await viewResponse.json();
		if (view.code !== 0 || !view.data?.cid) {
			throw new Error(view.message || "Bilibili view API returned no video");
		}

		const playUrl = new URL("https://api.bilibili.com/x/player/playurl");
		playUrl.searchParams.set("bvid", id);
		playUrl.searchParams.set("cid", String(view.data.cid));
		playUrl.searchParams.set("qn", "80");
		playUrl.searchParams.set("fnval", "4048");
		playUrl.searchParams.set("fourk", "1");
		const playResponse = await fetch(playUrl, { headers: BILIBILI_HEADERS });
		if (!playResponse.ok) {
			throw new Error(`Bilibili play API returned ${playResponse.status}`);
		}

		const play: BilibiliPlayResponse = await playResponse.json();
		if (play.code !== 0 || !play.data) {
			throw new Error(play.message || "Bilibili play API returned no stream");
		}

		const streamUrl = (stream: BilibiliStream) =>
			stream?.baseUrl || stream?.base_url || stream?.url;
		const formats = [
			...(play.data.dash?.video || []).map((stream) => ({
				url: streamUrl(stream),
				vcodec:
					stream.codecid === 7
						? "avc1"
						: stream.codecs || String(stream.codecid),
				height: stream.height,
				tbr: stream.bandwidth ? stream.bandwidth / 1000 : 0,
			})),
			...(play.data.dash?.audio || []).map((stream) => ({
				url: streamUrl(stream),
				vcodec: "none",
				tbr: stream.bandwidth ? stream.bandwidth / 1000 : 0,
			})),
			...(play.data.durl || []).map((stream) => ({
				url: streamUrl(stream),
				vcodec: "avc1",
				height: play.data.quality || 0,
			})),
		].filter((format) => format.url);

		if (!formats.length)
			throw new Error("Bilibili play API returned no stream URL");

		return {
			meta: {
				id,
				title: view.data.title || id,
				duration: Math.round(view.data.duration || 60),
				thumbnail: (view.data.pic || "").replace("http://", "https://"),
				uploader: view.data.owner?.name || "Bilibili Creator",
				url: `https://www.bilibili.com/video/${id}`,
			},
			formats,
		};
	}

	private async fetchYtdlpVideoDetails(
		id: string,
	): Promise<{ meta: VideoMetadata; formats: VideoFormat[] }> {
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

	private async fetchVideoDetails(
		id: string,
	): Promise<{ meta: VideoMetadata; formats: VideoFormat[] }> {
		try {
			return await this.fetchApiVideoDetails(id);
		} catch (apiError) {
			console.warn("Bilibili API failed, falling back to yt-dlp:", apiError);
			return this.fetchYtdlpVideoDetails(id);
		}
	}

	async getMetadata(id: string): Promise<VideoMetadata> {
		try {
			const details = await this.fetchVideoDetails(id);
			return details.meta;
		} catch (err) {
			console.warn("Bilibili metadata lookup failed, using fallback:", err);
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
		const output = path.resolve(this.downloadDir, `${id}.full.mp4`);
		const key = process.platform === "win32" ? output.toLowerCase() : output;
		let request = importsInFlight.get(key);
		if (!request) {
			request = this.downloadVideo(id);
			importsInFlight.set(key, request);
		}
		try {
			return await request;
		} finally {
			if (importsInFlight.get(key) === request) importsInFlight.delete(key);
		}
	}

	private async readImportedFile({ id, mediaPath, manifestPath, targetFile, requireSize = false }: {
		id: string;
		mediaPath: string;
		manifestPath: string;
		targetFile: string;
		requireSize?: boolean;
	}): Promise<ImportedVideo | undefined> {
		try {
			const stat = await fs.stat(mediaPath);
			if (stat.isFile() && stat.size >= (requireSize ? 1 : 50000)) {
				const cached: ImportedVideo & { downloadedSize?: number } = JSON.parse(
					await fs.readFile(manifestPath, "utf8"),
				);
				if (
					(!requireSize || cached.downloadedSize === stat.size) &&
					cached.provider === this.name && cached.sourceId === id &&
					cached.fullVideo === true && cached.localMediaPath === targetFile &&
					typeof cached.title === "string" && typeof cached.thumbnail === "string" &&
					typeof cached.sourceUrl === "string" && typeof cached.createdAt === "string" &&
					Number.isFinite(cached.duration) && cached.duration > 0
				) {
					const { downloadedSize: _downloadedSize, ...imported } = cached;
					return imported;
				}
			}
		} catch {
			// Older downloads without a valid manifest still refresh their metadata.
		}
	}

	private async downloadVideo(id: string): Promise<ImportedVideo> {
		await fs.mkdir(this.downloadDir, { recursive: true });
		const targetFile = path.join(this.downloadDir, `${id}.full.mp4`);
		const downloadFile = path.join(this.downloadDir, `${id}.full.download.mp4`);
		const completedFile = `${downloadFile}.complete.json`;
		// This marker is written only after the downloader exits successfully.
		// Never promote an unmarked partial download based only on its size.
		const completed = await this.readImportedFile({ id, mediaPath: downloadFile, manifestPath: completedFile, targetFile, requireSize: true });
		if (completed) {
			await publishDownloadedFile({ temporaryPath: downloadFile, finalPath: targetFile });
			await fs.rm(completedFile, { force: true }).catch(() => {});
			return completed;
		}

		let meta: VideoMetadata;
		let formats: VideoFormat[] = [];
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
		const imported: ImportedVideo = {
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

		let needsDownload = false;
		try {
			const stat = await fs.stat(targetFile);
			if (stat.size < 50000) needsDownload = true;
		} catch {
			needsDownload = true;
		}

		if (needsDownload) {
			const videoUrl = `https://www.bilibili.com/video/${id}`;

			let downloadedSuccess = false;

			// 1. Try fast and reliable direct FFmpeg stream muxing with Bilibili mirror CDN
			if (formats.length > 0) {
				const videos = formats.filter(
					(f) => f.vcodec && f.vcodec !== "none" && f.url,
				);
				const audios = formats.filter(
					(f) => (!f.vcodec || f.vcodec === "none") && f.url,
				);
				const avcVideos = videos.filter(
					(f) => f.vcodec && f.vcodec.toLowerCase().startsWith("avc"),
				);
				const candidateVideos = avcVideos.length ? avcVideos : videos;
				candidateVideos.sort(
					(a, b) =>
						(b.height || 0) * 100000 +
						(b.tbr || 0) -
						((a.height || 0) * 100000 + (a.tbr || 0)),
				);
				audios.sort((a, b) => (b.tbr || 0) - (a.tbr || 0));

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
			await fs.writeFile(completedFile, JSON.stringify({ ...imported, downloadedSize: downloaded.size }));
			await publishDownloadedFile({ temporaryPath: downloadFile, finalPath: targetFile });
			await fs.rm(completedFile, { force: true }).catch(() => {});
		}

		return imported;
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
