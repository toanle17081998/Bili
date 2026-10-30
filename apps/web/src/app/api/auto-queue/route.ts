import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isValidQuality } from "@/source/bilibili/quality";
import {
	enqueueAutoJob,
	listAutoJobs,
	removeAutoJob,
	requeueDoneJobs,
	retryAutoJob,
	updateAutoJobOptions,
} from "@/auto-queue/queue-manager";
import {
	getMusicDirectory,
	getOutputDirectory,
	listMusicFiles,
} from "@/auto-queue/music-picker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
	id: z.string().regex(/^BV[a-zA-Z0-9]{10}$/),
	title: z.string().max(300).default(""),
	quality: z.number().refine(isValidQuality).optional(),
	voice: z.string().max(200).default("Hải Đăng"),
	voiceVolume: z.number().min(0).max(2).default(1),
	audioMode: z
		.enum(["mute_original", "keep_sfx_add_music", "keep_original_bgm"])
		.default("mute_original"),
	originalVolume: z.number().min(0).max(2).default(0.35),
	musicFile: z.string().max(260).optional(),
	musicFiles: z.array(z.string().max(260)).max(12).optional(),
	musicVolume: z.number().min(0).max(1).default(0.15),
	subtitleColor: z
		.string()
		.regex(/^#[0-9a-fA-F]{6}$/)
		.default("#FFFF00"),
	subtitleMaxLines: z.number().int().min(1).max(3).default(2),
	removeLogo: z.boolean().default(true),
	coverSubtitle: z.boolean().default(true),
	subtitleBlur: z.number().min(4).max(60).default(30),
	subtitleBgOpacity: z.number().min(0).max(85).default(0),
	subtitleFontSizePx: z.number().min(28).max(80).optional(),
	stripWidthPercent: z.number().min(65).max(100).default(94),
	stripHeightPercent: z.number().min(10).max(35).default(16),
});

export async function GET() {
	const musicDirectory = getMusicDirectory();
	const outputDirectory = getOutputDirectory();
	const [jobs, musicFiles] = await Promise.all([
		listAutoJobs(),
		listMusicFiles({ directory: musicDirectory }),
	]);
	return NextResponse.json(
		{
			success: true,
			jobs,
			musicFiles,
			musicDirectory,
			outputDirectory,
		},
		{ headers: { "Cache-Control": "no-store" } },
	);
}

export async function POST(request: NextRequest) {
	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ success: false, error: "Yêu cầu không hợp lệ." },
			{ status: 400 },
		);
	}
	const { id, title, ...options } = parsed.data;
	const job = await enqueueAutoJob({
		bvid: id,
		title: title || id,
		options,
	});
	return NextResponse.json({ success: true, job }, { status: 202 });
}

export async function DELETE(request: NextRequest) {
	const id = request.nextUrl.searchParams.get("id") ?? "";
	const ok = id ? await removeAutoJob(id) : false;
	return NextResponse.json({ success: ok }, { status: ok ? 200 : 404 });
}

export async function PATCH(request: NextRequest) {
	if (request.nextUrl.searchParams.get("action") === "requeue-done") {
		const count = await requeueDoneJobs();
		return NextResponse.json({ success: true, count });
	}
	const id = request.nextUrl.searchParams.get("id") ?? "";
	if (!id) {
		return NextResponse.json({ success: false }, { status: 400 });
	}
	const rawBody = await request.json().catch(() => null);
	if (rawBody && typeof rawBody === "object") {
		const patchSchema = bodySchema
			.omit({ id: true, title: true })
			.extend({ applyToAllQueued: z.boolean().optional() });
		const parsed = patchSchema.safeParse(rawBody);
		if (!parsed.success) {
			return NextResponse.json(
				{ success: false, error: "Cấu hình không hợp lệ." },
				{ status: 400 },
			);
		}
		const { applyToAllQueued, ...options } = parsed.data;
		const job = await updateAutoJobOptions({
			id,
			options,
			applyToAllQueued,
		});
		return NextResponse.json(
			{ success: !!job, job },
			{ status: job ? 200 : 404 },
		);
	}
	const job = await retryAutoJob(id);
	return NextResponse.json(
		{ success: !!job, job },
		{ status: job ? 200 : 404 },
	);
}
