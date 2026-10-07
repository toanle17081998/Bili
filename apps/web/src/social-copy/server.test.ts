import { test, expect } from "bun:test";
import { generateSocialCopy } from "./server";
import { SocialCopyRequestSchema } from "./schemas";

const input = { title: "Nấu phở", content: "Nước dùng từ xương bò.", tone: "friendly" as const };
const posts = {
	tiktok: { title: "", caption: "Phở bò tại nhà", hashtags: ["#Pho", "#pho", "#AmThuc"] },
	facebook: { title: "", caption: "Cùng nấu phở nhé!", hashtags: ["#PhoBo"] },
	youtube: { title: "Nấu phở 🍜", caption: "Cách nấu nước dùng", hashtags: ["#PhoBo", "#AmThuc", "#Extra"] },
};

test("API boundary rejects invalid input before invoking a provider", () => {
	expect(SocialCopyRequestSchema.safeParse({ ...input, content: " " }).success).toBe(false);
	expect(SocialCopyRequestSchema.safeParse({ ...input, content: "x".repeat(12001) }).success).toBe(false);
	expect(SocialCopyRequestSchema.safeParse({ ...input, title: "bad\0title" }).success).toBe(false);
	expect(SocialCopyRequestSchema.safeParse({ ...input, tone: "unknown" }).success).toBe(false);
});

test("provider adapters normalize Gemini/OpenAI results and propagate failures", async () => {
	const gemini = process.env.GEMINI_API_KEY;
	const openai = process.env.OPENAI_API_KEY;
	const openaiLlm = process.env.OPENAI_LLM_API_KEY;
	const openaiBase = process.env.OPENAI_LLM_BASE_URL;
	const openaiModel = process.env.OPENAI_LLM_MODEL;
	const originalFetch = globalThis.fetch;
	try {
		delete process.env.GEMINI_API_KEY;
		delete process.env.OPENAI_API_KEY;
		delete process.env.OPENAI_LLM_API_KEY;
		delete process.env.OPENAI_LLM_BASE_URL;
		delete process.env.OPENAI_LLM_MODEL;
		const draft = await generateSocialCopy({ input });
		expect(draft.mode).toBe("draft");
		expect(draft.posts.youtube.hashtags).toContain("#Shorts");

		process.env.GEMINI_API_KEY = "test-placeholder";
		let providerUrl = "";
		globalThis.fetch = Object.assign(async (url: string | URL | Request) => {
			providerUrl = String(url);
			return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(posts) }] } }] });
		}, { preconnect: originalFetch.preconnect });
		const geminiResult = await generateSocialCopy({ input });
		expect(providerUrl).toContain("generativelanguage.googleapis.com");
		expect(geminiResult.mode).toBe("ai");
		expect(geminiResult.posts.tiktok.hashtags).toEqual(["#Pho", "#AmThuc"]);
		expect(geminiResult.posts.youtube.hashtags).toEqual(["#Shorts", "#PhoBo", "#AmThuc"]);

		delete process.env.GEMINI_API_KEY;
		process.env.OPENAI_API_KEY = "test-placeholder";
		globalThis.fetch = Object.assign(async (url: string | URL | Request) => {
			providerUrl = String(url);
			return Response.json({ choices: [{ message: { content: JSON.stringify(posts) } }] });
		}, { preconnect: originalFetch.preconnect });
		expect((await generateSocialCopy({ input })).mode).toBe("ai");
		expect(providerUrl).toContain("api.openai.com");

		globalThis.fetch = Object.assign(async () => new Response("unavailable", { status: 429 }), { preconnect: originalFetch.preconnect });
		await expect(generateSocialCopy({ input })).rejects.toThrow("429");
		globalThis.fetch = Object.assign(async () => Response.json({ choices: [{ message: { content: "{}" } }] }), { preconnect: originalFetch.preconnect });
		await expect(generateSocialCopy({ input })).rejects.toThrow("chưa đủ 3 nền tảng");
	} finally {
		globalThis.fetch = originalFetch;
		if (gemini === undefined) delete process.env.GEMINI_API_KEY;
		else process.env.GEMINI_API_KEY = gemini;
		if (openai === undefined) delete process.env.OPENAI_API_KEY;
		else process.env.OPENAI_API_KEY = openai;
		if (openaiLlm === undefined) delete process.env.OPENAI_LLM_API_KEY;
		else process.env.OPENAI_LLM_API_KEY = openaiLlm;
		if (openaiBase === undefined) delete process.env.OPENAI_LLM_BASE_URL;
		else process.env.OPENAI_LLM_BASE_URL = openaiBase;
		if (openaiModel === undefined) delete process.env.OPENAI_LLM_MODEL;
		else process.env.OPENAI_LLM_MODEL = openaiModel;
	}
});
