import { test } from "node:test";
import assert from "node:assert/strict";
import {
	fitVideoRect,
	mapSubtitleBox,
	normalizeSubtitleBand,
	normalizedBoxToPixels,
	selectConsistentSubtitleBox,
	subtitleMarginV,
} from "./layout";
import { buildDuckGainExpr, buildOverlayEnableExpr } from "./renderer";

test("centers a 16:9 source inside the 9:16 frame", () => {
	assert.deepEqual(fitVideoRect({ sourceWidth: 1920, sourceHeight: 1080 }), {
		x: 0,
		y: 656,
		width: 1080,
		height: 608,
	});
});

test("maps the source subtitle box into a wide output cover box", () => {
	const cover = mapSubtitleBox({
		box: { x: 0.25, y: 0.8, width: 0.5, height: 0.08 },
		sourceWidth: 1920,
		sourceHeight: 1080,
		minWidthRatio: 0.94,
		minHeightRatio: 0.16,
	});
	// Width is expanded to at least 94% of 1080px (~1016px)
	assert.ok(cover.width >= 1014);
	assert.ok(cover.y >= 656);
	assert.ok(cover.y + cover.height <= 656 + 608);
	assert.equal(cover.width % 2, 0);
	assert.equal(cover.height % 2, 0);
});

test("anchors tall union boxes to the bottom subtitle band", () => {
	const band = normalizeSubtitleBand({
		x: 0.179,
		y: 0.198,
		width: 0.646,
		height: 0.713,
	});
	assert.ok(band.y >= 0.8);
	assert.ok(band.height <= 0.12);

	const cover = mapSubtitleBox({
		box: { x: 0.179, y: 0.198, width: 0.646, height: 0.713 },
		sourceWidth: 1918,
		sourceHeight: 1080,
	});
	// Must sit in the bottom third of the fitted 16:9 video (y: 656..1264)
	assert.ok(cover.y >= 1100);
	assert.ok(cover.height <= 120);
});

test("tracks each video's actual subtitle Y position across frames", () => {
	// Video A has subtitles higher up around y = 0.60, plus a 1-frame outlier banner at y = 0.22
	const chosenA = selectConsistentSubtitleBox([
		{ x: 0.2, y: 0.22, width: 0.5, height: 0.08 },
		{ x: 0.18, y: 0.59, width: 0.64, height: 0.08 },
		{ x: 0.15, y: 0.6, width: 0.7, height: 0.08 },
		{ x: 0.22, y: 0.59, width: 0.56, height: 0.08 },
	]);
	assert.ok(Math.abs(chosenA.y - 0.595) < 0.03);

	const coverA = mapSubtitleBox({
		box: chosenA,
		sourceWidth: 1920,
		sourceHeight: 1080,
	});
	const coverBottom = mapSubtitleBox({
		box: { x: 0.15, y: 0.84, width: 0.7, height: 0.08 },
		sourceWidth: 1920,
		sourceHeight: 1080,
	});
	assert.ok(coverA.y + 80 < coverBottom.y);
});

test("keeps captions above the bottom edge of the cover box", () => {
	const margin = subtitleMarginV({
		cover: { x: 0, y: 1100, width: 1080, height: 100 },
	});
	assert.equal(margin, 1920 - 1200 + 18);
});

test("builds overlay enable expression matching active subtitle windows", () => {
	const expr = buildOverlayEnableExpr([
		{ start: 1, end: 2, text: "A" },
		{ start: 4, end: 5, text: "B" },
	]);
	assert.ok(expr.includes("between(t,1.000,2.550)"));
	assert.ok(expr.includes("between(t,4.000,5.400)"));
});

test("keeps logo regions one pixel away from the frame edge", () => {
	const box = normalizedBoxToPixels({
		box: { x: 0, y: 0, width: 1, height: 1 },
		sourceWidth: 640,
		sourceHeight: 360,
	});
	assert.ok(box.x >= 1);
	assert.ok(box.y >= 1);
	assert.ok(box.x + box.width < 640);
	assert.ok(box.y + box.height < 360);
});

test("keeps background volume steady across short pauses and only swells on long gaps", () => {
	// Continuous narration with 1-2s gaps between sentences -> constant 0.45 gain (no pumping)
	const steady = buildDuckGainExpr({
		cues: [
			{ start: 0.5, end: 3.0, text: "Câu 1" },
			{ start: 4.2, end: 7.5, text: "Câu 2" },
			{ start: 9.0, end: 12.0, text: "Câu 3" },
		],
		duration: 13.0,
	});
	assert.equal(steady, "0.45");

	// Long 6-second instrumental break between 3.0s and 9.0s -> smooth trapezoid pulse
	const withLongBreak = buildDuckGainExpr({
		cues: [
			{ start: 0.5, end: 3.0, text: "Mở đầu" },
			{ start: 9.0, end: 12.0, text: "Kết thúc" },
		],
		duration: 13.0,
	});
	assert.ok(withLongBreak?.startsWith("clip(0.45+0.55*("));
	assert.ok(withLongBreak?.includes("min(clip((t-3.20)/0.6,0,1),clip((8.80-t)/0.6,0,1))"));
});
