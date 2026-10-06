import { NextRequest, NextResponse } from "next/server";
import { BilibiliProvider } from "@/source/bilibili";

export async function POST(request: NextRequest) {
	try {
		const { id } = await request.json();
		if (!id) {
			return NextResponse.json(
				{ success: false, error: "Missing video id" },
				{ status: 400 },
			);
		}

		const provider = new BilibiliProvider();
		const imported = await provider.importVideo(id);

		return NextResponse.json({
			success: true,
			importedVideo: {
				...imported,
				streamUrl: `/api/media/stream?file=${encodeURIComponent(imported.localMediaPath)}`,
			},
		});
	} catch (error: any) {
		console.error("Import API error:", error);
		return NextResponse.json(
			{ success: false, error: error.message || "Failed to import video" },
			{ status: 500 },
		);
	}
}
