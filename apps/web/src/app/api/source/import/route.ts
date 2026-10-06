import { NextRequest, NextResponse } from "next/server";
import { BilibiliProvider } from "@/source/bilibili";
import fs from "node:fs/promises";
import path from "node:path";
import type { ImportedVideo } from "@/source/types";

const importsInFlight = new Map<string, Promise<ImportedVideo>>();

async function downloadVideo(id: string) {
	let request = importsInFlight.get(id);
	if (!request) {
		request = (async () => {
			const imported = await new BilibiliProvider().importVideo(id);
			await fs.writeFile(
				`${imported.localMediaPath}.json`,
				JSON.stringify(imported),
				"utf8",
			);
			return imported;
		})();
		importsInFlight.set(id, request);
	}
	try {
		return await request;
	} finally {
		if (importsInFlight.get(id) === request) importsInFlight.delete(id);
	}
}

export async function GET(request: NextRequest) {
	const id = request.nextUrl.searchParams.get("id") || "";
	if (!/^BV[a-zA-Z0-9]{10}$/.test(id)) {
		return NextResponse.json(
			{ success: false, error: "Invalid video id" },
			{ status: 400 },
		);
	}
	let file = path.join(
		process.cwd(),
		".local_storage",
		"downloads",
		`${id}.mp4`,
	);
	let fullVideo = false;
	try {
		const fullFile = path.join(
			process.cwd(),
			".local_storage",
			"downloads",
			`${id}.full.mp4`,
		);
		const fullStat = await fs.stat(fullFile);
		if (fullStat.isFile() && fullStat.size) {
			file = fullFile;
			fullVideo = true;
		}
	} catch {
		/* Keep earlier short imports accessible. */
	}
	try {
		const stat = await fs.stat(file);
		if (!stat.isFile() || !stat.size) throw new Error("Empty video file");
		let metadata = {};
		try {
			metadata = JSON.parse(await fs.readFile(`${file}.json`, "utf8"));
		} catch {
			/* Earlier imports have no manifest. */
		}
		return NextResponse.json({
			success: true,
			importedVideo: {
				provider: "bilibili",
				sourceId: id,
				sourceUrl: `https://www.bilibili.com/video/${id}`,
				title: `Video ${id}`,
				thumbnail: "",
				duration: 0,
				createdAt: stat.mtime.toISOString(),
				...metadata,
				fullVideo,
				localMediaPath: file,
				streamUrl: `/api/media/stream?file=${encodeURIComponent(file)}`,
			},
		});
	} catch {
		return NextResponse.json(
			{
				success: false,
				error:
					"Không tìm thấy video đã tải. Hãy quay lại trang tìm kiếm và import video.",
			},
			{ status: 404 },
		);
	}
}

export async function POST(request: NextRequest) {
	try {
		const { id } = await request.json();
		if (typeof id !== "string" || !/^BV[a-zA-Z0-9]{10}$/.test(id)) {
			return NextResponse.json(
				{ success: false, error: "Missing video id" },
				{ status: 400 },
			);
		}

		const imported = await downloadVideo(id);

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
