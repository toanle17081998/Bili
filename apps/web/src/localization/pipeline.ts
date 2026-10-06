import path from "path";
import fs from "fs/promises";
import { FFmpegService } from "@/media/ffmpeg";
import type { TranscriptionProvider } from "@/providers/transcription";
import { GeminiTranscriptionProvider, WhisperTranscriptionProvider } from "@/providers/transcription";
import type { LLMProvider } from "@/providers/llm";
import { GeminiLLMProvider, OpenAILLMProvider } from "@/providers/llm";
import type { TTSProvider } from "@/providers/tts/edge-tts";
import { EdgeTTSProvider } from "@/providers/tts/edge-tts";
import {
	LocalizedVideoProjectSchema,
	type LocalizedVideoProject,
	type TranscriptSegment,
	type TranslationSegment,
	type VoiceSegment,
	type SubtitleSegment,
} from "./schemas";

export interface LocalizationOptions {
	projectId: string;
	videoPath: string;
	workDir: string;
	voice?: string;
	onProgress?: (step: string, percent: number) => void;
}

export class LocalizationPipeline {
	private transcriptionProvider: TranscriptionProvider;
	private llmProvider: LLMProvider;
	private ttsProvider: TTSProvider;

	constructor({
		transcriptionProvider,
		llmProvider,
		ttsProvider,
	}: {
		transcriptionProvider?: TranscriptionProvider;
		llmProvider?: LLMProvider;
		ttsProvider?: TTSProvider;
	} = {}) {
		// Auto-select based on available environment
		if (transcriptionProvider) {
			this.transcriptionProvider = transcriptionProvider;
		} else if (process.env.GEMINI_API_KEY) {
			this.transcriptionProvider = new GeminiTranscriptionProvider();
		} else if (process.env.OPENAI_API_KEY) {
			this.transcriptionProvider = new WhisperTranscriptionProvider();
		} else {
			// Mock fallback for testing offline
			this.transcriptionProvider = {
				name: "mock",
				transcribe: async () => [
					{ start: 0, end: 3.5, text: "今天带大家去吃一家超好吃的街头美食！" },
					{ start: 3.8, end: 7.2, text: "这里的老板做了三十年，味道真的一绝。" },
				],
			};
		}

		if (llmProvider) {
			this.llmProvider = llmProvider;
		} else if (process.env.GEMINI_API_KEY) {
			this.llmProvider = new GeminiLLMProvider();
		} else if (process.env.OPENAI_API_KEY) {
			this.llmProvider = new OpenAILLMProvider();
		} else {
			this.llmProvider = {
				name: "mock",
				translateAndRewrite: async (segs) => [
					{
						sourceStart: 0,
						sourceEnd: 3.5,
						sourceText: segs[0]?.text || "",
						vietnameseText: "Hôm nay mình sẽ dẫn mọi người đi ăn một quán ăn đường phố siêu đỉnh!",
						targetDuration: 3.5,
					},
					{
						sourceStart: 3.8,
						sourceEnd: 7.2,
						sourceText: segs[1]?.text || "",
						vietnameseText: "Bác chủ quán ở đây đã bán được ba mươi năm rồi, hương vị ngon tuyệt đỉnh luôn.",
						targetDuration: 3.4,
					},
				],
			};
		}

		this.ttsProvider = ttsProvider || new EdgeTTSProvider();
	}

	async run({
		projectId,
		videoPath,
		workDir,
		voice = "vi-VN-HoaiMyNeural",
		onProgress,
	}: LocalizationOptions): Promise<LocalizedVideoProject> {
		const outDir = path.join(workDir, projectId);
		await fs.mkdir(outDir, { recursive: true });

		// 1. Probe source video
		onProgress?.("Đang kiểm tra thông số video", 10);
		const probe = await FFmpegService.probeVideo(videoPath);

		// 2. Extract Audio
		onProgress?.("Trích xuất âm thanh gốc...", 20);
		const audioPath = path.join(outDir, "source_audio.mp3");
		await FFmpegService.extractAudio(videoPath, audioPath);

		// 3. Speech to text
		onProgress?.("Nhận diện giọng nói (Speech-to-Text)...", 40);
		const transcript: TranscriptSegment[] =
			await this.transcriptionProvider.transcribe(audioPath);

		// 4. Translate & Spoken Vietnamese Rewrite
		onProgress?.("Chuyển ngữ & biên kịch tiếng Việt tự nhiên...", 60);
		const translations: TranslationSegment[] =
			await this.llmProvider.translateAndRewrite(transcript);

		// 5. Generate Vietnamese TTS for each translation segment
		onProgress?.("Tạo giọng đọc thuyết minh tiếng Việt...", 80);
		const voiceovers: VoiceSegment[] = [];
		const subtitles: SubtitleSegment[] = [];

		for (let i = 0; i < translations.length; i++) {
			const item = translations[i];
			const ttsOut = path.join(outDir, `voice_${i}.mp3`);

			// Calculate speed if required to fit duration
			const res = await this.ttsProvider.generateSpeech({
				text: item.vietnameseText,
				voice,
				outputPath: ttsOut,
			});

			const voiceSeg: VoiceSegment = {
				id: `voice-${i}`,
				start: item.sourceStart,
				end: item.sourceStart + res.duration,
				duration: res.duration,
				audioUrl: `/api/media/stream?file=${encodeURIComponent(ttsOut)}`,
				text: item.vietnameseText,
			};
			voiceovers.push(voiceSeg);

			const subSeg: SubtitleSegment = {
				id: `sub-${i}`,
				start: item.sourceStart,
				end: item.sourceEnd,
				text: item.vietnameseText,
				style: {
					theme: "bold",
					verticalAlign: "bottom",
				},
			};
			subtitles.push(subSeg);
		}

		onProgress?.("Chuẩn bị hoàn tất timeline...", 100);

		const result: LocalizedVideoProject = {
			id: projectId,
			source: {
				provider: "bilibili",
				id: projectId,
				url: "",
				path: videoPath,
				duration: probe.duration,
			},
			format: {
				width: 1080,
				height: 1920,
				fps: probe.fps || 30,
			},
			transcript,
			translations,
			voiceovers,
			subtitles,
		};

		// Validate with Zod before returning
		return LocalizedVideoProjectSchema.parse(result);
	}
}
