import type { TranscriptSegment } from "@/localization/schemas";
import { runPython } from "@/media/python";
import { loadDubbingTiming } from "@/localization/timing";

export class FasterWhisperTranscriptionProvider {
	readonly name = "faster-whisper";
	async transcribe(audioPath: string): Promise<TranscriptSegment[]> {
		const stdout = await runPython(`
import sys, json
from faster_whisper import WhisperModel
model = WhisperModel(sys.argv[2], device='cpu', compute_type='int8')
segments, info = model.transcribe(sys.argv[1], beam_size=5, vad_filter=True, condition_on_previous_text=False, word_timestamps=True)
result = []
for segment in segments:
    words = [w for w in (segment.words or []) if w.word.strip()]
    if segment.text.strip() and words:
        result.append({'words': [{'start': w.start, 'end': w.end, 'text': w.word} for w in words]})
print(json.dumps(result, ensure_ascii=False))
`, [audioPath, process.env.WHISPER_MODEL || "base"], 30 * 60_000);
		const timing = await loadDubbingTiming();
		const segments: TranscriptSegment[] = [];
		for (const segment of JSON.parse(stdout.trim())) {
			let current: TranscriptSegment | undefined;
			for (const word of segment.words) {
				if (!current || timing.dubbing_split_word(current.end, word.start)) {
					current = { start: word.start, end: word.end, text: word.text.trim() };
					segments.push(current);
				} else {
					current.end = word.end;
					current.text += word.text;
				}
			}
		}
		return segments;
	}
}
