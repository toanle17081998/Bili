import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url);
	const filePath = searchParams.get("file");

	if (!filePath) {
		return new NextResponse("File parameter required", { status: 400 });
	}

	try {
		const stat = fs.statSync(filePath);
		const fileSize = stat.size;
		const range = request.headers.get("range");

		const ext = path.extname(filePath).toLowerCase();
		let contentType = "video/mp4";
		if (ext === ".mp3") contentType = "audio/mpeg";
		if (ext === ".wav") contentType = "audio/wav";

		if (range) {
			const parts = range.replace(/bytes=/, "").split("-");
			const start = parseInt(parts[0], 10);
			const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
			const chunksize = end - start + 1;
			const file = fs.createReadStream(filePath, { start, end });

			const head = {
				"Content-Range": `bytes ${start}-${end}/${fileSize}`,
				"Accept-Ranges": "bytes",
				"Content-Length": chunksize.toString(),
				"Content-Type": contentType,
			};

			// @ts-ignore
			return new NextResponse(file, { status: 206, headers: head });
		} else {
			const head = {
				"Content-Length": fileSize.toString(),
				"Content-Type": contentType,
				"Accept-Ranges": "bytes",
			};
			const file = fs.createReadStream(filePath);
			// @ts-ignore
			return new NextResponse(file, { status: 200, headers: head });
		}
	} catch (err: any) {
		console.error("Stream file error:", err);
		return new NextResponse("File not found or unreadable", { status: 404 });
	}
}
