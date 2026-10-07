import type { TranscriptSegment, TranslationSegment } from "@/localization/schemas";
import { loadDubbingTiming } from "@/localization/timing";
import { getOpenAILLMApiKey, getOpenAILLMBaseUrl, getOpenAILLMModel } from "@/providers/openai-compatible";
import { decodeTranslationRows, translateInBatches, translationPrompt, TranslationResponseError } from "./batched-translation";
import { TranslationCooldownError } from "./free-translate";
export { FreeTranslateLLMProvider } from "./free-translate";

export interface LLMProvider {
	readonly name: string;
	translateAndRewrite(segments: TranscriptSegment[]): Promise<TranslationSegment[]>;
}

interface ProviderOptions {
	apiKey?: string;
	fetchImpl?: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>;
	cacheDirectory?: string | false;
}

async function checkResponse({ response, provider }: { response: Response; provider: string }) {
	if (response.ok) return;
	const header = response.headers.get("Retry-After");
	const seconds = header?.trim() ? Number(header) : NaN;
	const retryAfter = Number.isFinite(seconds) ? Math.max(0, seconds * 1000)
		: Math.max(0, Date.parse(header ?? "") - Date.now()) || 0;
	await response.body?.cancel();
	if (response.status === 429 || response.status === 503 || retryAfter > 0) {
		const policy = await loadDubbingTiming();
		throw new TranslationCooldownError({ status: response.status === 429 ? 429 : 503, retryAfterMs: policy.translation_cooldown_ms(retryAfter) });
	}
	throw new Error(`${provider} dịch lời thoại trả HTTP ${response.status}. Kiểm tra cấu hình dịch vụ LLM.`);
}

export class GeminiLLMProvider implements LLMProvider {
	readonly name = "gemini";
	private readonly apiKey: string;
	private readonly options: ProviderOptions;
	constructor(config?: string | ProviderOptions) {
		this.options = typeof config === "string" ? { apiKey: config } : config ?? {};
		this.apiKey = (this.options.apiKey || process.env.GEMINI_API_KEY || "").trim();
	}

	async translateAndRewrite(segments: TranscriptSegment[]): Promise<TranslationSegment[]> {
		if (!this.apiKey) throw new Error("GEMINI_API_KEY is not configured.");
		const policy = await loadDubbingTiming();
		return translateInBatches({
			segments, namespace: "gemini-2.5-flash", cacheDirectory: this.options.cacheDirectory,
			request: async ({ inputs, context }) => {
				const response = await (this.options.fetchImpl ?? fetch)(
					"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
					{
						method: "POST",
						headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
						body: JSON.stringify({
							contents: [{ parts: [{ text: await translationPrompt({ inputs, context }) }] }],
							generationConfig: { responseMimeType: "application/json", maxOutputTokens: policy.translation_llm_output_tokens(), thinkingConfig: { thinkingBudget: 0 } },
						}),
						signal: AbortSignal.timeout(90_000),
					},
				);
				await checkResponse({ response, provider: "Gemini" });
				let data;
				try { data = await response.json(); }
				catch { throw new TranslationResponseError("Gemini trả phản hồi JSON không hợp lệ."); }
				const raw = data.candidates?.[0]?.content?.parts?.filter((part: { thought?: boolean }) => !part.thought)
					.map((part: { text?: string }) => part.text ?? "").join("");
				return decodeTranslationRows(raw);
			},
		});
	}
}

export class OpenAILLMProvider implements LLMProvider {
	readonly name = "openai";
	private readonly apiKey: string;
	private readonly options: ProviderOptions;
	constructor(config?: string | ProviderOptions) {
		this.options = typeof config === "string" ? { apiKey: config } : config ?? {};
		this.apiKey = (this.options.apiKey || getOpenAILLMApiKey()).trim();
	}

	async translateAndRewrite(segments: TranscriptSegment[]): Promise<TranslationSegment[]> {
		if (!this.apiKey) throw new Error("Configure OPENAI_LLM_API_KEY or OPENAI_API_KEY for translation.");
		const policy = await loadDubbingTiming();
		const model = getOpenAILLMModel();
		return translateInBatches({
			segments, namespace: `openai:${getOpenAILLMBaseUrl()}:${model}`, cacheDirectory: this.options.cacheDirectory,
			request: async ({ inputs, context }) => {
				const response = await (this.options.fetchImpl ?? fetch)(`${getOpenAILLMBaseUrl()}/chat/completions`, {
					method: "POST",
					headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
					body: JSON.stringify({
						model,
						messages: [{ role: "user", content: await translationPrompt({ inputs, context }) }],
						response_format: { type: "json_object" },
						...(/^(gpt-5|o[134])/.test(model)
							? { max_completion_tokens: policy.translation_llm_output_tokens() }
							: { max_tokens: policy.translation_llm_output_tokens() }),
					}),
					signal: AbortSignal.timeout(90_000),
				});
				await checkResponse({ response, provider: "OpenAI-compatible LLM" });
				let data;
				try { data = await response.json(); }
				catch { throw new TranslationResponseError("LLM trả phản hồi JSON không hợp lệ."); }
				return decodeTranslationRows(data.choices?.[0]?.message?.content);
			},
		});
	}
}
