import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { loadDubbingTiming } from "@/localization/timing";
import { TranscriptSegmentSchema, type TranscriptSegment, type TranslationSegment } from "@/localization/schemas";

const RowSchema = z.object({
	id: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/).transform(Number)]).optional(),
	vietnameseText: z.string().trim().min(1),
	sourceText: z.string().optional(),
	sourceStart: z.number().finite().optional(),
	sourceEnd: z.number().finite().optional(),
});
const CacheSchema = z.object({ vietnameseText: z.string().trim().min(1) });
export type TranslationRow = z.infer<typeof RowSchema>;
export interface TranslationInput { id: number; source: TranscriptSegment; }
export class TranslationResponseError extends Error {}

export function decodeTranslationRows(raw: unknown): TranslationRow[] {
	if (typeof raw !== "string" || !raw.trim()) throw new TranslationResponseError("LLM trả về nội dung dịch trống.");
	const clean = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
	let decoded: unknown;
	try { decoded = JSON.parse(clean); }
	catch {
		// Preserve completed rows when the provider truncates the enclosing JSON.
		const rows: TranslationRow[] = [];
		const starts: number[] = [];
		let quoted = false;
		let escaped = false;
		for (let index = 0; index < clean.length; index++) {
			const char = clean[index];
			if (quoted) {
				if (escaped) escaped = false;
				else if (char === "\\") escaped = true;
				else if (char === '"') quoted = false;
				continue;
			}
			if (char === '"') quoted = true;
			else if (char === "{") starts.push(index);
			else if (char === "}") {
				const start = starts.pop();
				if (start === undefined) continue;
				try {
					const row = RowSchema.safeParse(JSON.parse(clean.slice(start, index + 1)));
					if (row.success) rows.push(row.data);
				} catch { /* An unfinished/invalid row is requested again separately. */ }
			}
		}
		if (rows.length) return rows;
		throw new TranslationResponseError("LLM trả JSON bị cắt ngắn hoặc không hợp lệ.");
	}
	let candidates: unknown[];
	if (Array.isArray(decoded)) candidates = decoded;
	else if (decoded && typeof decoded === "object") {
		const segments = Reflect.get(decoded, "segments");
		const translations = Reflect.get(decoded, "translations");
		if (Array.isArray(segments)) candidates = segments;
		else if (Array.isArray(translations)) candidates = translations;
		else candidates = [decoded];
	} else candidates = [];
	const rows = candidates.flatMap((candidate) => {
		const row = RowSchema.safeParse(candidate);
		return row.success ? [row.data] : [];
	});
	if (!rows.length) throw new TranslationResponseError("LLM không trả danh sách đoạn dịch hợp lệ.");
	return rows;
}

export async function translationPrompt({ inputs, context }: { inputs: TranslationInput[]; context: string[] }) {
	const policy = await loadDubbingTiming();
	const instructions = new TextDecoder().decode(new Uint8Array(
		policy.memory.buffer, policy.translation_llm_prompt_ptr(), policy.translation_llm_prompt_len(),
	));
	return instructions + JSON.stringify({
		context,
		segments: inputs.map(({ id, source }) => ({ id, text: source.text, targetDuration: source.end - source.start })),
	});
}

async function mappedRows({ rows, inputs }: { rows: TranslationRow[]; inputs: TranslationInput[] }) {
	const policy = await loadDubbingTiming();
	const results = new Map<number, string>();
	const duplicates = new Set<number>();
	for (const row of rows) {
		let match: TranslationInput | undefined;
		if (row.id !== undefined) match = inputs.find((input) => input.id === row.id);
		else if (row.sourceText !== undefined) {
			const matches = inputs.filter(({ source }) => source.text.trim() === row.sourceText?.trim() &&
				(row.sourceStart === undefined || row.sourceEnd === undefined ||
					policy.translation_llm_same_span(source.start, source.end, row.sourceStart, row.sourceEnd)));
			if (matches.length === 1) match = matches[0];
		} else if (inputs.length === 1) match = inputs[0];
		if (!match || duplicates.has(match.id)) continue;
		if (row.sourceText !== undefined && row.sourceText.trim() !== match.source.text.trim()) continue;
		if (results.has(match.id)) {
			duplicates.add(match.id);
			results.delete(match.id);
		} else results.set(match.id, row.vietnameseText);
	}
	return results;
}

