import path from "path";
import fs from "fs/promises";
import { randomUUID } from "node:crypto";
import { FFmpegService } from "@/media/ffmpeg";
import type { TranscriptionProvider } from "@/providers/transcription";
import {
	GeminiTranscriptionProvider,
	WhisperTranscriptionProvider,
	FasterWhisperTranscriptionProvider,
} from "@/providers/transcription";
import type { LLMProvider } from "@/providers/llm";
import {
	GeminiLLMProvider,
	OpenAILLMProvider,
	FreeTranslateLLMProvider,
} from "@/providers/llm";
import type { TTSProvider } from "@/providers/tts/edge-tts";
import { EdgeTTSProvider } from "@/providers/tts/edge-tts";
import { separateVocals } from "@/media/vocal-separation";
import { loadDubbingTiming } from "./timing";
import { splitIntoShortSubtitles } from "./split";
import {
	LocalizedVideoProjectSchema,
	TranscriptSegmentSchema,
	TranslationSegmentSchema,
	SubtitleSegmentSchema,
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
	customSubtitles?: SubtitleSegment[];
	onProgress?: (step: string, percent: number) => void;
}

export class LocalizationPipeline {
	private transcriptionProvider: TranscriptionProvider;
	private llmProvider: LLMProvider;
	private ttsProvider: TTSProvider;
	private vocalSeparator: typeof separateVocals;

	constructor({
		transcriptionProvider,
		llmProvider,
		ttsProvider,
		vocalSeparator = separateVocals,
	}: {
		transcriptionProvider?: TranscriptionProvider;
		llmProvider?: LLMProvider;
		ttsProvider?: TTSProvider;
		vocalSeparator?: typeof separateVocals;
	} = {}) {
		// Auto-select STT provider
		if (transcriptionProvider) {
			this.transcriptionProvider = transcriptionProvider;
		} else if (process.env.GEMINI_API_KEY) {
			this.transcriptionProvider = new GeminiTranscriptionProvider();
		} else if (process.env.OPENAI_API_KEY) {
			this.transcriptionProvider = new WhisperTranscriptionProvider();
		} else {
			this.transcriptionProvider = new FasterWhisperTranscriptionProvider();
		}

		// Auto-select LLM/Translation provider
		if (llmProvider) {
			this.llmProvider = llmProvider;
		} else if (process.env.GEMINI_API_KEY) {
			this.llmProvider = new GeminiLLMProvider();
		} else if (process.env.OPENAI_API_KEY) {
			this.llmProvider = new OpenAILLMProvider();
		} else {
			this.llmProvider = new FreeTranslateLLMProvider();
		}

		this.ttsProvider = ttsProvider || new EdgeTTSProvider();
		this.vocalSeparator = vocalSeparator;
	}

	private async extractOrSeparateAudio(videoPath: string, outDir: string): Promise<{ vocals: string; background: string }> {
		return this.vocalSeparator(videoPath, outDir);
	}

	private async getTranscript(
		projectId: string,
		videoPath: string,
		audioPath: string,
		onProgress?: (step: string, percent: number) => void,
	): Promise<TranscriptSegment[]> {
		onProgress?.("Nhận diện giọng nói từ âm thanh...", 40);
		const recognized = TranscriptSegmentSchema.array().parse(await this.transcriptionProvider.transcribe(audioPath));
		const timing = await loadDubbingTiming();
		const transcript: TranscriptSegment[] = [];
		for (const segment of recognized) {
			const previous = transcript.at(-1);
			if (previous && timing.dubbing_merge(previous.start, previous.end, segment.start, segment.end)) {
				previous.end = segment.end;
				previous.text += ` ${segment.text}`;
			} else transcript.push({ ...segment });
		}
		if (!transcript.length) throw new Error("No speech detected in the source video. No dubbing was generated.");

		return transcript;
	}

	async generatePreview({
		projectId,
		videoPath,
		workDir,
		onProgress,
	}: {
		projectId: string;
		videoPath: string;
		workDir: string;
		onProgress?: (step: string, percent: number) => void;
	}): Promise<{
		transcript: TranscriptSegment[];
		translations: TranslationSegment[];
		subtitles: SubtitleSegment[];
	}> {
		const outDir = path.join(workDir, projectId);
		await fs.mkdir(outDir, { recursive: true });

		onProgress?.("Trích xuất âm thanh gốc...", 20);
		const stems = await this.extractOrSeparateAudio(videoPath, outDir);

		let transcriptionAudio = stems.vocals;
		if (this.transcriptionProvider.name !== "faster-whisper") {
			transcriptionAudio = path.join(outDir, "transcription.mp3");
			await FFmpegService.extractAudio(stems.vocals, transcriptionAudio);
		}
		const transcript = await this.getTranscript(projectId, videoPath, transcriptionAudio, onProgress);

		onProgress?.("Chuyển ngữ & biên kịch tiếng Việt tự nhiên...", 60);
		const timing = await loadDubbingTiming();
		const probe = await FFmpegService.probeVideo(videoPath);
		const translated = TranslationSegmentSchema.array().parse(await this.llmProvider.translateAndRewrite(transcript));
		if (translated.length !== transcript.length) throw new Error("Translation lost source segments. Please retry.");
		const translations: TranslationSegment[] = translated.map((item, i) => {
			const source = transcript[i];
			if (item.sourceText.trim() !== source.text.trim() || !item.vietnameseText.trim())
				throw new Error(`Translation mapping mismatch at segment ${i + 1}. Please retry.`);
			const end = timing.dubbing_slot_end(source.start, source.end, transcript[i + 1]?.start ?? probe.duration, probe.duration);
			if (!Number.isFinite(end)) throw new Error(`Invalid source timing at segment ${i + 1}`);
			return { ...item, sourceStart: source.start, sourceEnd: end, sourceText: source.text, targetDuration: end - source.start };
		});

		onProgress?.("Tách phụ đề ngắn 1-2 dòng chuẩn TikTok / Reels...", 85);
		const subtitles: SubtitleSegment[] = [];
		let cueIdx = 0;

		for (const item of translations) {
			const cues = splitIntoShortSubtitles(
				item.vietnameseText,
				item.sourceStart,
				item.sourceEnd,
				{ maxCharsPerCue: 38, maxCharsPerLine: 22, minDuration: 0 },
			);

			if (cues.length === 0) {
				subtitles.push({
					id: `sub-${cueIdx++}`,
					start: item.sourceStart,
					end: item.sourceEnd,
					text: item.vietnameseText,
					style: {
						theme: "bold",
						verticalAlign: "bottom",
					},
				});
			} else {
				for (const cue of cues) {
					subtitles.push({
						id: `sub-${cueIdx++}`,
						start: cue.start,
						end: cue.end,
						text: cue.text,
						style: {
							theme: "bold",
							verticalAlign: "bottom",
						},
					});
				}
			}
		}

		return {
			transcript,
			translations,
			subtitles,
		};
	}

