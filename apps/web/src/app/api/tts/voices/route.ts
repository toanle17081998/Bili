import { NextResponse } from "next/server";
import { createDefaultTTSProvider } from "@/providers/tts/service";
import { VIENEU_PRESET_VOICES } from "@/providers/tts/voices";

export async function GET() {
	try {
		const provider = createDefaultTTSProvider();
		const voices = provider.getVoices ? await provider.getVoices() : VIENEU_PRESET_VOICES;
		return NextResponse.json({
			success: true,
			voices: voices.map((v) => ({
				...v,
				previewUrl: `/api/tts/preview?voice=${encodeURIComponent(v.name || v.id)}`,
			})),
		});
	} catch (error) {
		console.warn("Could not query live TTS server, falling back to preset voices:", error);
		return NextResponse.json({
			success: true,
			voices: VIENEU_PRESET_VOICES.map((v) => ({
				...v,
				previewUrl: `/api/tts/preview?voice=${encodeURIComponent(v.name || v.id)}`,
			})),
		});
	}
}
