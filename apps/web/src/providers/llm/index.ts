import type { TranscriptSegment, TranslationSegment } from "@/localization/schemas";

export interface LLMProvider {
	readonly name: string;
	translateAndRewrite(
		segments: TranscriptSegment[],
	): Promise<TranslationSegment[]>;
}

export class GeminiLLMProvider implements LLMProvider {
	readonly name = "gemini";
	private apiKey: string;

	constructor(apiKey?: string) {
		this.apiKey = apiKey || process.env.GEMINI_API_KEY || "";
	}

	async translateAndRewrite(
		segments: TranscriptSegment[],
	): Promise<TranslationSegment[]> {
		if (!this.apiKey) {
			throw new Error("GEMINI_API_KEY is not configured.");
		}

		const prompt = `
Bạn là một chuyên gia biên kịch video và chuyển ngữ video ngắn (Shorts / Reels / TikTok) sang tiếng Việt.
Nhiệm vụ của bạn:
1. Đọc kịch bản gốc từng đoạn có kèm thời lượng (start, end, text).
2. Hiểu trọn vẹn ngữ cảnh và dịch/viết lại sang TIẾNG VIỆT TỰ NHIÊN, giọng nói cuốn hút, ngắn gọn, dễ nghe như người thuyết minh bản xứ.
3. QUAN TRỌNG: Độ dài câu thuyết minh tiếng Việt phải phù hợp với thời lượng targetDuration = end - start. Không dùng từ rườm rà.
4. Trả về đúng định dạng JSON Array chứa các object:
[
  {
    "sourceStart": number,
    "sourceEnd": number,
    "sourceText": string,
    "vietnameseText": string,
    "targetDuration": number
  }
]

Dưới đây là các đoạn cần chuyển ngữ:
${JSON.stringify(
	segments.map((s) => ({
		sourceStart: s.start,
		sourceEnd: s.end,
		sourceText: s.text,
		targetDuration: Number((s.end - s.start).toFixed(2)),
	})),
	null,
	2,
)}
`;

		const response = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					contents: [{ parts: [{ text: prompt }] }],
					generationConfig: { responseMimeType: "application/json" },
				}),
			},
		);

		if (!response.ok) {
			const err = await response.text();
			throw new Error(`Gemini API error (${response.status}): ${err}`);
		}

		const data = await response.json();
		const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
		if (!rawText) throw new Error("Empty response from Gemini");

		const parsed: TranslationSegment[] = JSON.parse(rawText);
		return parsed;
	}
}

export class OpenAILLMProvider implements LLMProvider {
	readonly name = "openai";
	private apiKey: string;

	constructor(apiKey?: string) {
		this.apiKey = apiKey || process.env.OPENAI_API_KEY || "";
	}

	async translateAndRewrite(
		segments: TranscriptSegment[],
	): Promise<TranslationSegment[]> {
		if (!this.apiKey) {
			throw new Error("OPENAI_API_KEY is not configured.");
		}

		const prompt = `
Bạn là chuyên gia chuyển ngữ video sang tiếng Việt tự nhiên (Shorts/TikTok).
Chuyển đổi từng đoạn transcript sau sang lời thuyết minh tiếng Việt súc tích, tự nhiên, khớp thời lượng targetDuration:
${JSON.stringify(
	segments.map((s) => ({
		sourceStart: s.start,
		sourceEnd: s.end,
		sourceText: s.text,
		targetDuration: Number((s.end - s.start).toFixed(2)),
	})),
	null,
	2,
)}

Trả về duy nhất JSON array dạng:
[
  {
    "sourceStart": number,
    "sourceEnd": number,
    "sourceText": string,
    "vietnameseText": string,
    "targetDuration": number
  }
]
`;

		const response = await fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify({
				model: "gpt-4o-mini",
				messages: [{ role: "user", content: prompt }],
				response_format: { type: "json_object" },
			}),
		});

		if (!response.ok) {
			const err = await response.text();
			throw new Error(`OpenAI API error (${response.status}): ${err}`);
		}

		const data = await response.json();
		const raw = data.choices?.[0]?.message?.content;
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : parsed.segments || [];
	}
}
