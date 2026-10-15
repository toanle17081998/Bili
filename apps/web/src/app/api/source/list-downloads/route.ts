import fs from "node:fs/promises";
import { NextRequest } from "next/server";
import {
	getDownloadThumbnail,
	listDownloadedVideos,
	SplitRequestError,
} from "@/split-video/server";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
	try {
		const thumbnail = request.nextUrl.searchParams.get("thumbnail");
		if (thumbnail)
			return new Response(
				new Uint8Array(
					await fs.readFile(await getDownloadThumbnail({ id: thumbnail })),
				),
				{
					headers: {
						"Content-Type": "image/jpeg",
						"Cache-Control": "private, max-age=300",
					},
				},
			);
		return Response.json(
			{
				success: true,
				...(await listDownloadedVideos({ signal: request.signal })),
			},
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch (error: unknown) {
		console.error("List downloaded videos failed:", error);
		return Response.json(
			{
				success: false,
				error:
					error instanceof SplitRequestError
						? error.message
						: "Không đọc được video đã tải. Kiểm tra FFmpeg và thử lại.",
			},
			{ status: error instanceof SplitRequestError ? error.status : 500 },
		);
	}
}
