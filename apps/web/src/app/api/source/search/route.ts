import { NextRequest, NextResponse } from "next/server";
import { BilibiliProvider } from "@/source/bilibili";

export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url);
	const query = searchParams.get("q") || "food";

	try {
		const provider = new BilibiliProvider();
		const results = await provider.search(query);
		return NextResponse.json({ success: true, results });
	} catch (error: any) {
		console.error("Search API error:", error);
		return NextResponse.json(
			{ success: false, error: error.message || "Failed to search videos" },
			{ status: 500 },
		);
	}
}
