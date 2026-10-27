import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readLocalizationRequest } from "@/localization/http";
import { NarrationError } from "@/localization/narration";
import { storyEngine } from "@/story-narrator/engine";
import type { StoryDefaults } from "@/story-narrator/types";
import {
	cancelStoryJob,
	editStoryProject,
	getStoryState,
	startStoryJob,
	StoryRequestError,
} from "@/story-narrator/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const projectIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const requestSchema = z.object({
	projectId: projectIdSchema,
	action: z.enum(["analyze", "story", "review", "tts", "rewrite", "render"]),
	videoPath: z.string().max(4000).optional(),
	sourceSignature: z.string().max(4000).optional(),
	timelineStart: z.number().nonnegative().optional(),
	sourceElementId: z.string().max(128).optional(),
	settings: z.record(z.string(), z.unknown()).optional(),
	voice: z.string().min(1).max(200).optional(),
	segmentId: z.string().max(128).optional(),
	revision: z.number().int().nonnegative().optional(),
	mix: z
		.object({
			original_volume: z.number().min(0).max(2),
			voice_volume: z.number().min(0).max(2),
			ducking: z.boolean(),
			quality: z.enum(["preview", "standard", "high"]),
		})
		.optional(),
});
function failure(error: unknown) {
	return NextResponse.json(
		{
			success: false,
			error:
				error instanceof Error ? error.message : "Không xử lý được yêu cầu.",
		},
		{
			status:
				error instanceof StoryRequestError || error instanceof NarrationError
					? error.status
					: error instanceof z.ZodError
						? 400
						: 422,
		},
	);
}
async function readRequest(request: NextRequest) {
	const defaults = await storyEngine<StoryDefaults>({ operation: "defaults" });
	return readLocalizationRequest({
		request,
		maxBytes: defaults.limits.request_max_bytes,
	});
}
export async function GET(request: NextRequest) {
	try {
		const projectId = projectIdSchema.parse(
			request.nextUrl.searchParams.get("projectId"),
		);
		return NextResponse.json(
			{ success: true, ...(await getStoryState(projectId)) },
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch (error) {
		return failure(error);
	}
}
export async function POST(request: NextRequest) {
	try {
		const input = requestSchema.parse(await readRequest(request));
		return NextResponse.json(
			{ success: true, job: await startStoryJob({ input }) },
			{ status: 202 },
		);
	} catch (error) {
		return failure(error);
	}
}
export async function PATCH(request: NextRequest) {
	try {
		const input = z
			.object({
				projectId: projectIdSchema,
				revision: z.number().int().nonnegative(),
				segmentId: z.string().max(128).optional(),
				patch: z.record(z.string(), z.unknown()).optional(),
				story: z.record(z.string(), z.unknown()).optional(),
			})
			.parse(await readRequest(request));
		if (!input.story && (!input.segmentId || !input.patch))
			throw new StoryRequestError("Thiếu nội dung chỉnh sửa.", 400);
		const project = await editStoryProject(input);
		return NextResponse.json({ success: true, project });
	} catch (error) {
		return failure(error);
	}
}
export async function DELETE(request: NextRequest) {
	try {
		const projectId = projectIdSchema.parse(
			request.nextUrl.searchParams.get("projectId"),
		);
		await cancelStoryJob(projectId);
		return NextResponse.json({ success: true });
	} catch (error) {
		return failure(error);
	}
}
