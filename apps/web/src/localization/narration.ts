import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { FFmpegService } from "@/media/ffmpeg";
import {
	getOpenAILLMApiKey,
	getOpenAILLMBaseUrl,
	getOpenAILLMModel,
} from "@/providers/openai-compatible";
import { loadDubbingTiming } from "./timing";
import type { SubtitleSegment } from "./schemas";

const scriptSchema = z.object({
	segments: z.array(
		z.object({
			start: z.number().nonnegative(),
			end: z.number().nonnegative(),
			text: z.string().trim().min(1).max(2000),
		}),
	),
});

const analysisSchema = z.object({
	throughline: z.string().trim().max(2000),
	tone: z.string().trim().max(1000),
	beats: z.array(z.object({
		frameIndex: z.number().int().nonnegative(),
		observation: z.string().trim().min(1).max(2000),
		storyRole: z.string().trim().min(1).max(1000),
	})).max(100),
	uncertainties: z.array(z.string().trim().min(1).max(1000)).max(100),
});

type NarrationFrame = { time: number; data: string };
type NarrationFetch = (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>;

export class NarrationError extends Error {
	// eslint-disable-next-line opencut/prefer-object-params -- Preserve the Error-style message constructor.
	constructor(
		message: string,
		readonly status = 422,
	) {
		super(message);
	}
}

export function hasNarrationAIConfig() {
	return Boolean(process.env.GEMINI_API_KEY?.trim() || getOpenAILLMApiKey());
}

async function requestNarrationJSON({
	prompt,
	frames = [],
	outputTokens,
	signal,
	fetchImpl,
}: {
	prompt: string;
	frames?: NarrationFrame[];
	outputTokens: number;
	signal: AbortSignal;
	fetchImpl: NarrationFetch;
}): Promise<unknown> {
	const geminiKey = process.env.GEMINI_API_KEY?.trim();
	const model = getOpenAILLMModel();
	const response = await fetchImpl(
		geminiKey
			? "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
			: `${getOpenAILLMBaseUrl()}/chat/completions`,
		{
			method: "POST",
			headers: geminiKey
				? { "Content-Type": "application/json", "x-goog-api-key": geminiKey }
				: { "Content-Type": "application/json", Authorization: `Bearer ${getOpenAILLMApiKey()}` },
			body: JSON.stringify(geminiKey ? {
				contents: [{ parts: [
					{ text: prompt },
					...frames.flatMap((frame, frameIndex) => [
						{ text: `frameIndex ${frameIndex}, thời điểm ${frame.time.toFixed(3)} giây` },
						{ inlineData: { mimeType: "image/jpeg", data: frame.data } },
					]),
				] }],
				generationConfig: {
					responseMimeType: "application/json",
					maxOutputTokens: outputTokens,
					thinkingConfig: { thinkingBudget: 1024 },
				},
			} : {
				model,
				messages: [{ role: "user", content: [
					{ type: "text", text: prompt },
					...frames.flatMap((frame, frameIndex) => [
						{ type: "text", text: `frameIndex ${frameIndex}, thời điểm ${frame.time.toFixed(3)} giây` },
						{ type: "image_url", image_url: { url: `data:image/jpeg;base64,${frame.data}`, detail: "low" } },
					]),
				] }],
				response_format: { type: "json_object" },
				...(/^(gpt-5|o[134])/.test(model)
					? { max_completion_tokens: outputTokens }
					: { max_tokens: outputTokens }),
			}),
			signal,
		},
	);
	if (!response.ok) {
		await response.body?.cancel();
		throw new NarrationError(
			`AI thuyết minh trả lỗi HTTP ${response.status}. Kiểm tra API key, model hỗ trợ hình ảnh hoặc thử lại sau.`,
			response.status === 429 ? 429 : 502,
		);
	}
	const data = await response.json();
	const raw = geminiKey
		? data.candidates?.[0]?.content?.parts
				?.filter((part: { thought?: boolean }) => !part.thought)
				.map((part: { text?: string }) => part.text ?? "")
				.join("")
		: data.choices?.[0]?.message?.content;
	try {
		return JSON.parse(raw);
	} catch {
		throw new NarrationError("AI trả nội dung không đúng định dạng. Vui lòng tạo lại.");
	}
}

export async function validateNarrationScript(
	{ segments, duration }: { segments: SubtitleSegment[]; duration: number },
) {
	const policy = await loadDubbingTiming();
	if (!segments.length || segments.length > policy.narration_max_segments())
		throw new NarrationError(
			"Kịch bản trống hoặc có quá nhiều đoạn. Vui lòng tạo lại.",
		);
	let previousEnd = 0;
	let totalBytes = 0;
	for (const [index, segment] of segments.entries()) {
		if (!policy.narration_valid_text_bytes(totalBytes, segment.text.length))
			throw new NarrationError(
				"Kịch bản vượt quá giới hạn nội dung. Rút gọn lời thuyết minh.",
			);
		const bytes = new TextEncoder().encode(segment.text);
		if (!policy.narration_valid_text_bytes(totalBytes, bytes.length))
			throw new NarrationError(
				"Kịch bản vượt quá giới hạn nội dung. Rút gọn lời thuyết minh.",
			);
		totalBytes += bytes.length;
		const pointer = policy.speech_alloc(bytes.length);
		let words: number;
		try {
			new Uint8Array(policy.memory.buffer, pointer, bytes.length).set(bytes);
			words = policy.narration_word_count(pointer, bytes.length);
		} finally {
			policy.speech_free(pointer, bytes.length);
		}
		if (
			!policy.narration_valid_segment(
				previousEnd,
				segment.start,
				segment.end,
				duration,
				words,
			)
		)
			throw new NarrationError(
				`Đoạn ${index + 1} có thời gian không hợp lệ, chồng lấn hoặc lời quá dài. Rút gọn lời và kiểm tra mốc thời gian.`,
			);
		previousEnd = segment.end;
	}
}

export async function generateNarrationPreview({
	videoPath,
	workDir,
	notes = "",
	signal,
	fetchImpl = fetch,
	duration: sourceDuration,
}: {
	videoPath: string;
	workDir: string;
	notes?: string;
	signal?: AbortSignal;
	fetchImpl?: NarrationFetch;
	duration?: number;
}): Promise<{ subtitles: SubtitleSegment[]; duration: number }> {
	if (!hasNarrationAIConfig())
		throw new NarrationError(
			"Cần cấu hình GEMINI_API_KEY hoặc OPENAI_LLM_API_KEY và model hỗ trợ hình ảnh để tạo thuyết minh AI.",
			503,
		);
	const policy = await loadDubbingTiming();
	const sourceProbe = await FFmpegService.probeVideo({
		filePath: videoPath,
		signal,
	});
	const probe = {
		...sourceProbe,
		duration: sourceDuration ?? sourceProbe.duration,
	};
	const count = policy.narration_frame_count(probe.duration);
	if (!count)
		throw new NarrationError(
			`Video phải có thời lượng không quá ${policy.narration_max_duration() / 60} phút.`,
		);
	await fs.mkdir(workDir, { recursive: true });
	const directory = await fs.mkdtemp(path.join(workDir, "narration-frames-"));
	const requestSignal = signal
		? AbortSignal.any([signal, AbortSignal.timeout(180_000)])
		: AbortSignal.timeout(180_000);
	try {
		const frames: NarrationFrame[] = [];
		for (let index = 0; index < count; index++) {
			const time = policy.narration_frame_time(probe.duration, index);
			const imagePath = path.join(directory, `${index}.jpg`);
			await FFmpegService.runCommand(
				"ffmpeg",
				[
					"-y",
					"-ss",
					String(time),
					"-i",
					videoPath,
					"-frames:v",
					"1",
					"-vf",
					`scale=${policy.narration_proxy_size()}:${policy.narration_proxy_size()}:force_original_aspect_ratio=decrease`,
					"-q:v",
					"4",
					imagePath,
				],
				{ signal: requestSignal },
			);
			frames.push({
				time,
				data: (await fs.readFile(imagePath)).toString("base64"),
			});
		}
		const readPrompt = ({ pointer, length }: { pointer: number; length: number }) => new TextDecoder().decode(
			new Uint8Array(policy.memory.buffer, pointer, length),
		);
		const options = { outputTokens: policy.narration_output_tokens(probe.duration), signal: requestSignal, fetchImpl };
		const context = { duration: probe.duration, notes };
		const analysis = analysisSchema.safeParse(await requestNarrationJSON({
			...options,
			frames,
			prompt: readPrompt({ pointer: policy.narration_analysis_prompt_ptr(), length: policy.narration_analysis_prompt_len() }) + JSON.stringify(context),
		}));
		if (!analysis.success || analysis.data.beats.some((beat) => !frames[beat.frameIndex]))
			throw new NarrationError("AI trả phân tích mạch kể không hợp lệ. Vui lòng tạo lại.");
		if (!analysis.data.beats.length)
			throw new NarrationError("Hình ảnh chưa đủ rõ để AI viết thuyết minh có căn cứ. Thử video khác hoặc bổ sung ngữ cảnh.");
		const story = {
			...analysis.data,
			beats: analysis.data.beats.map((beat) => ({ ...beat, time: frames[beat.frameIndex].time })),
		};
		const parsed = scriptSchema.safeParse(await requestNarrationJSON({
			...options,
			prompt: readPrompt({ pointer: policy.narration_prompt_ptr(), length: policy.narration_prompt_len() }) + JSON.stringify({ ...context, story }),
		}));
		if (!parsed.success)
			throw new NarrationError(
				"AI trả kịch bản không hợp lệ. Vui lòng tạo lại.",
			);
		if (!parsed.data.segments.length)
			throw new NarrationError(
				"Hình ảnh chưa đủ rõ để AI viết thuyết minh có căn cứ. Thử video khác hoặc bổ sung ngữ cảnh.",
			);
		const subtitles = parsed.data.segments.map((segment, index) => ({
			...segment,
			id: `narration-${index}`,
		}));
		await validateNarrationScript({ segments: subtitles, duration: probe.duration });
		return { subtitles, duration: probe.duration };
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
}
