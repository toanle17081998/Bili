import type { TranscriptSegment } from "@/localization/schemas";
import fs from "fs/promises";
export { FasterWhisperTranscriptionProvider } from "./faster-whisper";

export interface TranscriptionProvider {
	readonly name: string;
	transcribe(audioPath: string): Promise<TranscriptSegment[]>;
}

export class GeminiTranscriptionProvider implements TranscriptionProvider {
	readonly name = "gemini";
	private apiKey: string;

	constructor(apiKey?: string) {
		this.apiKey = apiKey || process.env.GEMINI_API_KEY || "";
	}

	async transcribe(audioPath: string): Promise<TranscriptSegment[]> {
		if (!this.apiKey) {
			throw new Error("GEMINI_API_KEY is not configured.");
		}

		const audioBuffer = await fs.readFile(audioPath);
		const base64Audio = audioBuffer.toString("base64");

		const prompt = `
Hãy nghe file âm thanh này và tạo transcript tiếng Trung/gốc chính xác từng mốc thời gian (start, end tính bằng giây).
Trả về JSON array duy nhất với cấu trúc:
[
  { "start": 0.0, "end": 3.5, "text": "..." }
]
`;

		const response = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					contents: [
						{
							parts: [
								{ text: prompt },
								{
									inlineData: {
										mimeType: "audio/mp3",
										data: base64Audio,
									},
								},
							],
						},
					],
					generationConfig: { responseMimeType: "application/json" },
				}),
			},
		);

		if (!response.ok) {
			const err = await response.text();
			throw new Error(`Gemini transcription error: ${err}`);
		}

		const data = await response.json();
		const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
		return JSON.parse(rawText);
	}
}

export class WhisperTranscriptionProvider implements TranscriptionProvider {
	readonly name = "whisper";
	private apiKey: string;

	constructor(apiKey?: string) {
		this.apiKey = apiKey || process.env.OPENAI_API_KEY || "";
	}

	async transcribe(audioPath: string): Promise<TranscriptSegment[]> {
		if (!this.apiKey) {
			throw new Error("OPENAI_API_KEY is not configured.");
		}

		const fileBuffer = await fs.readFile(audioPath);
		const blob = new Blob([fileBuffer]);
		const formData = new FormData();
		formData.append("file", blob, "audio.mp3");
		formData.append("model", "whisper-1");
		formData.append("response_format", "verbose_json");

		const response = await fetch(
			"https://api.openai.com/v1/audio/transcriptions",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: formData,
			},
		);

		if (!response.ok) {
			const err = await response.text();
			throw new Error(`Whisper transcription error: ${err}`);
		}

		const data = await response.json();
		return (data.segments || []).map((s: any) => ({
			start: s.start,
			end: s.end,
			text: s.text.trim(),
		}));
	}
}
