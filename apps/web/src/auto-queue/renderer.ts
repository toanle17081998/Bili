import fs from "node:fs/promises";
import path from "node:path";
import { FFmpegService, type VideoProbeResult } from "@/media/ffmpeg";
import { planWatermarkFilters } from "@/media/watermark/core";
import {
	OUTPUT_HEIGHT,
	OUTPUT_WIDTH,
	mapSubtitleBox,
	normalizedBoxToPixels,
	subtitleFontSize,
	subtitleMarginV,
	type NormalizedBox,
	type PixelBox,
} from "./layout";

export interface RenderCue {
	start: number;
	end: number;
	text: string;
}

export interface RenderSettings {
	voiceVolume: number;
	musicVolume: number;
	originalVolume?: number;
	musicDucking?: boolean;
	subtitleColor: string;
	subtitleMaxLines: number;
	coverSubtitle?: boolean;
	subtitleBlur?: number;
	subtitleBgOpacity?: number;
	subtitleFontSizePx?: number;
	stripWidthPercent?: number;
	stripHeightPercent?: number;
}

function assTime(seconds: number): string {
	const cs = Math.round(Math.max(0, seconds) * 100);
	const h = Math.floor(cs / 360000);
	const m = Math.floor((cs % 360000) / 6000);
	const s = Math.floor((cs % 6000) / 100);
	return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

function assColor(hex: string): string {
	const clean = /^#?[0-9a-fA-F]{6}$/.test(hex) ? hex.replace("#", "") : "FFFF00";
	return `&H00${clean.slice(4, 6)}${clean.slice(2, 4)}${clean.slice(0, 2)}`.toUpperCase();
}

export function computeCueWindows(cues: RenderCue[]): RenderCue[] {
	return cues.map((cue, index) => {
		const next = cues[index + 1];
		const gap = next ? Math.max(0, next.start - cue.end) : 0.4;
		const tailHold =
			gap > 0.02 ? (gap <= 0.7 ? gap : Math.min(0.55, gap)) : 0;
		return {
			start: Math.max(0, cue.start),
			end: Math.max(cue.start + 0.1, cue.end + tailHold),
			text: cue.text,
		};
	});
}

export function buildOverlayEnableExpr(cues: RenderCue[]): string {
	const windows = computeCueWindows(cues);
	if (!windows.length) return "0";
	const merged: { start: number; end: number }[] = [];
	for (const w of windows) {
		const last = merged.at(-1);
		if (last && w.start - last.end <= 0.12) {
			last.end = Math.max(last.end, w.end);
		} else {
			merged.push({ start: w.start, end: w.end });
		}
	}
	return merged
		.map((w) => `between(t,${w.start.toFixed(3)},${w.end.toFixed(3)})`)
		.join("+");
}

export function buildDuckGainExpr({
	cues,
	duration,
	minGapSeconds = 3.5,
	speechGain = 0.45,
}: {
	cues: RenderCue[];
	duration: number;
	minGapSeconds?: number;
	speechGain?: number;
}): string | null {
	if (!cues.length || !(duration > 0)) return null;
	const sorted = [...cues]
		.filter((c) => c.end > c.start)
		.sort((a, b) => a.start - b.start);
	if (!sorted.length) return null;

	// Merge cues separated by short pauses (< minGapSeconds) into continuous speech blocks
	const blocks: { start: number; end: number }[] = [];
	for (const c of sorted) {
		const start = Math.max(0, c.start);
		const end = Math.min(duration, Math.max(start, c.end));
		const last = blocks.at(-1);
		if (last && start - last.end < minGapSeconds) {
			last.end = Math.max(last.end, end);
		} else {
			blocks.push({ start, end });
		}
	}

	const gaps: { start: number; end: number }[] = [];
	if (blocks[0].start >= minGapSeconds) {
		gaps.push({ start: 0, end: blocks[0].start });
	}
	for (let i = 0; i < blocks.length - 1; i++) {
		const gapStart = blocks[i].end;
		const gapEnd = blocks[i + 1].start;
		if (gapEnd - gapStart >= minGapSeconds) {
			gaps.push({ start: gapStart, end: gapEnd });
		}
	}
	const lastBlock = blocks[blocks.length - 1];
	if (duration - lastBlock.end >= minGapSeconds) {
		gaps.push({ start: lastBlock.end, end: duration });
	}

	const baseStr = speechGain.toFixed(2);
	if (!gaps.length) {
		return baseStr;
	}

	const pad = 0.2;
	const fade = 0.6;
	const pulses = gaps.map((g) => {
		const isStart = g.start <= 0.05;
		const isEnd = g.end >= duration - 0.05;
		const u0 = (g.start + pad).toFixed(2);
		const d1 = (g.end - pad).toFixed(2);
		if (isStart && isEnd) return "1";
		if (isStart) return `clip((${d1}-t)/${fade},0,1)`;
		if (isEnd) return `clip((t-${u0})/${fade},0,1)`;
		return `min(clip((t-${u0})/${fade},0,1),clip((${d1}-t)/${fade},0,1))`;
	});

	const deltaStr = (1 - speechGain).toFixed(2);
	return `clip(${baseStr}+${deltaStr}*(${pulses.join("+")}),${baseStr},1)`;
}

export function buildAss({
	cues,
	cover,
	color,
	maxLines,
	fontSizePx,
}: {
	cues: RenderCue[];
	cover: PixelBox;
	color: string;
	maxLines: number;
	fontSizePx?: number;
}): string {
	const size =
		typeof fontSizePx === "number" && fontSizePx >= 24 && fontSizePx <= 96
			? Math.round(fontSizePx)
			: subtitleFontSize({ cover });
	const defaultMarginV = subtitleMarginV({ cover });
	const marginL = Math.max(24, cover.x + 28);
	const marginR = Math.max(24, OUTPUT_WIDTH - (cover.x + cover.width) + 28);
	const windows = computeCueWindows(cues);

	const events = windows
		.map((cue) => {
			const raw = cue.text.replace(/\{|\}/g, "").trim();
			const lines = (maxLines === 1 ? raw.replace(/\s+/g, " ") : raw).split(
				/\r?\n/,
			);
			const text = lines.join("\\N");
			const blockHeight = lines.length * size * 1.15;
			const insetBottom = Math.max(
				6,
				Math.round((cover.height - blockHeight) / 2),
			);
			const cueMarginV = Math.max(
				0,
				OUTPUT_HEIGHT - (cover.y + cover.height) + insetBottom,
			);
			return `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Default,,${marginL},${marginR},${cueMarginV},,${text}`;
		})
		.join("\n");
	return `[Script Info]
ScriptType: v4.00+
PlayResX: ${OUTPUT_WIDTH}
PlayResY: ${OUTPUT_HEIGHT}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${size},${assColor(color)},&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,4,0,2,${marginL},${marginR},${defaultMarginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}
`;
}

export function escapeFilterPath(file: string): string {
	return file.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export function buildFilterGraph({
	logoFilters,
	cover,
	assPath,
	cues = [],
	coverSubtitle = true,
	subtitleBlur = 30,
	subtitleBgOpacity = 0,
}: {
	logoFilters: string[];
	cover: PixelBox;
	assPath: string;
	cues?: RenderCue[];
	source?: Pick<VideoProbeResult, "width" | "height">;
	coverSubtitle?: boolean;
	subtitleBlur?: number;
	subtitleBgOpacity?: number;
}): string {
	const pre = logoFilters.length ? `${logoFilters.join(",")},` : "";
	if (!coverSubtitle) {
		return [
			`[0:v]${pre}scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=decrease,pad=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30[covered]`,
			`[covered]subtitles='${escapeFilterPath(assPath)}':charenc=UTF-8[vout]`,
		].join(";");
	}
	const sigma = Math.max(4, Math.min(60, Math.round(subtitleBlur)));
	const alpha = Math.max(0, Math.min(85, Math.round(subtitleBgOpacity))) / 100;
	const tintFilter =
		alpha > 0.01
			? `,drawbox=x=0:y=0:w=iw:h=ih:color=black@${alpha.toFixed(2)}:t=fill`
			: "";
	const enableExpr = cues.length > 0 ? buildOverlayEnableExpr(cues) : "1";
	return [
		`[0:v]${pre}scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=decrease,pad=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,split[base][blurSrc]`,
		`[blurSrc]crop=${cover.width}:${cover.height}:${cover.x}:${cover.y},gblur=sigma=${sigma}:steps=3${tintFilter}[blur]`,
		`[base][blur]overlay=${cover.x}:${cover.y}:enable='${enableExpr}'[covered]`,
		`[covered]subtitles='${escapeFilterPath(assPath)}':charenc=UTF-8[vout]`,
	].join(";");
}

export async function renderAutoVideo({
	videoPath,
	voicePath,
	musicPath,
	originalAudioPath,
	cues,
	logos,
	subtitleBox,
	settings,
	outputPath,
	workDir,
	signal,
}: {
	videoPath: string;
	voicePath: string;
	musicPath: string | null;
	originalAudioPath?: string | null;
	cues: RenderCue[];
	logos: NormalizedBox[];
	subtitleBox: NormalizedBox;
	settings: RenderSettings;
	outputPath: string;
	workDir: string;
	signal?: AbortSignal;
}) {
	const probe = await FFmpegService.probeVideo({ filePath: videoPath, signal });
	const minWidthRatio = Math.max(
		0.65,
		Math.min(1, (settings.stripWidthPercent ?? 94) / 100),
	);
	const minHeightRatio = Math.max(
		0.1,
		Math.min(0.35, (settings.stripHeightPercent ?? 16) / 100),
	);
	const cover = mapSubtitleBox({
		box: subtitleBox,
		sourceWidth: probe.width,
		sourceHeight: probe.height,
		minWidthRatio,
		minHeightRatio,
	});
	const logoFilters = logos.length
		? await planWatermarkFilters({
				video: probe,
				regions: logos.map((box) => ({
					...normalizedBoxToPixels({
						box,
						sourceWidth: probe.width,
						sourceHeight: probe.height,
					}),
					start: 0,
					end: probe.duration,
				})),
			})
		: [];
	await fs.mkdir(workDir, { recursive: true });
	const assPath = path.join(workDir, "captions.ass");
	await fs.writeFile(
		assPath,
		buildAss({
			cues,
			cover,
			color: settings.subtitleColor,
			maxLines: settings.subtitleMaxLines,
			fontSizePx: settings.subtitleFontSizePx,
		}),
		"utf8",
	);
	const extraAudioInputs: string[] = [];
	const duckExpr =
		settings.musicDucking === false
			? null
			: buildDuckGainExpr({ cues, duration: probe.duration });
	const audioBranches: string[] = [
		`[1:a]aresample=48000,aformat=channel_layouts=stereo,volume=${settings.voiceVolume}[voice]`,
	];
	const mixLabels: string[] = ["[voice]"];
	let nextInputIdx = 2;
	// Background stays quiet while the narrator is talking and only swells back up
	// during long stretches without any dubbing.
	const duckFilter = duckExpr ? `,volume='${duckExpr}':eval=frame` : "";

	if (musicPath) {
		extraAudioInputs.push("-i", musicPath);
		audioBranches.push(
			`[${nextInputIdx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${settings.musicVolume}${duckFilter}[music]`,
		);
		mixLabels.push("[music]");
		nextInputIdx++;
	}
	if (originalAudioPath) {
		extraAudioInputs.push("-i", originalAudioPath);
		audioBranches.push(
			`[${nextInputIdx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${settings.originalVolume ?? 0.35}${duckFilter}[orig]`,
		);
		mixLabels.push("[orig]");
		nextInputIdx++;
	}

	const audio =
		mixLabels.length > 1
			? `${audioBranches.join(";")};${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=0:normalize=0[aout]`
			: `[1:a]aresample=48000,aformat=channel_layouts=stereo,volume=${settings.voiceVolume}[aout]`;

	const filterGraph = `${buildFilterGraph({
		logoFilters,
		cover,
		assPath,
		cues,
		source: probe,
		coverSubtitle: settings.coverSubtitle ?? true,
		subtitleBlur: settings.subtitleBlur ?? 30,
		subtitleBgOpacity: settings.subtitleBgOpacity ?? 0,
	})};${audio}`;
	const filterPath = path.join(workDir, "filtergraph.txt");
	await fs.writeFile(filterPath, filterGraph, "utf8");
	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await FFmpegService.runCommand(
		"ffmpeg",
		[
			"-hide_banner", "-loglevel", "error", "-nostdin", "-y",
			"-i", videoPath,
			"-i", voicePath,
			...extraAudioInputs,
			"-/filter_complex",
			filterPath,
			"-map", "[vout]", "-map", "[aout]",
			"-t", String(probe.duration),
			"-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p",
			"-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
			outputPath,
		],
		{ signal },
	);
	return { cover, probe };
}
