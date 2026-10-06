// Node server transport for Bilibili: cookies, request lifecycle and response cache.
// This module must never be imported by a client component.
const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const cookies = new Map<string, string>();
let sessionExpires = 0;
let sessionRequest: Promise<void> | undefined;
const pending = new Map<string, Promise<BilibiliSearchData>>();
const cache = new Map<string, { expires: number; data: BilibiliSearchData }>();
let blockedUntil = 0;

export interface BilibiliSearchData {
	page: number;
	pagesize: number;
	numResults: number;
	numPages: number;
	result?: Record<string, any>[];
}

export class BilibiliSearchError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly upstreamCode?: number,
	) {
		super(message);
		this.name = "BilibiliSearchError";
	}
}

function headers(): Record<string, string> {
	return {
		"User-Agent": USER_AGENT,
		Referer: "https://www.bilibili.com/",
		Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
	};
}

function acceptCookies(response: Response) {
	for (const cookie of response.headers.getSetCookie()) {
		const pair = cookie.split(";", 1)[0];
		const separator = pair.indexOf("=");
		if (separator > 0)
			cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
	}
}

async function ensureSession() {
	if (sessionExpires > Date.now()) return;
	if (sessionRequest) return sessionRequest;
	const request = (async () => {
		const response = await fetch("https://www.bilibili.com/", {
			headers: headers(),
			cache: "no-store",
			signal: AbortSignal.timeout(8000),
		});
		acceptCookies(response);
		await response.body?.cancel();
		if (!response.ok || !cookies.has("buvid3")) {
			throw new BilibiliSearchError(
				"Không thể khởi tạo phiên Bilibili. Vui lòng thử lại.",
				503,
			);
		}
		sessionExpires = Date.now() + 30 * 60_000;
	})();
	sessionRequest = request;
	try {
		await request;
	} finally {
		sessionRequest = undefined;
	}
}

async function requestSearch(url: string): Promise<BilibiliSearchData> {
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			if (blockedUntil > Date.now()) {
				throw new BilibiliSearchError(
					"Bilibili đang giới hạn tìm kiếm. Vui lòng thử lại sau 30 giây.",
					429,
				);
			}
			await ensureSession();
			const response = await fetch(url, {
				headers: headers(),
				cache: "no-store",
				signal: AbortSignal.timeout(10_000),
			});
			acceptCookies(response);
			if (response.status === 412 || response.status === 429) {
				await response.body?.cancel();
				blockedUntil = Date.now() + 30_000;
				throw new BilibiliSearchError(
					"Bilibili đang giới hạn tìm kiếm. Vui lòng thử lại sau 30 giây.",
					429,
					response.status,
				);
			}
			if (!response.ok) {
				await response.body?.cancel();
				throw new BilibiliSearchError(
					`Bilibili trả lỗi HTTP ${response.status}.`,
					response.status >= 500 ? 503 : 502,
					response.status,
				);
			}
			let body;
			try {
				body = await response.json();
			} catch (error) {
				// A timeout or interrupted body is a transport failure, not malformed JSON.
				if (!(error instanceof SyntaxError)) throw error;
				throw new BilibiliSearchError(
					"Bilibili trả phản hồi không hợp lệ.",
					502,
				);
			}
			if (body.code === -412 && attempt === 0) {
				// Refresh the guest session once; repeated refusals enter a cooldown.
				cookies.clear();
				sessionExpires = 0;
				await new Promise((resolve) => setTimeout(resolve, 500));
				continue;
			}
			if (body.code === -412 || body.code === -352 || body.code === -509) {
				blockedUntil = Date.now() + 30_000;
				throw new BilibiliSearchError(
					"Bilibili đang giới hạn tìm kiếm. Vui lòng thử lại sau 30 giây.",
					429,
					body.code,
				);
			}
			if (body.code !== 0)
				throw new BilibiliSearchError(
					`Bilibili trả mã lỗi ${body.code}.`,
					502,
					body.code,
				);
			const data = body.data;
			if (
				!data ||
				!Number.isInteger(data.page) ||
				!Number.isInteger(data.numPages) ||
				!Number.isInteger(data.numResults) ||
				!Number.isInteger(data.pagesize) ||
				(data.result != null && !Array.isArray(data.result))
			) {
				throw new BilibiliSearchError(
					"Bilibili trả dữ liệu tìm kiếm không hợp lệ.",
					502,
				);
			}
			return data;
		} catch (error) {
			if (error instanceof BilibiliSearchError && error.status !== 503)
				throw error;
			if (attempt === 2) {
				if (error instanceof BilibiliSearchError) throw error;
				throw new BilibiliSearchError(
					"Kết nối Bilibili bị lỗi hoặc quá thời gian. Vui lòng thử lại.",
					503,
				);
			}
			await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
		}
	}
	throw new BilibiliSearchError("Không thể tìm kiếm trên Bilibili.", 503);
}

export async function fetchBilibiliSearch(query: string, page: number) {
	const params = new URLSearchParams({
		search_type: "video",
		keyword: query,
		page: String(page),
		page_size: "20",
	});
	const url = `https://api.bilibili.com/x/web-interface/search/type?${params}`;
	const cached = cache.get(url);
	if (cached && cached.expires > Date.now()) return cached.data;
	if (pending.has(url)) return pending.get(url)!;
	if (blockedUntil > Date.now())
		throw new BilibiliSearchError(
			"Bilibili đang giới hạn tìm kiếm. Vui lòng thử lại sau 30 giây.",
			429,
		);
	const request = requestSearch(url).then((data) => {
		// Bound memory; failed responses are never cached.
		if (cache.size >= 100) cache.delete(cache.keys().next().value!);
		cache.set(url, { expires: Date.now() + 60_000, data });
		return data;
	});
	pending.set(url, request);
	try {
		return await request;
	} finally {
		pending.delete(url);
	}
}