export async function translateInBatches({
	segments,
	request,
	namespace,
	cacheDirectory = path.join(process.cwd(), ".local_storage", "translations", "llm"),
}: {
	segments: TranscriptSegment[];
	request: (options: { inputs: TranslationInput[]; context: string[] }) => Promise<TranslationRow[]>;
	namespace: string;
	cacheDirectory?: string | false;
}): Promise<TranslationSegment[]> {
	TranscriptSegmentSchema.array().parse(segments);
	if (!segments.length) return [];
	if (segments.some((source) => source.end <= source.start || !source.text.trim())) throw new Error("Đoạn lời thoại gốc hoặc thời gian không hợp lệ.");
	const policy = await loadDubbingTiming();
	const inputs = segments.map((source, id) => ({ id, source }));
	const completed = new Map<number, string>();
	const cacheFile = (input: TranslationInput) => path.join(cacheDirectory || "", `${createHash("sha256")
		.update(`${namespace}:v2\0${input.source.end - input.source.start}\0${input.source.text}`).digest("hex")}.json`);
	if (cacheDirectory) {
		for (const input of inputs) {
			try {
				const cached = CacheSchema.parse(JSON.parse(await fs.readFile(cacheFile(input), "utf8")));
				completed.set(input.id, cached.vietnameseText);
			} catch { /* Missing/invalid cached rows are translated again. */ }
		}
	}
	const store = async (results: Map<number, string>) => {
		for (const [id, vietnameseText] of results) {
			completed.set(id, vietnameseText);
			if (!cacheDirectory) continue;
			const file = cacheFile(inputs[id]);
			const temporary = `${file}.${randomUUID()}.tmp`;
			try {
				await fs.mkdir(cacheDirectory, { recursive: true });
				await fs.writeFile(temporary, JSON.stringify({ vietnameseText }));
				await fs.rename(temporary, file);
			} catch {
				console.warn("Không lưu được cache bản dịch LLM; vẫn dùng bản dịch đã nhận.");
			} finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
		}
	};
	const translate = async (batch: TranslationInput[]) => {
		const first = batch[0].id;
		const last = batch[batch.length - 1].id;
		const context = [segments[first - 1]?.text, segments[last + 1]?.text].filter((text): text is string => !!text);
		try { await store(await mappedRows({ rows: await request({ inputs: batch, context }), inputs: batch })); }
		catch (error) { if (!(error instanceof TranslationResponseError)) throw error; }
	};
	const pending = inputs.filter((input) => !completed.has(input.id));
	for (let offset = 0; offset < pending.length;) {
		const batch: TranslationInput[] = [];
		let chars = 0;
		while (offset < pending.length && policy.translation_llm_batch_can_add(batch.length, chars, pending[offset].source.text.length)) {
			const input = pending[offset++];
			batch.push(input);
			chars += input.source.text.length;
		}
		await translate(batch);
		for (const input of batch) {
			for (let attempt = 0; !completed.has(input.id) && attempt < policy.translation_llm_repair_attempts(); attempt++) {
				await translate([input]);
			}
			if (!completed.has(input.id)) throw new Error(
				`LLM chưa dịch được đoạn ${input.id + 1} tại ${input.source.start.toFixed(1)}s. Kiểm tra model/dịch vụ LLM hoặc thử lại; các đoạn đã dịch được lưu cache.`,
			);
		}
	}
	return inputs.map(({ id, source }) => ({
		sourceStart: source.start, sourceEnd: source.end, sourceText: source.text,
		vietnameseText: completed.get(id)!, targetDuration: source.end - source.start,
	}));
}