	async run({
		projectId,
		videoPath,
		workDir,
		voice = "vi-VN-HoaiMyNeural",
		customSubtitles,
		onProgress,
	}: LocalizationOptions): Promise<LocalizedVideoProject> {
		const outDir = path.join(workDir, projectId);
		await fs.mkdir(outDir, { recursive: true });
		const runDir = path.join(outDir, randomUUID());
		await fs.mkdir(runDir, { recursive: true });

		// 1. Probe source video
		onProgress?.("Đang kiểm tra thông số video", 10);
		const probe = await FFmpegService.probeVideo(videoPath);

		// 2. Extract or separate audio
		onProgress?.("Trích xuất âm thanh gốc...", 20);
		const stems = await this.extractOrSeparateAudio(videoPath, outDir);

		let transcript: TranscriptSegment[] = [];
		let translations: TranslationSegment[] = [];
		let subtitlesToProcess: SubtitleSegment[] = [];

		if (customSubtitles && customSubtitles.length > 0) {
			// User provided custom/reviewed subtitles
			subtitlesToProcess = SubtitleSegmentSchema.array().parse(customSubtitles);
			transcript = customSubtitles.map((s) => ({
				start: s.start,
				end: s.end,
				text: s.text.replace(/\n/g, " "),
			}));
			translations = customSubtitles.map((s) => ({
				sourceStart: s.start,
				sourceEnd: s.end,
				sourceText: s.text.replace(/\n/g, " "),
				vietnameseText: s.text.replace(/\n/g, " "),
				targetDuration: s.end - s.start,
			}));
		} else {
			// Auto preview & split
			const preview = await this.generatePreview({
				projectId,
				videoPath,
				workDir,
				onProgress,
			});
			transcript = preview.transcript;
			translations = preview.translations;
			subtitlesToProcess = preview.subtitles;
		}

		// 3. Generate Vietnamese TTS for each subtitle cue
		onProgress?.("Tạo giọng đọc thuyết minh tiếng Việt...", 70);
		const voiceovers: VoiceSegment[] = [];
		const subtitles: SubtitleSegment[] = subtitlesToProcess;
		const timing = await loadDubbingTiming();
		const speechSegments = translations.map((item) => ({ start: item.sourceStart, end: item.sourceEnd, text: item.vietnameseText }));
		for (let i = 0; i < speechSegments.length; i++) {
			const item = speechSegments[i];
			const end = timing.dubbing_slot_end(item.start, item.end, speechSegments[i + 1]?.start ?? probe.duration, probe.duration);
			if (!Number.isFinite(end)) throw new Error(`Invalid source timing at segment ${i + 1}`);
			const targetDuration = end - item.start;
			const spokenText = item.text.replace(/\n/g, " ").trim();
			if (!spokenText) continue;

			const ttsOut = path.join(runDir, `voice_${i}.mp3`);
			const fittedOut = path.join(runDir, `voice_${i}.wav`);
			const trimmedOut = path.join(runDir, `trimmed_${i}.wav`);

			const res = await this.ttsProvider.generateSpeech({
				text: spokenText,
				voice,
				outputPath: ttsOut,
			});

			await FFmpegService.runCommand("ffmpeg", ["-y", "-i", res.audioPath, "-af", "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse", "-c:a", "pcm_s16le", trimmedOut]);
			const trimmed = await FFmpegService.probeVideo(trimmedOut);
			const tempo = timing.dubbing_tempo(trimmed.duration, targetDuration);
			if (!Number.isFinite(tempo)) throw new Error(`Vietnamese segment ${i + 1} is too long for the source sentence. Shorten its translation.`);
			await FFmpegService.runCommand("ffmpeg", ["-y", "-i", trimmedOut, "-af", `atempo=${tempo},atrim=duration=${targetDuration}`, "-c:a", "pcm_s16le", fittedOut]);
			const fitted = await FFmpegService.probeVideo(fittedOut);
			const voiceSeg: VoiceSegment = {
				id: `voice-${i}`,
				start: item.start,
				end: item.start + fitted.duration,
				duration: fitted.duration,
				audioUrl: `/api/media/stream?file=${encodeURIComponent(fittedOut)}`,
				text: spokenText,
			};
			voiceovers.push(voiceSeg);

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
			backgroundAudioUrl: `/api/media/stream?file=${encodeURIComponent(stems.background)}`,
			transcript,
			translations,
			voiceovers,
			subtitles,
		};

		return LocalizedVideoProjectSchema.parse(result);
	}
}
