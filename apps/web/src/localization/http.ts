import { NarrationError } from "./narration";
import { loadDubbingTiming } from "./timing";

export async function readLocalizationRequest(
	request: Request,
): Promise<unknown> {
	const limit = (await loadDubbingTiming()).narration_request_max_bytes();
	if (Number(request.headers.get("content-length")) > limit)
		throw new NarrationError("Yêu cầu vượt quá giới hạn nội dung.", 413);
	if (!request.body) throw new NarrationError("Yêu cầu trống.", 400);
	const reader = request.body.getReader();
	const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
	const abort = () => {
		void reader.cancel(signal.reason).catch(() => undefined);
	};
	signal.addEventListener("abort", abort, { once: true });
	let total = 0;
	const chunks: Uint8Array[] = [];
	try {
		while (true) {
			if (signal.aborted)
				throw new NarrationError("Đã dừng nhận yêu cầu.", 408);
			const chunk = await reader.read();
			if (signal.aborted)
				throw new NarrationError("Đã dừng nhận yêu cầu.", 408);
			if (chunk.done) break;
			total += chunk.value.byteLength;
			if (total > limit) {
				await reader.cancel();
				throw new NarrationError("Yêu cầu vượt quá giới hạn nội dung.", 413);
			}
			chunks.push(chunk.value);
		}
		try {
			return JSON.parse(Buffer.concat(chunks).toString("utf8"));
		} catch {
			throw new NarrationError("Yêu cầu JSON không hợp lệ.", 400);
		}
	} finally {
		signal.removeEventListener("abort", abort);
		reader.releaseLock();
	}
}
