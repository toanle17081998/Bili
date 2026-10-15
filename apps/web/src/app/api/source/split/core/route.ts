import { readSplitWasm } from "@/split-video/server-core";

export const runtime = "nodejs";
export async function GET() {
	try {
		return new Response(new Uint8Array(await readSplitWasm()), {
			headers: {
				"Content-Type": "application/wasm",
				"Cache-Control": "no-cache",
			},
		});
	} catch {
		return Response.json(
			{ error: "Chưa có module chia video. Chạy bun run build:split-video." },
			{ status: 503 },
		);
	}
}
