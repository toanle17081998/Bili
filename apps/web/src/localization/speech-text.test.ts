import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareSpeechText } from "./timing";

test("spoken LEGO uses English word pronunciation without rewriting captions or acronyms", async () => {
	assert.equal(await prepareSpeechText("Xe LEGO, bộ LEGO-Technic và USB."), "Xe Lego, bộ Lego-Technic và USB.");
	assert.equal(await prepareSpeechText("LEGO LEGO! lego Lego"), "Lego Lego! Lego Lego");
	assert.equal(await prepareSpeechText("LEGO123 LEGO_model LEGOLAND"), "LEGO123 LEGO_model LEGOLAND");
	assert.equal(await prepareSpeechText("Tiếng Việt: AI, USB, NASA."), "Tiếng Việt: AI, USB, NASA.");
});
