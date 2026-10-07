import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	createTranslationScheduler,
	FreeTranslateLLMProvider,
	TranslationRateLimitError,
	TranslationCooldownError,
} from "./free-translate";

const segment = { start: 4, end: 6.25, text: "Source speech" };
const translated = () => Response.json([[["Loi thoai tieng Viet", "Source speech", null]]]);

async function withTransport({
	respond,
	run,
}: {
	respond: (request: { url: URL; attempt: number }) => Response | Promise<Response>;
	run: (fixture: {
		provider: FreeTranslateLLMProvider;
		options: ConstructorParameters<typeof FreeTranslateLLMProvider>[0];
		calls: number[];
		waits: number[];
		advance: (ms: number) => void;
	}) => Promise<void>;
}) {
	const prefix = path.join(os.tmpdir(), "opencut-translation-");
	const cacheDirectory = await fs.mkdtemp(prefix);
	let clock = 0;
	const calls: number[] = [];
	const waits: number[] = [];
	const options = {
		cacheDirectory,
		scheduler: createTranslationScheduler(),
		now: () => clock,
		wait: async (ms: number) => { waits.push(ms); clock += ms; },
		fetchImpl: async (...args: Parameters<typeof fetch>) => {
			calls.push(clock);
			assert.ok(args[1]?.signal);
			return respond({ url: new URL(String(args[0])), attempt: calls.length });
		},
	};
	try {
		await run({
			provider: new FreeTranslateLLMProvider(options), options, calls, waits,
			advance: (ms) => { clock += ms; },
		});
	} finally {
		assert.ok(path.resolve(cacheDirectory).startsWith(prefix));
		await fs.rm(cacheDirectory, { recursive: true, force: true });
	}
}

test("429 retries honor Retry-After seconds and HTTP dates without changing source timing", async () => {
	for (const retryAfter of ["20", "Thu, 01 Jan 1970 00:00:20 GMT"]) {
		await withTransport({
			respond: ({ url, attempt }) => {
				assert.equal(url.searchParams.get("q"), segment.text);
				assert.equal(url.searchParams.get("tl"), "vi");
				return attempt === 1
					? new Response(null, { status: 429, headers: { "Retry-After": retryAfter } })
					: translated();
			},
			run: async ({ provider, calls }) => {
				assert.deepEqual(await provider.translateAndRewrite([segment]), [{
					sourceStart: 4, sourceEnd: 6.25, sourceText: segment.text,
					vietnameseText: "Loi thoai tieng Viet", targetDuration: 2.25,
				}]);
				assert.deepEqual(calls, [0, 20000]);
			},
		});
	}
});

test("persistent 429 is bounded, shares cooldown, and preserves completed translations", async () => {
	let limited = true;
	await withTransport({
		respond: ({ url }) => url.searchParams.get("q") === "Other speech" && limited
			? new Response(null, { status: 429 }) : translated(),
		run: async ({ provider, options, calls, advance }) => {
			const other = { start: 10, end: 12, text: "Other speech" };
			await assert.rejects(provider.translateAndRewrite([segment, other]), (error: unknown) => {
				assert.ok(error instanceof TranslationRateLimitError);
				assert.equal(error.retryAfterMs, 60000);
				return true;
			});
			assert.equal(calls.length, 4);
			const second = new FreeTranslateLLMProvider(options);
			await assert.rejects(second.translateAndRewrite([segment, other]), TranslationRateLimitError);
			assert.equal(calls.length, 4, "cooldown never calls upstream");
			assert.equal((await second.translateAndRewrite([segment])).length, 1, "cached speech works during cooldown");
			limited = false;
			advance(60000);
			assert.equal((await second.translateAndRewrite([segment, other])).length, 2);
			assert.equal(calls.length, 5, "retry resumes without repeating completed requests");
		},
	});
});

test("long Retry-After stops immediately instead of retrying before the service permits", async () => {
	await withTransport({
		respond: () => new Response(null, { status: 429, headers: { "Retry-After": "120" } }),
		run: async ({ provider, calls }) => {
			await assert.rejects(provider.translateAndRewrite([segment]), (error: unknown) => {
				assert.ok(error instanceof TranslationRateLimitError);
				assert.equal(error.retryAfterMs, 120000);
				return true;
			});
			assert.equal(calls.length, 1);
		},
	});
});

test("terminal 503 Retry-After also blocks queued jobs until the upstream deadline", async () => {
	await withTransport({
		respond: ({ attempt }) => attempt === 1
			? new Response(null, { status: 503, headers: { "Retry-After": "120" } })
			: translated(),
		run: async ({ provider, options, calls, advance }) => {
			await assert.rejects(provider.translateAndRewrite([segment]), (error: unknown) => {
				assert.ok(error instanceof TranslationCooldownError);
				assert.equal(error.status, 503);
				assert.equal(error.retryAfterMs, 120000);
				return true;
			});
			const second = new FreeTranslateLLMProvider(options);
			advance(1000);
			await assert.rejects(second.translateAndRewrite([{ ...segment, text: "Different" }]), TranslationCooldownError);
			assert.deepEqual(calls, [0]);
			advance(119000);
			await second.translateAndRewrite([segment]);
			assert.deepEqual(calls, [0, 120000]);
		},
	});
});

