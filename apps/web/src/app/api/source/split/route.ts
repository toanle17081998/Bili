import { NextRequest } from "next/server";
import { z } from "zod";
import { SplitValidationError } from "@/split-video/core";
import {
	openSplitPart,
	removeSplitBatch,
	SplitRequestError,
} from "@/split-video/server";
import {
	checkpointSplitProject,
	completeSplitJob,
	discardSplitJob,
	getSplitJob,
	listSplitJobs,
	pauseSplitJob,
	saveSplitDraft,
	startSplitJob,
} from "@/split-video/jobs";

export const runtime = "nodejs";
const inputSchema = z.object({
	batchId: z.uuid(),
	sourceVideoPath: z.string().min(1).max(4096),
	cuts: z.array(z.number().finite()).min(1).max(99),
	baseName: z.string().trim().min(1).max(1000).default("Video"),
});

function errorResponse({
	error,
	signal,
}: {
	error: unknown;
	signal?: AbortSignal;
}) {
	const status =
		error instanceof SplitRequestError
			? error.status
			: error instanceof SplitValidationError
				? 400
				: signal?.aborted
					? 408
					: 500;
	if (status === 500) console.error("Video splitting failed:", error);
	return Response.json(
		{
			success: false,
			error:
				error instanceof SplitRequestError ||
				error instanceof SplitValidationError
					? error.message
					: signal?.aborted
						? "Đã hủy chia video."
						: "Không chia được video. Kiểm tra FFmpeg và thử lại.",
		},
		{ status },
	);
}

export async function POST(request: NextRequest) {
	try {
		const parsed = inputSchema.safeParse(
			await request.json().catch(() => null),
		);
		if (!parsed.success)
			throw new SplitRequestError({
				message: "Video hoặc danh sách điểm cắt không hợp lệ.",
			});
		const job = await startSplitJob({
			...parsed.data,
			origin: request.nextUrl.origin,
		});
		return Response.json({ success: true, job }, { status: 202 });
	} catch (error: unknown) {
		return errorResponse({ error, signal: request.signal });
	}
}

export async function DELETE(request: NextRequest) {
	try {
		if (request.nextUrl.searchParams.get("discard") === "1") {
			await discardSplitJob({
				batchId: request.nextUrl.searchParams.get("batchId") ?? "",
				origin: request.nextUrl.origin,
			});
			return Response.json({ success: true });
		}
		await removeSplitBatch({
			batchId: request.nextUrl.searchParams.get("batchId") ?? "",
		});
		return Response.json({ success: true });
	} catch (error: unknown) {
		return errorResponse({ error });
	}
}

export async function GET(request: NextRequest) {
	try {
		if (request.nextUrl.searchParams.get("jobs") === "1")
			return Response.json(
				{
					success: true,
					jobs: await listSplitJobs({ origin: request.nextUrl.origin }),
				},
				{ headers: { "Cache-Control": "no-store" } },
			);
		if (!request.nextUrl.searchParams.has("part"))
			return Response.json(
				{
					success: true,
					job: await getSplitJob({
						batchId: request.nextUrl.searchParams.get("batchId") ?? "",
						origin: request.nextUrl.origin,
					}),
				},
				{ headers: { "Cache-Control": "no-store" } },
			);
		const part = Number(request.nextUrl.searchParams.get("part"));
		const handle = await openSplitPart({
			batchId: request.nextUrl.searchParams.get("batchId") ?? "",
			part,
		});
		const stat = await handle.stat();
		let position = 0;
		const stream = new ReadableStream<Uint8Array>({
			async pull(controller) {
				try {
					const buffer = new Uint8Array(64 * 1024);
					const { bytesRead } = await handle.read(
						buffer,
						0,
						buffer.length,
						position,
					);
					if (!bytesRead) {
						await handle.close();
						controller.close();
						return;
					}
					position += bytesRead;
					controller.enqueue(buffer.subarray(0, bytesRead));
				} catch (error) {
					await handle.close();
					controller.error(error);
				}
			},
			async cancel() {
				await handle.close();
			},
		});
		return new Response(stream, {
			headers: {
				"Content-Type": "video/mp4",
				"Content-Length": String(stat.size),
				"Cache-Control": "no-store",
				"Content-Disposition": `attachment; filename="part-${part}.mp4"`,
			},
		});
	} catch (error: unknown) {
		return errorResponse({ error });
	}
}

export async function PUT(request: NextRequest) {
	try {
		const parsed = inputSchema
			.extend({
				cuts: z.array(z.number().finite()).max(99),
				baseName: z.string().max(1000),
				revision: z.number().int().nonnegative(),
				baseRevision: z.number().int().nonnegative().optional(),
				editorId: z.uuid().optional(),
				draftStep: z.enum(["cuts", "confirm"]),
			})
			.safeParse(await request.json().catch(() => null));
		if (!parsed.success)
			throw new SplitRequestError({
				message: "Bản nháp điểm cắt không hợp lệ.",
			});
		const job = await saveSplitDraft({
			...parsed.data,
			origin: request.nextUrl.origin,
		});
		return Response.json({ success: true, job });
	} catch (error: unknown) {
		return errorResponse({ error });
	}
}

export async function PATCH(request: NextRequest) {
	try {
		const parsed = z
			.discriminatedUnion("action", [
				z.object({
					action: z.literal("checkpoint"),
					batchId: z.uuid(),
					project: z.object({
						id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
						index: z.number().int().positive(),
						name: z.string().max(2000),
					}),
				}),
				z.object({ action: z.literal("complete"), batchId: z.uuid() }),
				z.object({ action: z.literal("pause"), batchId: z.uuid() }),
			])
			.safeParse(await request.json().catch(() => null));
		if (!parsed.success)
			throw new SplitRequestError({
				message: "Thao tác chia video không hợp lệ.",
			});
		const { batchId, action } = parsed.data;
		const origin = request.nextUrl.origin;
		const job =
			action === "checkpoint"
				? await checkpointSplitProject({
						batchId,
						origin,
						project: parsed.data.project,
					})
				: action === "complete"
					? await completeSplitJob({ batchId, origin })
					: await pauseSplitJob({ batchId, origin });
		return Response.json({ success: true, job });
	} catch (error: unknown) {
		return errorResponse({ error });
	}
}
