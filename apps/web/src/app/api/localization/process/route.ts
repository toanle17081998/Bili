import { NextRequest, NextResponse } from "next/server";
import { LocalizationPipeline } from "@/localization/pipeline";
import path from "path";

export async function POST(request: NextRequest) {
	try {
		const { projectId, videoPath, voice } = await request.json();

		if (!projectId || !videoPath) {
			return NextResponse.json(
				{ success: false, error: "Missing projectId or videoPath" },
				{ status: 400 },
			);
		}

		const workDir = path.join(process.cwd(), ".local_storage", "projects");
		const pipeline = new LocalizationPipeline();

		const result = await pipeline.run({
			projectId,
			videoPath,
			workDir,
			voice: voice || "vi-VN-HoaiMyNeural",
		});

		return NextResponse.json({
			success: true,
			localizedProject: result,
		});
	} catch (error: any) {
		console.error("Localization process API error:", error);
		return NextResponse.json(
			{
				success: false,
				error: error.message || "Failed to run Vietnamese localization pipeline",
			},
			{ status: 500 },
		);
	}
}
