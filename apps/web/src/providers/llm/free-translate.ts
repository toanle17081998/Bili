import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { loadDubbingTiming } from "@/localization/timing";
import type { TranscriptSegment, TranslationSegment } from "@/localization/schemas";
import type { LLMProvider } from "./index";

const ResponseSchema = z.tuple([
	z.array(z.tuple([z.string()]).rest(z.unknown())),
]).rest(z.unknown());
const CacheSchema = z.object({
	source: z.string(),
	vietnameseText: z.string().trim().min(1),
});

export function createTranslationScheduler() {
	return {
		tail: Promise.resolve(),
		nextRequestAt: 0,
		blockedUntil: 0,
		blockedStatus: 429,
		pending: new Map<string, Promise<string>>(),
		completed: new Map<string, string>(),
	};
}
const sharedScheduler = createTranslationScheduler();
type TranslationFetch = (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>;

export class TranslationCooldownError extends Error {
	readonly status: number;
	readonly retryAfterMs: number;
	constructor({ status, retryAfterMs }: { status: number; retryAfterMs: number }) {
		super(status === 429
			? `Dịch vụ dịch miễn phí đang giới hạn lượt gọi (HTTP 429). Chờ ít nhất ${Math.ceil(retryAfterMs / 1000)} giây rồi thử lại, hoặc cấu hình GEMINI_API_KEY / OPENAI_API_KEY.`
			: `Dịch vụ dịch tạm thời không khả dụng (HTTP ${status}). Chờ ít nhất ${Math.ceil(retryAfterMs / 1000)} giây rồi thử lại.`);
		this.status = status;
		this.retryAfterMs = retryAfterMs;
		this.name = "TranslationCooldownError";
	}
}

export class TranslationRateLimitError extends TranslationCooldownError {
	constructor(retryAfterMs: number) {
		super({ status: 429, retryAfterMs });
		this.name = "TranslationRateLimitError";
	}
}

function retryAfterMilliseconds({ value, now }: { value: string | null; now: number }): number {
	if (!value?.trim()) return 0;
	const seconds = Number(value);
	if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
	const date = Date.parse(value);
	return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

export class FreeTranslateLLMProvider implements LLMProvider {
	readonly name = "free-translate";
	private readonly fetchImpl: TranslationFetch;
	private readonly wait: (milliseconds: number) => Promise<void>;
	private readonly now: () => number;
	private readonly cacheDirectory: string;
	private readonly scheduler: ReturnType<typeof createTranslationScheduler>;

	constructor({
		fetchImpl = (...args) => fetch(...args),
		wait = async (milliseconds) => { await sleep(milliseconds); },
		now = Date.now,
		cacheDirectory = path.join(process.cwd(), ".local_storage", "translations", "free-translate"),
		scheduler = sharedScheduler,
	}: {
		fetchImpl?: TranslationFetch;
		wait?: (milliseconds: number) => Promise<void>;
		now?: () => number;
		cacheDirectory?: string;
		scheduler?: ReturnType<typeof createTranslationScheduler>;
	} = {}) {
		this.fetchImpl = fetchImpl;
		this.wait = wait;
		this.now = now;
		this.cacheDirectory = cacheDirectory;
		this.scheduler = scheduler;
	}

	async translateAndRewrite(segments: TranscriptSegment[]): Promise<TranslationSegment[]> {
		if (segments.some((source) => !source.text.trim())) {
			throw new Error("Đoạn lời thoại gốc rỗng. Vui lòng thử lại.");
		}
		const results: TranslationSegment[] = [];
		for (const seg of segments) {
			const text = seg.text.trim();
			let vietnameseText: string;
			try {
				vietnameseText = await this.translateText({ text });
			} catch (error) {
				if (error instanceof TranslationCooldownError) throw error;
				throw new Error("Không thể dịch lời thoại sang tiếng Việt. Vui lòng thử lại.", { cause: error });
			}
			results.push({
				sourceStart: seg.start,
				sourceEnd: seg.end,
				sourceText: text,
				vietnameseText,
				targetDuration: Number((seg.end - seg.start).toFixed(2)),
			});
		}
		return results;
	}

	private async translateText({ text }: { text: string }): Promise<string> {
		const key = createHash("sha256").update(`google-gtx:auto:vi:v1\0${text}`).digest("hex");
		const file = path.join(this.cacheDirectory, `${key}.json`);
		const pendingKey = `${this.cacheDirectory}:${key}`;
		const completed = this.scheduler.completed.get(pendingKey);
		if (completed) return completed;
		try {
			const cached = CacheSchema.parse(JSON.parse(await fs.readFile(file, "utf8")));
			if (cached.source === text) return cached.vietnameseText;
		} catch { /* Missing or damaged cache entries are fetched again. */ }

		// Deduplicate callers and serialize network work across preview/process jobs.
		const ready = this.scheduler.completed.get(pendingKey);
		if (ready) return ready;
		const existing = this.scheduler.pending.get(pendingKey);
		if (existing) return existing;
		const pending = this.scheduler.tail.then(async () => {
			const vietnameseText = await this.requestTranslation({ text });
			this.scheduler.completed.set(pendingKey, vietnameseText);
			const policy = await loadDubbingTiming();
			for (const key of this.scheduler.completed.keys()) {
				if (this.scheduler.completed.size <= policy.translation_memory_cache_entries()) break;
				this.scheduler.completed.delete(key);
			}
			try {
				await fs.mkdir(this.cacheDirectory, { recursive: true });
				await fs.writeFile(file, JSON.stringify({ source: text, vietnameseText }));
			} catch (error) {
				console.warn("Could not cache translation:", error);
			}
			return vietnameseText;
		});
		this.scheduler.pending.set(pendingKey, pending);
		this.scheduler.tail = pending.then(() => undefined, () => undefined);
		try {
			return await pending;
		} finally {
			this.scheduler.pending.delete(pendingKey);
		}
	}

	private async requestTranslation({ text }: { text: string }): Promise<string> {
		const policy = await loadDubbingTiming();
		if (this.scheduler.blockedUntil > this.now()) {
			const retryAfterMs = this.scheduler.blockedUntil - this.now();
			throw this.scheduler.blockedStatus === 429
				? new TranslationRateLimitError(retryAfterMs)
				: new TranslationCooldownError({ status: 503, retryAfterMs });
		}
		const url = new URL("https://translate.googleapis.com/translate_a/single");
		url.search = new URLSearchParams({ client: "gtx", sl: "auto", tl: "vi", dt: "t", q: text }).toString();
		for (let retry = 0; ; retry++) {
			await this.wait(Math.max(0, this.scheduler.nextRequestAt - this.now()));
			this.scheduler.nextRequestAt = this.now() + policy.translation_request_interval_ms();
			let response: Response;
			try {
				response = await this.fetchImpl(url, { signal: AbortSignal.timeout(30_000) });
			} catch (error) {
				const delay = policy.translation_retry_delay_ms(0, retry, 0);
				if (delay < 0) throw error;
				this.scheduler.nextRequestAt = Math.max(this.scheduler.nextRequestAt, this.now() + delay);
				continue;
			}
			if (response.ok) {
				const data = ResponseSchema.parse(await response.json());
				const translated = data[0].map((item) => item[0]).join("").trim();
				if (!translated) throw new Error("Bản dịch trả về trống.");
				return translated;
			}
			const retryAfter = retryAfterMilliseconds({ value: response.headers.get("Retry-After"), now: this.now() });
			await response.body?.cancel();
			const delay = policy.translation_retry_delay_ms(response.status, retry, retryAfter);
			if (delay >= 0) {
				this.scheduler.nextRequestAt = Math.max(this.scheduler.nextRequestAt, this.now() + delay);
				continue;
			}
			if (response.status === 429 || retryAfter > 0) {
				const cooldown = policy.translation_cooldown_ms(retryAfter);
				this.scheduler.blockedUntil = this.now() + cooldown;
				this.scheduler.blockedStatus = response.status;
				throw response.status === 429
					? new TranslationRateLimitError(cooldown)
					: new TranslationCooldownError({ status: 503, retryAfterMs: cooldown });
			}
			throw new Error(`Translation HTTP ${response.status}`);
		}
	}
}

export class TranslationCooldownError extends Error {
	readonly status: number;
	readonly retryAfterMs: number;
	constructor(
		message = "Hệ thống dịch thuật đang tạm thời giới hạn tốc độ. Vui lòng thử lại sau.",
		status = 429,
		retryAfterMs = 5000,
	) {
		super(message);
		this.name = "TranslationCooldownError";
		this.status = status;
		this.retryAfterMs = retryAfterMs;
	}
}
