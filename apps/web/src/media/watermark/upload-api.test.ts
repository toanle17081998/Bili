import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as removeWatermark } from "@/app/api/media/watermark-removals/route";
import { POST as uploadNarration } from "@/app/api/localization/sources/route";

for (const [name, handler] of [
	["watermark", removeWatermark],
	["narration", uploadNarration],
] as const) {
	test(name + " upload accepts declared sizes above 256 MiB up to the new limit", async () => {
		for (const bytes of [300 * 1024 * 1024, 1024 * 1024 * 1024 + 1024 * 1024]) {
			const response = await handler(
				new NextRequest("http://localhost/upload", {
					method: "POST",
					body: new FormData(),
					headers: { "content-length": String(bytes) },
				}),
			);
			assert.equal(
				response.status,
				400,
				"empty form reaches field validation, not the upload limit",
			);
		}
	});

	test(name + " upload rejects declared sizes above 1 GiB plus framing", async () => {
		const response = await handler(
			new NextRequest("http://localhost/upload", {
				method: "POST",
				body: new FormData(),
				headers: {
					"content-length": String(1024 * 1024 * 1024 + 1024 * 1024 + 1),
				},
			}),
		);
		assert.equal(response.status, 413);
		assert.equal((await response.json()).error, "Video vượt quá 1 GB.");
	});
}