test("disk cache failure retains completed translations in memory across a failed batch", async () => {
	const originalWarn = console.warn;
	let warnings = 0;
	console.warn = () => { warnings++; };
	try {
		await withTransport({
			respond: ({ url }) => url.searchParams.get("q") === "Other speech"
				? new Response(null, { status: 429 }) : translated(),
			run: async ({ options, calls }) => {
				assert.ok(options?.cacheDirectory);
				const blocked = path.join(options.cacheDirectory, "not-a-directory");
				await fs.writeFile(blocked, "block cache writes");
				const provider = new FreeTranslateLLMProvider({ ...options, cacheDirectory: blocked });
				await assert.rejects(provider.translateAndRewrite([
					segment, { ...segment, text: "Other speech" },
				]), TranslationRateLimitError);
				assert.equal(calls.length, 4);
				const result = await provider.translateAndRewrite([segment]);
				assert.equal(result[0].vietnameseText, "Loi thoai tieng Viet");
				assert.equal(calls.length, 4);
				assert.equal(warnings, 1);
			},
		});
	} finally {
		console.warn = originalWarn;
	}
});

test("translations persist across provider instances while every clip keeps its own timestamps", async () => {
	await withTransport({
		respond: translated,
		run: async ({ provider, options, calls }) => {
			await provider.translateAndRewrite([segment]);
			const fresh = new FreeTranslateLLMProvider({ ...options, scheduler: createTranslationScheduler() });
			const result = await fresh.translateAndRewrite([{ ...segment, start: 30, end: 32 }]);
			assert.equal(calls.length, 1);
			assert.equal(result[0].sourceStart, 30);
			assert.equal(result[0].sourceEnd, 32);
			assert.equal(result[0].targetDuration, 2);
		},
	});
});

test("concurrent previews deduplicate shared text and serialize different text", async () => {
	let active = 0;
	let peak = 0;
	await withTransport({
		respond: async () => {
			active++;
			peak = Math.max(peak, active);
			await new Promise((resolve) => setTimeout(resolve, 10));
			active--;
			return translated();
		},
		run: async ({ provider, options, calls }) => {
			const second = new FreeTranslateLLMProvider(options);
			await Promise.all([
				provider.translateAndRewrite([segment]),
				second.translateAndRewrite([segment]),
				second.translateAndRewrite([{ ...segment, text: "Different" }]),
			]);
			assert.equal(peak, 1);
			assert.deepEqual(calls, [0, 1000]);
		},
	});
});

test("completed memory cache is bounded without cancelling queued translations", async () => {
	await withTransport({
		respond: translated,
		run: async ({ provider, options, calls }) => {
			const segments = Array.from({ length: 513 }, (_, index) => ({
				start: index * 2, end: index * 2 + 1, text: `Speech ${index}`,
			}));
			assert.equal((await provider.translateAndRewrite(segments)).length, 513);
			assert.equal(calls.length, 513);
			assert.equal(options?.scheduler?.completed.size, 512);
			assert.equal(options?.scheduler?.pending.size, 0);
			await provider.translateAndRewrite([segments[0]]);
			assert.equal(calls.length, 513, "evicted entries are still available on disk");
		},
	});
});

test("invalid or empty translations fail and are never cached as successful speech", async () => {
	for (const body of [[], [[null]], [[[""]]]]) {
		await withTransport({
			respond: ({ attempt }) => attempt === 1 ? Response.json(body) : translated(),
			run: async ({ provider, calls }) => {
				await assert.rejects(provider.translateAndRewrite([segment]), /Không thể dịch/);
				assert.equal((await provider.translateAndRewrite([segment])).length, 1);
				assert.equal(calls.length, 2);
			},
		});
	}
});

test("transient network and server failures retry, permanent client failures do not", async () => {
	for (const failure of ["network", "server", "client"]) {
		await withTransport({
			respond: ({ attempt }) => {
				if (attempt > 1) return translated();
				if (failure === "network") throw new TypeError("fetch failed");
				return new Response(null, { status: failure === "server" ? 503 : 400 });
			},
			run: async ({ provider, calls }) => {
				if (failure === "client") {
					await assert.rejects(provider.translateAndRewrite([segment]), /Không thể dịch/);
					assert.equal(calls.length, 1);
				} else {
					assert.equal((await provider.translateAndRewrite([segment])).length, 1);
					assert.deepEqual(calls, [0, 2000]);
				}
			},
		});
	}
});
