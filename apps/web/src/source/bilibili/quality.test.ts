import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidQuality, listVideoQualities, selectVideoFormat } from "./quality";

const formats = [
	{ url: "a1080", vcodec: "avc1", height: 1080, tbr: 3000 },
	{ url: "h1080", vcodec: "hev1", height: 1080, tbr: 2000 },
	{ url: "a720", vcodec: "avc1", height: 720, tbr: 1500 },
	{ url: "a480", vcodec: "avc1", height: 480, tbr: 800 },
	{ url: "audio", vcodec: "none", tbr: 192 },
];

test("lists unique video heights from highest to lowest and ignores audio", () => {
	assert.deepEqual(listVideoQualities(formats), [
		{ height: 1080, label: "1080p" },
		{ height: 720, label: "720p" },
		{ height: 480, label: "480p" },
	]);
});

test("without a request the best H.264 stream is selected", () => {
	assert.equal(selectVideoFormat(formats)?.url, "a1080");
});

test("a request selects the best stream not above that height", () => {
	assert.equal(selectVideoFormat(formats, 720)?.url, "a720");
	assert.equal(selectVideoFormat(formats, 600)?.url, "a480");
});

test("a request below every stream selects the lowest stream", () => {
	assert.equal(selectVideoFormat(formats, 144)?.url, "a480");
});

test("non-H.264 streams are used when no H.264 stream exists", () => {
	assert.equal(
		selectVideoFormat([{ url: "hevc", vcodec: "hev1", height: 2160, tbr: 9000 }], 2160)?.url,
		"hevc",
	);
});

test("only sane integer heights are valid qualities", () => {
	assert.equal(isValidQuality(720), true);
	assert.equal(isValidQuality("720"), false);
	assert.equal(isValidQuality(7.5), false);
	assert.equal(isValidQuality(99999), false);
});
