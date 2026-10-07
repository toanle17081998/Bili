/**
 * Shared TTS contract used by every provider in this folder.
 *
 * The web app currently ships a single provider (VieNeu-TTS, see ./vieneu.ts).
 * The interface and error class are kept here so additional providers can be
 * added later without re-defining the contract.
 */

export interface TTSRequest {
	text: string;
	voice?: string;
	speed?: number;
	outputPath: string;
}

export interface TTSResult {
	audioPath: string;
	duration: number;
}

export interface TTSVoice {
	id: string;
	name: string;
	description?: string;
	gender?: "male" | "female" | string;
	region?: "Bắc" | "Trung" | "Nam" | string;
	style?: string;
	featured?: number;
	aliases?: string[];
	previewUrl?: string;
}

export interface TTSProvider {
	readonly name: string;
	generateSpeech(request: TTSRequest): Promise<TTSResult>;
	getVoices?(): Promise<TTSVoice[]>;
}

export class SpeechProviderError extends Error {
	readonly status: number;
	readonly retryAfterMs: number;
	constructor({ provider, status, retryAfterMs = 0 }: { provider: string; status: number; retryAfterMs?: number }) {
		super(status === 429
			? `${provider} đang giới hạn lượt tạo giọng (HTTP 429). Chờ ${Math.max(1, Math.ceil(retryAfterMs / 1000))} giây rồi thử lại.`
			: `${provider} chưa tạo được giọng${status ? ` (HTTP ${status})` : " do lỗi kết nối"}. Vui lòng thử lại sau.`);
		this.name = "SpeechProviderError";
		this.status = status;
		this.retryAfterMs = retryAfterMs;
	}
}
