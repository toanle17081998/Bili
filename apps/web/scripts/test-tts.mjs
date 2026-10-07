// Quick test for the configured TTS provider (VieNeu-TTS).
// Run: bun --env-file=.env.local run scripts/test-tts.mjs
import { createDefaultTTSProvider } from "../src/providers/tts/service.ts";
import { FFmpegService } from "../src/media/ffmpeg/index.ts";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";

const endpoint = process.env.VIENEU_ENDPOINT?.trim();
console.log("Provider config:");
console.log(`  VIENEU_ENDPOINT: ${endpoint || "—"}`);
console.log(`  VIENEU_MODEL: ${process.env.VIENEU_MODEL?.trim() || "vieneu-v3-turbo"}`);
console.log("");

if (!endpoint) {
	console.error("❌ VIENEU_ENDPOINT chưa được set trong .env.local");
	console.error("   Start VieNeu server trước: cd d:/workspace/bili/VieNeu-TTS && HF_ENDPOINT=https://hf-mirror.com uv run python -m apps.openai_speech");
	process.exit(1);
}

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tts-test-"));
const outputPath = path.join(tmpDir, "test.wav");

const provider = createDefaultTTSProvider();
console.log(`🎤 Active provider: ${provider.name}`);
console.log("📤 Generating speech...");

const start = Date.now();
try {
	const result = await provider.generateSpeech({
		text: "Xin chào, đây là bài kiểm tra giọng đọc tiếng Việt của VieNeu TTS.",
		voice: "vi-VN-HoaiMyNeural",
		speed: 1,
		outputPath,
	});
	const elapsed = ((Date.now() - start) / 1000).toFixed(1);
	console.log(`✅ Success trong ${elapsed}s`);
	console.log(`📁 Audio: ${result.audioPath}`);
	console.log(`⏱️  Duration: ${result.duration.toFixed(2)}s`);

	const stats = await fs.stat(outputPath);
	console.log(`💾 Size: ${(stats.size / 1024).toFixed(1)} KB`);

	const probe = await FFmpegService.probeVideo(outputPath);
	console.log(`🔍 FFmpeg probe: ${probe.duration.toFixed(2)}s`);
} catch (error) {
	console.error(`❌ Failed: ${error.message}`);
	if (error.status) console.error(`   Status: ${error.status}`);
	if (error.retryAfterMs) console.error(`   Retry after: ${error.retryAfterMs}ms`);
	process.exit(1);
} finally {
	await fs.rm(tmpDir, { recursive: true, force: true });
}
