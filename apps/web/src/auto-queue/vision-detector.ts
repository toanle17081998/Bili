import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FFmpegService } from "@/media/ffmpeg";
import {
	getOpenAILLMApiKey,
	getOpenAILLMBaseUrl,
	getOpenAILLMModel,
} from "@/providers/openai-compatible";
import {
	DEFAULT_SUBTITLE_BOX,
	normalizeSubtitleBand,
	selectConsistentSubtitleBox,
	type NormalizedBox,
} from "./layout";

export interface VisionResult {
	logos: NormalizedBox[];
	subtitle: NormalizedBox;
	detected: { logos: boolean; subtitle: boolean };
}

const PROMPT = `You inspect 4-5 frames sampled from a video during spoken dialogue. Return ONLY JSON:
{"logos":[{"x":0-1,"y":0-1,"width":0-1,"height":0-1}],"subtitles":[{"x":0-1,"y":0-1,"width":0-1,"height":0-1}],"subtitle":{"x":0-1,"y":0-1,"width":0-1,"height":0-1}|null}
Coordinates are fractions of the frame (0 to 1), origin top-left.
- "logos": static corner/edge channel watermarks or platform badges (NOT subtitles, NOT scene objects). Empty array if none.
- "subtitles": for EACH frame that displays a burned-in dialogue subtitle line, return its tight bounding box (height <= 0.18). Do NOT merge text from different vertical positions into one tall box; only bound the dialogue subtitle line itself.
- "subtitle": the representative bounding box of the video's dialogue subtitle track (or null if no burned-in subtitle exists).`;

function box(value: unknown): NormalizedBox | null {
	if (!value || typeof value !== "object") return null;
	const { x, y, width, height } = value as Record<string, unknown>;
	const nums = [x, y, width, height].map(Number);
	if (nums.some((n) => !Number.isFinite(n))) return null;
	const [bx, by, bw, bh] = nums;
	if (bw <= 0.005 || bh <= 0.005) return null;
	const cx = Math.min(1, Math.max(0, bx));
	const cy = Math.min(1, Math.max(0, by));
	return {
		x: cx,
		y: cy,
		width: Math.min(bw, 1 - cx),
		height: Math.min(bh, 1 - cy),
	};
}

function isCornerLogo(item: NormalizedBox): boolean {
	if (item.width >= 0.38 || item.height >= 0.28) return false;
	const nearTopOrBottom = item.y <= 0.24 || item.y + item.height >= 0.76;
	const nearLeftOrRight = item.x <= 0.24 || item.x + item.width >= 0.76;
	// Avoid treating bottom-center subtitles as logos
	const isBottomSubtitleZone =
		item.y >= 0.70 && item.x > 0.16 && item.x + item.width < 0.84;
	return (nearTopOrBottom || nearLeftOrRight) && !isBottomSubtitleZone;
}

export function parseVisionResponse(raw: string): VisionResult {
	let data: { logos?: unknown; subtitles?: unknown; subtitle?: unknown } = {};
	try {
		const match = raw.match(/\{[\s\S]*\}/);
		data = match ? JSON.parse(match[0]) : {};
	} catch {
		data = {};
	}
	const logos = (Array.isArray(data.logos) ? data.logos : [])
		.map(box)
		.filter((item): item is NormalizedBox => !!item && isCornerLogo(item))
		.slice(0, 4);
	const listCandidates = (Array.isArray(data.subtitles) ? data.subtitles : [])
		.map(box)
		.filter((item): item is NormalizedBox => !!item);
	const singleCandidate = box(data.subtitle);
	const allCandidates = [
		...listCandidates,
		...(singleCandidate ? [singleCandidate] : []),
	];
	const subtitle = allCandidates.length
		? selectConsistentSubtitleBox(allCandidates)
		: DEFAULT_SUBTITLE_BOX;
	return {
		logos,
		subtitle,
		detected: { logos: logos.length > 0, subtitle: allCandidates.length > 0 },
	};
}

async function askVision({
	frames,
	signal,
}: {
	frames: string[];
	signal?: AbortSignal;
}): Promise<string> {
	const gemini = process.env.GEMINI_API_KEY?.trim();
	const timeout = AbortSignal.any([
		...(signal ? [signal] : []),
		AbortSignal.timeout(90_000),
	]);
	if (gemini) {
		const model = process.env.AUTO_VISION_GEMINI_MODEL || "gemini-2.5-flash";
		const response = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json", "x-goog-api-key": gemini },
				body: JSON.stringify({
					contents: [
						{
							parts: [
								{ text: PROMPT },
								...frames.map((data) => ({
									inlineData: { mimeType: "image/jpeg", data },
								})),
							],
						},
					],
					generationConfig: {
						responseMimeType: "application/json",
						thinkingConfig: { thinkingBudget: 0 },
					},
				}),
				signal: timeout,
			},
		);
		if (!response.ok) throw new Error(`Vision HTTP ${response.status}`);
		const data = await response.json();
		return (
			data.candidates?.[0]?.content?.parts
				?.map((part: { text?: string }) => part.text ?? "")
				.join("") ?? ""
		);
	}
	const key = getOpenAILLMApiKey();
	if (!key) throw new Error("Chưa cấu hình GEMINI_API_KEY hoặc OPENAI_LLM_API_KEY.");
	const response = await fetch(`${getOpenAILLMBaseUrl()}/chat/completions`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
		body: JSON.stringify({
			model: getOpenAILLMModel(),
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: PROMPT },
						...frames.map((data) => ({
							type: "image_url",
							image_url: { url: `data:image/jpeg;base64,${data}` },
						})),
					],
				},
			],
			response_format: { type: "json_object" },
		}),
		signal: timeout,
	});
	if (!response.ok) throw new Error(`Vision HTTP ${response.status}`);
	const data = await response.json();
	return data.choices?.[0]?.message?.content ?? "";
}

export async function detectLogoAndSubtitle({
	videoPath,
	duration,
	sampleTimes,
	signal,
}: {
	videoPath: string;
	duration: number;
	sampleTimes?: number[];
	signal?: AbortSignal;
}): Promise<VisionResult> {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "auto-vision-"));
	try {
		const minTime = duration * 0.12;
		const maxTime = duration * 0.88;
		const fallbackTimes = [0.22, 0.38, 0.54, 0.7, 0.82].map((ratio) =>
			Math.max(0, duration * ratio),
		);
		const validCustomTimes = (sampleTimes ?? [])
			.filter((t) => Number.isFinite(t) && t >= minTime && t <= maxTime)
			.slice(0, 5);
		const times = validCustomTimes.length >= 2 ? validCustomTimes : fallbackTimes;
		const frames: string[] = [];
		for (const [index, time] of times.entries()) {
			const file = path.join(directory, `${index}.jpg`);
			await FFmpegService.runCommand(
				"ffmpeg",
				[
					"-y", "-ss", time.toFixed(3), "-i", videoPath, "-frames:v", "1",
					"-vf", "scale=960:-2:force_original_aspect_ratio=decrease,format=yuvj420p",
					"-q:v", "4", file,
				],
				{ signal },
			);
			frames.push((await fs.readFile(file)).toString("base64"));
		}
		return parseVisionResponse(await askVision({ frames, signal }));
	} catch (error) {
		if (signal?.aborted) throw error;
		console.warn("Auto vision detection failed, using defaults:", error);
		return {
			logos: [],
			subtitle: DEFAULT_SUBTITLE_BOX,
			detected: { logos: false, subtitle: false },
		};
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
}
