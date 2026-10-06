import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url);
	const id = searchParams.get("id");

	if (!id) {
		return new NextResponse("Video ID is required", { status: 400 });
	}

	const range = request.headers.get("range");

	// 1. Check if video already exists in local downloads cache
	const localFile = path.join(process.cwd(), ".local_storage", "downloads", `${id}.mp4`);
	if (fs.existsSync(localFile)) {
		try {
			const stat = fs.statSync(localFile);
			if (stat.size > 50000) {
				const fileSize = stat.size;
				if (range) {
					const parts = range.replace(/bytes=/, "").split("-");
					const start = parseInt(parts[0], 10);
					const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
					const chunksize = end - start + 1;
					const fileStream = fs.createReadStream(localFile, { start, end });
					const head = {
						"Content-Range": `bytes ${start}-${end}/${fileSize}`,
						"Accept-Ranges": "bytes",
						"Content-Length": chunksize.toString(),
						"Content-Type": "video/mp4",
					};
					// @ts-ignore
					return new NextResponse(fileStream, { status: 206, headers: head });
				} else {
					const head = {
						"Content-Length": fileSize.toString(),
						"Content-Type": "video/mp4",
						"Accept-Ranges": "bytes",
					};
					const fileStream = fs.createReadStream(localFile);
					// @ts-ignore
					return new NextResponse(fileStream, { status: 200, headers: head });
				}
			}
		} catch (err) {
			console.warn("Failed to stream from local file, falling back to upstream:", err);
		}
	}

	// 2. Fetch live stream URL from Bilibili API
	try {
		const viewRes = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${id}`, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				Referer: "https://www.bilibili.com/",
			},
		});

		if (!viewRes.ok) {
			return new NextResponse("Failed to fetch Bilibili video details", { status: 502 });
		}

		const viewData = await viewRes.json();
		const cid = viewData.data?.cid;
		if (!cid) {
			return new NextResponse("Video CID not found on Bilibili", { status: 404 });
		}

		const playRes = await fetch(
			`https://api.bilibili.com/x/player/playurl?bvid=${id}&cid=${cid}&qn=16`,
			{
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
					Referer: "https://www.bilibili.com/",
				},
			},
		);

		if (!playRes.ok) {
			return new NextResponse("Failed to fetch stream URL from Bilibili", { status: 502 });
		}

		const playData = await playRes.json();
		const streamUrl = playData.data?.durl?.[0]?.url;

		if (!streamUrl) {
			return new NextResponse("No stream URL available", { status: 404 });
		}

		const upstreamHeaders: HeadersInit = {
			"User-Agent":
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			Referer: "https://www.bilibili.com/",
		};
		if (range) {
			upstreamHeaders["Range"] = range;
		}

		const upstreamRes = await fetch(streamUrl, {
			headers: upstreamHeaders,
		});

		const responseHeaders = new Headers();
		responseHeaders.set("Content-Type", "video/mp4");
		responseHeaders.set("Accept-Ranges", "bytes");

		const contentRange = upstreamRes.headers.get("content-range");
		if (contentRange) responseHeaders.set("Content-Range", contentRange);

		const contentLength = upstreamRes.headers.get("content-length");
		if (contentLength) responseHeaders.set("Content-Length", contentLength);

		return new Response(upstreamRes.body, {
			status: upstreamRes.status,
			headers: responseHeaders,
		});
	} catch (error: any) {
		console.error("Video preview streaming error:", error);
		return new NextResponse(`Streaming error: ${error.message}`, { status: 500 });
	}
}
