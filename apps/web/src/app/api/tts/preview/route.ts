import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { createDefaultTTSProvider } from "@/providers/tts/service";
import { SpeechProviderError } from "@/providers/tts/types";

export async function GET(request: NextRequest) {
	try {
		const searchParams = request.nextUrl.searchParams;
		const voice = searchParams.get("voice")?.trim() || "Hải Đăng";

		const cacheDir = path.join(process.cwd(), ".local_storage", "tts_previews");
		await fs.mkdir(cacheDir, { recursive: true });

		const safeKey = Buffer.from(voice, "utf-8").toString("hex");
		const cachedPath = path.join(cacheDir, `preview_${safeKey}.wav`);

		if (!existsSync(cachedPath)) {
			const provider = createDefaultTTSProvider();
			const sampleText = `Xin chào! Tôi là ${voice}. Đây là giọng đọc mẫu thử trên hệ thống.`;
			await provider.generateSpeech({
				text: sampleText,
				voice,
				outputPath: cachedPath,
			});
		}

		const audioBuffer = await fs.readFile(cachedPath);
		return new NextResponse(audioBuffer, {
			headers: {
				"Content-Type": "audio/wav",
				"Content-Length": String(audioBuffer.byteLength),
				"Cache-Control": "public, max-age=86400, immutable",
			},
		});
	} catch (error: unknown) {
		console.error("TTS preview error:", error);
		if (error instanceof SpeechProviderError) {
			return NextResponse.json(
				{ success: false, error: error.message },
				{ status: error.status === 429 ? 429 : 503 },
			);
		}
		return NextResponse.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Không thể tạo bản nghe thử giọng đọc",
			},
			{ status: 500 },
		);
	}
}
