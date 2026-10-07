import { VieNeuTTSProvider } from "./vieneu";
import type { TTSProvider } from "./types";

/**
 * Returns the TTS provider used by the localization pipeline.
 *
 * The web app currently ships a single provider (VieNeu-TTS, see ./vieneu.ts).
 * `VIENEU_ENDPOINT` must point at a running VieNeu server; the server is
 * self-hosted and free. See `apps/web/.env.example` for the default URL.
 */
export function createDefaultTTSProvider(): TTSProvider {
	const vieneuEndpoint = process.env.VIENEU_ENDPOINT?.trim();
	if (!vieneuEndpoint) {
		throw new Error(
			"VIENEU_ENDPOINT chưa được cấu hình. Start VieNeu server và set VIENEU_ENDPOINT trong .env.local.",
		);
	}
	return new VieNeuTTSProvider({ endpoint: vieneuEndpoint });
}
