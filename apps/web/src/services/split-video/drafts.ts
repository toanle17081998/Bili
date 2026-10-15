import { z } from "zod";
import type { DownloadedVideo, SplitJob } from "@/split-video/types";
import { generateUUID } from "@/utils/id";

const KEY = "opencut-split-drafts-v1";
const forkIds = new Map<string, string>();
export const SPLIT_DRAFTS_EVENT = "opencut-split-drafts-changed";
const schema = z.object({
	batchId: z.uuid(),
	video: z.object({
		id: z.string(),
		name: z.string(),
		path: z.string(),
		duration: z.number().positive(),
		width: z.number(),
		height: z.number(),
		fps: z.number(),
		hasAudio: z.boolean(),
		size: z.number(),
		streamUrl: z.string(),
		thumbnailUrl: z.string(),
	}),
	cuts: z
		.array(z.object({ id: z.string(), time: z.number().finite() }))
		.max(99),
	baseName: z.string(),
	step: z.enum(["cuts", "confirm"]),
	revision: z.number().int().nonnegative(),
	baseRevision: z.number().int().nonnegative().optional(),
	localBaseRevision: z.number().int().nonnegative().optional(),
	editorId: z.uuid().optional(),
});
export interface SplitDraft {
	batchId: string;
	video: DownloadedVideo;
	cuts: { id: string; time: number }[];
	baseName: string;
	step: "cuts" | "confirm";
	revision: number;
	baseRevision?: number;
	localBaseRevision?: number;
	editorId?: string;
}
export function readSplitDrafts(): SplitDraft[] {
	if (typeof window === "undefined") return [];
	try {
		const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
		if (!Array.isArray(raw)) return [];
		return raw
			.flatMap((item) => {
				const parsed = schema.safeParse(item);
				return parsed.success ? [parsed.data] : [];
			})
			.sort((a, b) => b.revision - a.revision);
	} catch {
		return [];
	}
}
function writeSplitDraftLocked({ draft }: { draft: SplitDraft }) {
	const current = readSplitDrafts().find(
		(item) => item.batchId === draft.batchId,
	);
	if (
		current &&
		current.video.path === draft.video.path &&
		current.baseName === draft.baseName &&
		current.step === draft.step &&
		JSON.stringify(current.cuts.map((cut) => cut.time)) ===
			JSON.stringify(draft.cuts.map((cut) => cut.time))
	)
		return current;
	if (
		current &&
		current.editorId !== draft.editorId &&
		current.revision !== (draft.localBaseRevision ?? draft.baseRevision)
	) {
		const forkKey = `${draft.batchId}:${draft.editorId}`;
		const forkId = forkIds.get(forkKey) ?? generateUUID();
		forkIds.set(forkKey, forkId);
		draft = { ...draft, batchId: forkId, baseRevision: 0 };
	}
	const drafts = readSplitDrafts().filter(
		(item) => item.batchId !== draft.batchId,
	);
	const stored = { ...draft, revision: Math.max(Date.now(), draft.revision) };
	localStorage.setItem(KEY, JSON.stringify([stored, ...drafts]));
	window.dispatchEvent(new Event(SPLIT_DRAFTS_EVENT));
	return stored;
}
function removeSplitDraftLocked({ batchId }: { batchId: string }) {
	localStorage.setItem(
		KEY,
		JSON.stringify(
			readSplitDrafts().filter((item) => item.batchId !== batchId),
		),
	);
	window.dispatchEvent(new Event(SPLIT_DRAFTS_EVENT));
}
export async function writeSplitDraft(
	options: Parameters<typeof writeSplitDraftLocked>[0],
) {
	if (!navigator.locks)
		throw new Error(
			"Trình duyệt chưa hỗ trợ khóa lưu bản nháp an toàn. Hãy dùng Chrome hoặc Edge hiện hành.",
		);
	return navigator.locks.request("opencut-split-drafts-write", () =>
		writeSplitDraftLocked(options),
	);
}
export async function removeSplitDraft(
	options: Parameters<typeof removeSplitDraftLocked>[0],
) {
	if (!navigator.locks)
		throw new Error("Trình duyệt chưa hỗ trợ khóa lưu bản nháp an toàn.");
	return navigator.locks.request("opencut-split-drafts-write", () =>
		removeSplitDraftLocked(options),
	);
}
export function splitJobToDraft({ job }: { job: SplitJob }): SplitDraft {
	return {
		batchId: job.batchId,
		video: job.video,
		cuts: job.cuts.map((time, index) => ({
			id: `${job.batchId}-${index}`,
			time,
		})),
		baseName: job.baseName,
		step: job.status === "draft" ? job.draftStep : "confirm",
		revision: job.draftRevision,
		baseRevision: job.draftRevision,
		localBaseRevision: job.draftRevision,
		editorId: job.editorId,
	};
}
