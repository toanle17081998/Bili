import type { SceneTracks } from "@/timeline";
import type { MediaAsset } from "@/media/types";

export async function transcribeTimeline({
	tracks,
	mediaAssets,
	duration,
	signal,
	onStatus,
}: {
	tracks: SceneTracks;
	mediaAssets: MediaAsset[];
	duration: number;
	signal: AbortSignal;
	onStatus: (status: string) => void;
}): Promise<string> {
	onStatus("Đang lấy âm thanh từ nội dung trên timeline...");
	const { createAudioContext, createTimelineAudioBuffer, timelineHasAudio } = await import("@/media/audio");
	if (duration <= 0) throw new Error("Chưa có video trên timeline.");
	if (!timelineHasAudio({ tracks, mediaAssets })) {
		throw new Error("Video chưa có lời thoại hoặc audio đang tắt. Hãy thêm phụ đề hoặc nhập mô tả nội dung video.");
	}
	const context = createAudioContext({ sampleRate: 16000 });
	try {
		signal.throwIfAborted();
		const audioBuffer = await createTimelineAudioBuffer({
			tracks, mediaAssets, duration, sampleRate: 16000, audioContext: context,
		});
		signal.throwIfAborted();
		if (!audioBuffer) {
			throw new Error("Video chưa có lời thoại hoặc audio đang tắt. Hãy thêm phụ đề hoặc nhập mô tả nội dung video.");
		}
		onStatus("Đang nhận diện lời thoại để hiểu nội dung video...");
		const { Output, WebMOutputFormat, BufferTarget, AudioBufferSource } = await import("mediabunny");
		const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
		const source = new AudioBufferSource({ codec: "opus", bitrate: 64000 });
		output.addAudioTrack(source);
		try {
			await output.start();
			await source.add(audioBuffer);
			source.close();
			await output.finalize();
		} catch (error) {
			await output.cancel();
			throw error;
		}
		signal.throwIfAborted();
		if (!output.target.buffer) throw new Error("Không thể trích xuất âm thanh video.");
		const form = new FormData();
		form.append("audio", new Blob([output.target.buffer], { type: "audio/webm" }), "timeline.webm");
		const response = await fetch("/api/social-copy/transcript", { method: "POST", body: form, signal });
		const data = await response.json();
		if (!response.ok) throw new Error(data.error || "Không thể nhận diện lời thoại video.");
		if (typeof data.content !== "string" || !data.content.trim()) {
			throw new Error("Không tìm thấy lời thoại. Hãy thêm phụ đề hoặc nhập mô tả nội dung video.");
		}
		return data.content;
	} finally {
		await context.close();
	}
}
