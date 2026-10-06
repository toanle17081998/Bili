import { NextRequest, NextResponse } from "next/server";
import { BilibiliProvider } from "@/source/bilibili";
import { BilibiliSearchError } from "@/source/bilibili/search-transport";

export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url);
	const query = searchParams.get("q")?.trim() || "";
	const rawPage = Number(searchParams.get("page") ?? "1");
	const page = !Number.isSafeInteger(rawPage) || rawPage < 1 ? 1 : rawPage;

	if (!query) {
		return NextResponse.json({
			success: true,
			results: [],
			page: 1,
			pageSize: 20,
			total: 0,
			totalPages: 0,
		});
	}

	try {
		const provider = new BilibiliProvider();
		const result = await provider.search(query, page);
		return NextResponse.json({
			success: true,
			...result,
		});
	} catch (error: unknown) {
		console.error(
			"Search API error:",
			error instanceof BilibiliSearchError
				? {
						status: error.status,
						upstreamCode: error.upstreamCode,
						message: error.message,
					}
				: error instanceof Error
					? error.message
					: "Unknown error",
		);
		return NextResponse.json(
			{
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to search videos",
			},
			{
				status: error instanceof BilibiliSearchError ? error.status : 500,
				headers:
					error instanceof BilibiliSearchError && error.status === 429
						? { "Retry-After": "30" }
						: undefined,
			},
		);
	}
}
