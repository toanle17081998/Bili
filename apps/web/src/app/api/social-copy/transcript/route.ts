import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { FFmpegService } from "@/media/ffmpeg";
import {
	FasterWhisperTranscriptionProvider,
	GeminiTranscriptionProvider,
	WhisperTranscriptionProvider,
	type TranscriptionProvider,
} from "@/providers/transcription";
import { TranscriptSegmentSchema } from "@/localization/schemas";
import { getSocialTranscriptContent, getSocialTranscriptionPrompt } from "@/social-copy/policy";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(request: NextRequest) {
	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return NextResponse.json({ error: "Dữ liệu âm thanh gửi lên không hợp lệ." }, { status: 400 });
	}
	let directory: string | undefined;
	try {
		const audio = form.get("audio");
		if (!(audio instanceof File) || audio.size === 0) {
			return NextResponse.json({ error: "Chưa có âm thanh video để nhận diện." }, { status: 400 });
		}
		if (audio.size > 25 * 1024 * 1024) {
			return NextResponse.json({ error: "Âm thanh vượt quá 25 MB. Hãy chia video thành các đoạn ngắn hơn." }, { status: 413 });
		}
		request.signal.throwIfAborted();
		const root = path.join(process.cwd(), ".local_storage", "social-copy");
		await fs.mkdir(root, { recursive: true });
		directory = await fs.mkdtemp(path.join(root, "transcript-"));
		const input = path.join(directory, "timeline.webm");
		const output = path.join(directory, "speech.mp3");
		await fs.writeFile(input, Buffer.from(await audio.arrayBuffer()));
		await FFmpegService.runCommand("ffmpeg", [
			"-y", "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", output,
		], { signal: request.signal });
		const provider: TranscriptionProvider = process.env.GEMINI_API_KEY?.trim()
			? new GeminiTranscriptionProvider({ prompt: await getSocialTranscriptionPrompt() })
			: process.env.OPENAI_API_KEY?.trim()
				? new WhisperTranscriptionProvider()
				: new FasterWhisperTranscriptionProvider();
		const segments = TranscriptSegmentSchema.array().parse(await provider.transcribe(output));
		request.signal.throwIfAborted();
		const content = await getSocialTranscriptContent(segments);
		if (!content) {
			return NextResponse.json({ error: "Không tìm thấy lời thoại. Hãy thêm phụ đề hoặc nhập mô tả nội dung video." }, { status: 422 });
		}
		return NextResponse.json({ content });
	} catch (error) {
		return NextResponse.json({
			error: error instanceof Error ? error.message : "Không thể nhận diện lời thoại video.",
		}, { status: 502 });
	} finally {
		if (directory) await fs.rm(directory, { recursive: true, force: true });
	}
}
