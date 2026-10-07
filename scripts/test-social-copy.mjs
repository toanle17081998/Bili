import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";

const { instance } = await WebAssembly.instantiate(await readFile(
	new URL("../rust/social-copy/social-copy.wasm", import.meta.url),
));
const wasm = instance.exports;

function run(operation, fields) {
	const bytes = new TextEncoder().encode(fields.join("\0"));
	const input = wasm.social_alloc(bytes.length);
	new Uint8Array(wasm.memory.buffer, input, bytes.length).set(bytes);
	const output = wasm.social_run(operation, input, bytes.length);
	const length = wasm.social_output_len();
	const result = new TextDecoder().decode(new Uint8Array(wasm.memory.buffer, output, length));
	wasm.social_free(input, bytes.length);
	wasm.social_free(output, length);
	return result;
}

test("WASM drafts handle Vietnamese, quotes, newlines, and all three platforms", () => {
	const posts = JSON.parse(run(1, ['Nấu "phở" 🍜', "Nước dùng thơm. Thêm gia vị.\nĂn nóng.", "friendly"]));
	assert.deepEqual(Object.keys(posts), ["tiktok", "facebook", "youtube"]);
	assert.match(posts.tiktok.caption, /Cùng xem/);
	assert.match(posts.facebook.caption, /Chia sẻ với mình/);
	assert.notEqual(posts.tiktok.caption, posts.facebook.caption);
	assert.equal(posts.youtube.title, 'Nấu "phở" 🍜');
	assert.ok(posts.youtube.hashtags.includes("#Shorts"));
});

test("WASM normalizes duplicate tags and bounds emoji titles and platform tag counts", () => {
	const fields = ["", "TikTok", "#ẨmThực #ẩmthực #a #b #c #d #e",
		"", "Facebook", "#a,#b,#c,#d,#e,#f",
		"🍜".repeat(110), "YouTube", "#Shorts #Food #Cooking #Extra"];
	const posts = JSON.parse(run(2, fields));
	assert.equal(Array.from(posts.youtube.title).length, 100);
	assert.equal(posts.tiktok.hashtags.length, 5);
	assert.equal(posts.tiktok.hashtags.filter((tag) => tag.toLowerCase() === "#ẩmthực").length, 1);
	assert.equal(posts.facebook.hashtags.length, 5);
	assert.equal(posts.youtube.hashtags.length, 3);
});

test("WASM handles an empty source title and repeated allocation cycles", () => {
	for (let i = 0; i < 100; i++) {
		const posts = JSON.parse(run(1, ["", "Mẹo nấu ăn tại nhà", "informative"]));
		assert.equal(posts.youtube.title, "Mẹo nấu ăn tại nhà");
		assert.ok(posts.tiktok.caption);
	}
	assert.equal(run(2, ["invalid"]), "");
});
