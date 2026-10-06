import { test } from "node:test";
import assert from "node:assert/strict";
import { BilibiliSearchError, fetchBilibiliSearch } from "./search-transport";

test(
	"guest session, pagination, cache, retries, refusal refresh and cooldown",
	{ timeout: 15_000 },
	async () => {
		const originalFetch = globalThis.fetch;
		const originalNow = Date.now;
		let now = originalNow();
		let sessions = 0;
		let searches = 0;
		let mode:
			| "ok"
			| "transient"
			| "invalid"
			| "refresh"
			| "blocked"
			| "body-timeout" = "ok";
		let failNext = true;
		Date.now = () => now;
		globalThis.fetch = (async (input, init) => {
			const url = new URL(String(input));
			if (url.hostname === "www.bilibili.com") {
				sessions++;
				return new Response("", {
					headers: { "Set-Cookie": `buvid3=guest-${sessions}; Path=/` },
				});
			}
			searches++;
			assert.ok(
				new Headers(init?.headers)
					.get("cookie")
					?.includes(`buvid3=guest-${sessions}`),
			);
			if (mode === "transient" && failNext) {
				failNext = false;
				return new Response("unavailable", { status: 503 });
			}
			if (mode === "body-timeout" && failNext) {
				failNext = false;
				const response = new Response("");
				response.json = async () => {
					throw new DOMException("Body timed out", "TimeoutError");
				};
				return response;
			}
			if (mode === "invalid") return Response.json({ code: -400 });
			if (mode === "blocked" || (mode === "refresh" && failNext)) {
				failNext = false;
				return Response.json({ code: -412 });
			}
			return Response.json({
				code: 0,
				data: {
					page: Number(url.searchParams.get("page")),
					pagesize: 20,
					numResults: 40,
					numPages: 2,
					result: [{ bvid: "BVexample" }],
				},
			});
		}) as typeof fetch;
		try {
			const [first, duplicate] = await Promise.all([
				fetchBilibiliSearch("cache", 1),
				fetchBilibiliSearch("cache", 1),
			]);
			assert.deepEqual(first, duplicate);
			assert.equal(sessions, 1);
			assert.equal(searches, 1);
			await fetchBilibiliSearch("cache", 1);
			assert.equal(searches, 1);
			assert.equal((await fetchBilibiliSearch("cache", 2)).page, 2);
			assert.equal(searches, 2);
			now += 61_000;
			await fetchBilibiliSearch("cache", 1);
			assert.equal(searches, 3);
			mode = "transient";
			assert.equal((await fetchBilibiliSearch("retry", 1)).page, 1);
			assert.equal(searches, 5);
			mode = "invalid";
			await assert.rejects(
				fetchBilibiliSearch("failure", 1),
				BilibiliSearchError,
			);
			mode = "ok";
			await fetchBilibiliSearch("failure", 1);
			assert.equal(searches, 7);
			mode = "refresh";
			failNext = true;
			await fetchBilibiliSearch("refresh", 1);
			assert.equal(sessions, 2);
			assert.equal(searches, 9);
			mode = "body-timeout";
			failNext = true;
			const beforeTimeout = searches;
			await fetchBilibiliSearch("body-timeout", 1);
			assert.equal(searches, beforeTimeout + 2);
			mode = "blocked";
			await assert.rejects(fetchBilibiliSearch("blocked", 1), {
				status: 429,
				upstreamCode: -412,
			});
			const beforeCooldown = searches;
			await assert.rejects(fetchBilibiliSearch("another", 1), { status: 429 });
			assert.equal(searches, beforeCooldown);
			// Good cached pages remain available during the cooldown.
			await fetchBilibiliSearch("refresh", 1);
			assert.equal(searches, beforeCooldown);
			now += 31_000;
			mode = "ok";
			await fetchBilibiliSearch("another", 1);
			assert.equal(searches, beforeCooldown + 1);
		} finally {
			globalThis.fetch = originalFetch;
			Date.now = originalNow;
		}
	},
);
