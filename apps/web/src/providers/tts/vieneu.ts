import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createHash, randomUUID } from "node:crypto";
import { FFmpegService } from "@/media/ffmpeg";
import { prepareSpeechText } from "@/localization/timing";
import {
	SpeechProviderError,
	type TTSProvider,
	type TTSRequest,
	type TTSResult,
	type TTSVoice,
} from "./types";

const DEFAULT_ENDPOINT = "http://localhost:8000/v1/audio/speech";
const DEFAULT_MODEL = "vieneu-v3-turbo";
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1_000;

export { VIENEU_PRESET_VOICES, resolveVieNeuVoice } from "./voices";
import { VIENEU_PRESET_VOICES, resolveVieNeuVoice } from "./voices";

export class VieNeuTTSProvider implements TTSProvider {
	readonly name = "vieneu";
	readonly cacheNamespace: string;
	private readonly endpoint: string;
	private readonly model: string;
	private readonly apiKey: string;
	private readonly fetchImpl: typeof fetch;
	private readonly wait: (ms: number) => Promise<void>;
	private readonly cacheDirectory: string | false;

	constructor({
		endpoint = process.env.VIENEU_ENDPOINT ?? DEFAULT_ENDPOINT,
		model = process.env.VIENEU_MODEL ?? DEFAULT_MODEL,
		apiKey = process.env.VIENEU_API_KEY ?? "x",
		fetchImpl = fetch,
		wait = async (ms) => { if (ms > 0) await sleep(ms); },
		cacheDirectory = path.join(process.cwd(), ".local_storage", "speech", "vieneu"),
	}: {
		endpoint?: string;
		model?: string;
		apiKey?: string;
		fetchImpl?: typeof fetch;
		wait?: (ms: number) => Promise<void>;
		cacheDirectory?: string | false;
	} = {}) {
		this.endpoint = endpoint.trim().replace(/\/+$/, "");
		this.model = model.trim();
		this.apiKey = apiKey.trim();
		this.fetchImpl = fetchImpl;
		this.wait = wait;
		this.cacheDirectory = cacheDirectory;
		this.cacheNamespace = `vieneu:${this.endpoint}:${this.model}:v1`;
	}

	async getVoices(): Promise<TTSVoice[]> {
		const voicesUrl = this.endpoint.replace(/\/audio\/speech\/?$/, "/voices");
		try {
			const res = await this.fetchImpl(voicesUrl, {
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
				},
				signal: AbortSignal.timeout(5000),
			});
			if (res.ok) {
				const json = await res.json();
				const serverVoices = Array.isArray(json?.data) ? json.data : [];
				if (serverVoices.length > 0) {
					const metaMap = new Map(VIENEU_PRESET_VOICES.map((v) => [v.id, v]));
					return serverVoices.map((sv: any) => {
						const meta = metaMap.get(sv.id) || metaMap.get(sv.name);
						return {
							id: sv.id || sv.name,
							name: sv.name || sv.id,
							description: sv.description || meta?.description || "",
							gender: sv.gender || meta?.gender,
							region: meta?.region,
							style: meta?.style,
							featured: typeof sv.featured === "number" ? sv.featured : meta?.featured,
							aliases: Array.isArray(sv.aliases) ? sv.aliases : meta?.aliases,
						};
					});
				}
			}
		} catch {
			// Server unreachable; fall back to built-in presets
		}
		return VIENEU_PRESET_VOICES;
	}

	async generateSpeech(request: TTSRequest): Promise<TTSResult> {
		const text = request.text.trim();
		if (!text) throw new SpeechProviderError({ provider: "VieNeu", status: 400 });

		const voice = resolveVieNeuVoice(request.voice);
		const speed = request.speed ?? 1;
		const body = JSON.stringify({
			model: this.model,
			voice,
			input: await prepareSpeechText(text),
			response_format: "wav",
			speed,
		});
		const cacheFile = this.cacheDirectory ? path.join(this.cacheDirectory,
			`${createHash("sha256").update(`${this.cacheNamespace}\0${body}`).digest("hex")}.wav`) : undefined;
		let cachedDuration: number | undefined;
		if (cacheFile) {
			try {
				await fs.access(cacheFile);
				cachedDuration = (await FFmpegService.probeVideo(cacheFile)).duration;
			}
			catch { /* Missing or invalid audio is synthesized again. */ }
		}
		if (cachedDuration !== undefined && cacheFile) {
			await fs.mkdir(path.dirname(request.outputPath), { recursive: true });
			await fs.copyFile(cacheFile, request.outputPath);
			return { audioPath: request.outputPath, duration: cachedDuration };
		}

		for (let attempt = 0; ; attempt++) {
			let response: Response;
			try {
				response = await this.fetchImpl(this.endpoint, {
					method: "POST",
					headers: {
						"Authorization": `Bearer ${this.apiKey}`,
						"Content-Type": "application/json",
					},
					body,
					signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				});
			} catch {
				if (attempt < MAX_RETRIES) {
					await this.wait(BASE_RETRY_DELAY_MS * 2 ** attempt);
					continue;
				}
				throw new SpeechProviderError({ provider: "VieNeu (server không chạy?)", status: 0 });
			}

			if (response.ok) {
				const wav = Buffer.from(await response.arrayBuffer());
				if (!wav.length) throw new SpeechProviderError({ provider: "VieNeu (audio trống)", status: 502 });
				await fs.mkdir(path.dirname(request.outputPath), { recursive: true });
				await fs.writeFile(request.outputPath, wav);
				let duration: number;
				try {
					duration = (await FFmpegService.probeVideo(request.outputPath)).duration;
				} catch {
					throw new SpeechProviderError({ provider: "VieNeu (audio không hợp lệ)", status: 502 });
				}
				if (cacheFile) {
					const temporary = `${cacheFile}.${randomUUID()}.tmp`;
					try {
						await fs.mkdir(path.dirname(cacheFile), { recursive: true });
						await fs.writeFile(temporary, wav);
						await fs.rename(temporary, cacheFile);
					} catch {
						console.warn("Không lưu được cache giọng đọc; vẫn dùng audio đã tạo.");
					} finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
				}
				return { audioPath: request.outputPath, duration };
			}

			const headerRetryAfter = Number(response.headers.get("Retry-After")) * 1000 || 0;
			await response.body?.cancel();

			if (response.status === 429 && attempt < MAX_RETRIES) {
				const delay = Math.max(headerRetryAfter, BASE_RETRY_DELAY_MS * 2 ** attempt);
				await this.wait(delay);
				continue;
			}

			throw new SpeechProviderError({ provider: "VieNeu", status: response.status, retryAfterMs: headerRetryAfter });
		}
	}
}
