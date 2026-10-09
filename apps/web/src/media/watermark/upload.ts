export class UploadLimitError extends Error {}

export async function readWatermarkUpload({
	request,
	maxBytes,
	signal,
	limitMessage = "Video vượt quá 256 MB.",
}: {
	request: Request;
	maxBytes: number;
	signal: AbortSignal;
	limitMessage?: string;
}) {
	signal.throwIfAborted();
	if (!request.body) throw new Error("Missing upload body");
	const reader = request.body.getReader();
	let total = 0;
	let onAbort: () => void;
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			onAbort = () => {
				void reader.cancel(signal.reason).catch(() => undefined);
				controller.error(signal.reason);
			};
			signal.addEventListener("abort", onAbort, { once: true });
		},
		async pull(controller) {
			try {
				const chunk = await reader.read();
				signal.throwIfAborted();
				if (chunk.done) {
					signal.removeEventListener("abort", onAbort);
					controller.close();
					return;
				}
				total += chunk.value.byteLength;
				if (total > maxBytes)
					throw new UploadLimitError(limitMessage);
				controller.enqueue(chunk.value);
			} catch (error) {
				signal.removeEventListener("abort", onAbort);
				void reader.cancel(error).catch(() => undefined);
				controller.error(error);
			}
		},
		cancel(reason) {
			signal.removeEventListener("abort", onAbort);
			return reader.cancel(reason);
		},
	});
	return new Response(stream, {
		headers: { "content-type": request.headers.get("content-type") ?? "" },
	}).formData();
}
