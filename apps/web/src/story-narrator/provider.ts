import { setTimeout as delay } from "node:timers/promises";
import {
	getOpenAILLMApiKey,
	getOpenAILLMBaseUrl,
	getOpenAILLMModel,
} from "@/providers/openai-compatible";
import { storyEngine } from "./engine";
import type { StoryDefaults } from "./types";

export interface StoryMedia {
	mimeType: string;
	data: string;
	time?: number;
}
type StoryFetch = (
	...args: Parameters<typeof fetch>
) => ReturnType<typeof fetch>;
export interface StoryAIProvider {
	readonly cacheIdentity: string;
	readonly supportsVideoAudio: boolean;
	request(input: {
		stage: string;
		context: unknown;
		media?: StoryMedia[];
		signal: AbortSignal;
	}): Promise<unknown>;
}

/** Reuses the app's Gemini / OpenAI-compatible credentials, without another SDK. */
export class ConfiguredStoryProvider implements StoryAIProvider {
	readonly supportsVideoAudio = Boolean(process.env.GEMINI_API_KEY?.trim());
	readonly cacheIdentity = this.supportsVideoAudio
		? `gemini:${process.env.STORY_GEMINI_MODEL || "gemini-2.5-flash"}:video-audio-v1`
		: `${getOpenAILLMBaseUrl()}:${getOpenAILLMModel()}:frames-v1`;
	constructor(private readonly fetchImpl: StoryFetch = fetch) {}

	async request({
		stage,
		context,
		media = [],
		signal,
	}: Parameters<StoryAIProvider["request"]>[0]) {
		const key = this.supportsVideoAudio
			? process.env.GEMINI_API_KEY?.trim()
			: getOpenAILLMApiKey();
		if (!key)
			throw new Error(
				"Cấu hình GEMINI_API_KEY hoặc OPENAI_LLM_API_KEY và model hỗ trợ hình ảnh trước khi phân tích.",
			);
		const prompt = await storyEngine<string>({
			operation: "prompt",
			stage,
			context,
		});
		const model = getOpenAILLMModel();
		const defaults = await storyEngine<StoryDefaults>({
			operation: "defaults",
		});
		const body = this.supportsVideoAudio
			? {
					contents: [
						{
							parts: [
								{ text: prompt },
								...media.flatMap((item) => [
									{
										text:
											item.time === undefined
												? "Clip có offset và thời lượng trong window của JSON."
												: `Frame tại ${item.time.toFixed(3)} giây.`,
									},
									{ inlineData: { mimeType: item.mimeType, data: item.data } },
								]),
							],
						},
					],
					generationConfig: {
						responseMimeType: "application/json",
						maxOutputTokens: defaults.limits.ai_output_tokens,
						thinkingConfig: { thinkingBudget: 1024 },
					},
				}
			: {
					model,
					messages: [
						{
							role: "user",
							content: [
								{ type: "text", text: prompt },
								...media.flatMap((item) => [
									{
										type: "text",
										text: `Frame tại ${item.time?.toFixed(3)} giây.`,
									},
									{
										type: "image_url",
										image_url: {
											url: `data:${item.mimeType};base64,${item.data}`,
											detail: "low",
										},
									},
								]),
							],
						},
					],
					response_format: { type: "json_object" },
					...(/^(gpt-[5-9]|o[1-9])/.test(model)
						? { max_completion_tokens: defaults.limits.ai_output_tokens }
						: { max_tokens: defaults.limits.ai_output_tokens }),
				};
		const timeout = AbortSignal.any([
			signal,
			AbortSignal.timeout(defaults.limits.stage_timeout_ms),
		]);
		for (let attempt = 0; ; attempt++) {
			timeout.throwIfAborted();
			let response: Response;
			try {
				response = await this.fetchImpl(
					this.supportsVideoAudio
						? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(process.env.STORY_GEMINI_MODEL || "gemini-2.5-flash")}:generateContent`
						: `${getOpenAILLMBaseUrl()}/chat/completions`,
					{
						method: "POST",
						signal: timeout,
						headers: this.supportsVideoAudio
							? { "Content-Type": "application/json", "x-goog-api-key": key }
							: {
									"Content-Type": "application/json",
									Authorization: `Bearer ${key}`,
								},
						body: JSON.stringify(body),
					},
				);
			} catch (error) {
				if (timeout.aborted || attempt >= defaults.limits.max_retries)
					throw error;
				await delay(1000 * 2 ** attempt, undefined, { signal: timeout });
				continue;
			}
			if (!response.ok) {
				await response.body?.cancel();
				const retry = response.headers.get("retry-after");
				const wait = retry
					? /^\d+(\.\d+)?$/.test(retry)
						? Number(retry) * 1000
						: Date.parse(retry) - Date.now()
					: 1000 * 2 ** attempt;
				if (
					[429, 500, 502, 503, 504].includes(response.status) &&
					attempt < defaults.limits.max_retries &&
					Number.isFinite(wait) &&
					wait <= 30000
				) {
					await delay(Math.max(1000, wait), undefined, { signal: timeout });
					continue;
				}
				throw new Error(
					`Dịch vụ Story AI trả HTTP ${response.status}. ${response.status === 401 || response.status === 403 ? "Kiểm tra key và quyền model." : "Thử lại để tiếp tục từ bước đã lưu."}`,
				);
			}
			const data = await response.json();
			const raw = this.supportsVideoAudio
				? data.candidates?.[0]?.content?.parts
						?.filter((part: { thought?: boolean }) => !part.thought)
						.map((part: { text?: string }) => part.text || "")
						.join("")
				: data.choices?.[0]?.message?.content;
			if (typeof raw !== "string")
				throw new Error(
					"AI chưa trả JSON; kết quả hoàn tất trước đó đã được lưu.",
				);
			try {
				return JSON.parse(
					raw
						.trim()
						.replace(/^```(?:json)?\s*/i, "")
						.replace(/\s*```$/, ""),
				);
			} catch {
				throw new Error(
					"AI trả JSON không hợp lệ; thử lại để tiếp tục từ bước đã lưu.",
				);
			}
		}
	}
}
