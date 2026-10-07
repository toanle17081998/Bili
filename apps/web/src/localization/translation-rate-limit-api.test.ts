import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { POST as processVideo } from "@/app/api/localization/process/route";
import { POST as previewVideo } from "@/app/api/localization/preview/route";
import { LocalizationPipeline } from "./pipeline";
import { TranslationCooldownError, TranslationRateLimitError } from "@/providers/llm/free-translate";

test("preview and processing APIs surface translation cooldown as 429 with Retry-After", async () => {
	const originalRun = LocalizationPipeline.prototype.run;
	const originalPreview = LocalizationPipeline.prototype.generatePreview;
	const originalLog = console.error;
	console.error = () => {};
	try {
		for (const status of [429, 503, 500]) {
			const fail = async (): Promise<never> => {
				throw status === 429 ? new TranslationRateLimitError(120000)
					: status === 503 ? new TranslationCooldownError({ status: 503, retryAfterMs: 120000 })
					: new Error("Translation unavailable");
			};
			LocalizationPipeline.prototype.run = fail;
			LocalizationPipeline.prototype.generatePreview = fail;
			for (const handler of [previewVideo, processVideo]) {
				const request = new NextRequest("http://localhost/api/localization/test", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						projectId: "rate-limit-test", videoPath: fileURLToPath(import.meta.url),
					}),
				});
				const response = await handler(request);
				const body = await response.json();
				assert.equal(response.status, status);
				assert.equal(response.headers.get("Retry-After"), status === 500 ? null : "120");
				assert.equal(body.success, false);
				assert.match(body.error, status === 500 ? /Translation unavailable/ : new RegExp(`HTTP ${status}`));
			}
		}
	} finally {
		LocalizationPipeline.prototype.run = originalRun;
		LocalizationPipeline.prototype.generatePreview = originalPreview;
		console.error = originalLog;
	}
});
