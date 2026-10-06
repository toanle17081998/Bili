import { z } from "zod";

export const TranscriptSegmentSchema = z.object({
	start: z.number().min(0),
	end: z.number().min(0),
	text: z.string(),
});

export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;

export const TranslationSegmentSchema = z.object({
	sourceStart: z.number().min(0),
	sourceEnd: z.number().min(0),
	sourceText: z.string(),
	vietnameseText: z.string(),
	targetDuration: z.number().min(0),
});

export type TranslationSegment = z.infer<typeof TranslationSegmentSchema>;

export const VoiceSegmentSchema = z.object({
	id: z.string(),
	start: z.number().min(0),
	end: z.number().min(0),
	duration: z.number().min(0),
	audioUrl: z.string(),
	text: z.string(),
});

export type VoiceSegment = z.infer<typeof VoiceSegmentSchema>;

export const SubtitleSegmentSchema = z.object({
	id: z.string(),
	start: z.number().min(0),
	end: z.number().min(0),
	text: z.string(),
	style: z
		.object({
			fontSize: z.number().optional(),
			color: z.string().optional(),
			verticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
			theme: z.enum(["minimal", "bold", "tiktok"]).optional(),
		})
		.optional(),
});

export type SubtitleSegment = z.infer<typeof SubtitleSegmentSchema>;

export const LocalizedVideoProjectSchema = z.object({
	id: z.string(),
	source: z.object({
		provider: z.string(),
		id: z.string(),
		url: z.string(),
		path: z.string(),
		duration: z.number(),
	}),
	format: z.object({
		width: z.literal(1080),
		height: z.literal(1920),
		fps: z.number().default(30),
	}),
	transcript: z.array(TranscriptSegmentSchema),
	translations: z.array(TranslationSegmentSchema),
	voiceovers: z.array(VoiceSegmentSchema),
	subtitles: z.array(SubtitleSegmentSchema),
});

export type LocalizedVideoProject = z.infer<typeof LocalizedVideoProjectSchema>;
