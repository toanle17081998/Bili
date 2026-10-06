import type { TranscriptSegment, TranslationSegment } from "@/localization/schemas";
import type { LLMProvider } from "./index";

export class FreeTranslateLLMProvider implements LLMProvider {
	readonly name = "free-translate";

	async translateAndRewrite(
		segments: TranscriptSegment[],
	): Promise<TranslationSegment[]> {
		const results: TranslationSegment[] = [];

		for (const seg of segments) {
			const text = seg.text.trim();
			if (!text) continue;

			let vietnameseText = "";
			try {
				const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
				const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
				if (!res.ok) throw new Error(`Translation HTTP ${res.status}`);
				if (res.ok) {
					const data = await res.json();
					if (Array.isArray(data?.[0])) {
						vietnameseText = data[0].map((item: any) => item[0]).join("").trim();
					}
				}
			} catch (err) {
				throw new Error("Không thể dịch lời thoại sang tiếng Việt. Vui lòng thử lại.", { cause: err });
			}
			if (!vietnameseText) throw new Error("Bản dịch trả về trống.");

			results.push({
				sourceStart: seg.start,
				sourceEnd: seg.end,
				sourceText: text,
				vietnameseText,
				targetDuration: Number((seg.end - seg.start).toFixed(2)),
			});
		}

		return results;
	}
}
