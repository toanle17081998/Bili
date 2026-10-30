import { NextRequest, NextResponse } from "next/server";
import { BilibiliProvider } from "@/source/bilibili";

export async function GET(request: NextRequest) {
	const id = request.nextUrl.searchParams.get("id") || "";
	if (!/^BV[a-zA-Z0-9]{10}$/.test(id)) {
		return NextResponse.json(
			{ success: false, error: "Invalid video id" },
			{ status: 400 },
		);
	}
	try {
		const qualities = await new BilibiliProvider().getQualities(id);
		return NextResponse.json({ success: true, qualities });
	} catch (error: any) {
		console.error("Qualities API error:", error);
		return NextResponse.json(
			{ success: false, error: error.message || "Failed to load qualities" },
			{ status: 500 },
		);
	}
}
