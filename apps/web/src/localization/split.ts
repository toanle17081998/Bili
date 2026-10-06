export interface SplitOptions {
	maxCharsPerCue?: number;
	maxCharsPerLine?: number;
	minDuration?: number;
}

export interface SplitSubtitleCue {
	start: number;
	end: number;
	text: string;
}

/**
 * Splits a sentence or translation segment into snappy, vertical-video (TikTok/Reels/Shorts)
 * subtitle cues with strictly 1 or 2 lines per cue.
 */
export function splitIntoShortSubtitles(
	text: string,
	start: number,
	end: number,
	options: SplitOptions = {},
): SplitSubtitleCue[] {
	const {
		maxCharsPerCue = 38,
		maxCharsPerLine = 22,
		minDuration = 0.7,
	} = options;

	const normalized = text.trim().replace(/\s+/g, " ");
	if (!normalized) return [];

	const totalDuration = Math.max(0.5, end - start);

	function splitPiece(piece: string): string[] {
		const trimmed = piece.trim();
		if (!trimmed) return [];
		if (trimmed.length <= maxCharsPerCue) return [trimmed];

		// 1. Split at clause punctuation (, ; : - —)
		const punctParts = trimmed.split(/(?<=[,;:\—–-])\s+/).filter(Boolean);
		if (punctParts.length > 1) {
			const res: string[] = [];
			for (const p of punctParts) {
				res.push(...splitPiece(p));
			}
			return res;
		}

		// 2. Split at conjunctions & connectors
		const conjRegex =
			/\s+(và|nhưng|để|vì|nếu|thì|rồi|hoặc|khi|trong khi|mà|nên|hãy|cùng)\s+/i;
		const match = trimmed.match(conjRegex);
		if (match && match.index !== undefined) {
			const splitIdx = match.index;
			const left = trimmed.slice(0, splitIdx).trim();
			const right = trimmed.slice(splitIdx).trim();
			if (left.length >= 8 && right.length >= 8) {
				return [...splitPiece(left), ...splitPiece(right)];
			}
		}

		// 3. Balanced split near middle on space
		const words = trimmed.split(" ");
		if (words.length <= 1) return [trimmed];

		let bestIdx = Math.floor(words.length / 2);
		let minDiff = Infinity;
		let curLen = 0;
		const target = trimmed.length / 2;

		for (let i = 0; i < words.length - 1; i++) {
			curLen += words[i].length + 1;
			const diff = Math.abs(curLen - target);
			if (diff < minDiff) {
				minDiff = diff;
				bestIdx = i + 1;
			}
		}

		const left = words.slice(0, bestIdx).join(" ").trim();
		const right = words.slice(bestIdx).join(" ").trim();
		return [...splitPiece(left), ...splitPiece(right)];
	}

	// 1. Initial split by full sentence stops (. ? !)
	const rawSentences = normalized.split(/(?<=[.?!])\s+/).filter(Boolean);

	// 2. Break down each sentence
	const chunks: string[] = [];
	for (const s of rawSentences) {
		chunks.push(...splitPiece(s));
	}

	// 3. Merge orphan fragments (< 10 chars) if combined <= maxCharsPerCue + 4
	const mergedChunks: string[] = [];
	for (let i = 0; i < chunks.length; i++) {
		const cur = chunks[i].trim();
		if (!cur) continue;

		if (mergedChunks.length > 0 && cur.length < 10) {
			const prev = mergedChunks[mergedChunks.length - 1];
			if (prev.length + 1 + cur.length <= maxCharsPerCue + 4) {
				mergedChunks[mergedChunks.length - 1] = `${prev} ${cur}`;
				continue;
			}
		}
		mergedChunks.push(cur);
	}

	if (mergedChunks.length === 0) mergedChunks.push(normalized);

	// 4. Format each chunk into at most 2 lines, and calculate proportional timing
	const totalChars =
		mergedChunks.reduce((acc, c) => acc + c.length, 0) || 1;
	let curStart = start;
	const cues: SplitSubtitleCue[] = [];

	for (let i = 0; i < mergedChunks.length; i++) {
		const chunk = mergedChunks[i];
		const weight = chunk.length / totalChars;
		let curEnd =
			i === mergedChunks.length - 1
				? end
				: Number((curStart + totalDuration * weight).toFixed(2));

		if (curEnd - curStart < minDuration && i < mergedChunks.length - 1) {
			curEnd = Number((curStart + minDuration).toFixed(2));
		}

		// Ensure strictly 1 or 2 lines
		let formattedText = chunk;
		if (chunk.length > maxCharsPerLine && !chunk.includes("\n")) {
			const words = chunk.split(" ");
			let bestIdx = Math.floor(words.length / 2);
			let minDiff = Infinity;
			let curLen = 0;
			const target = chunk.length / 2;

			for (let w = 0; w < words.length - 1; w++) {
				curLen += words[w].length + 1;
				const diff = Math.abs(curLen - target);
				if (diff < minDiff) {
					minDiff = diff;
					bestIdx = w + 1;
				}
			}
			formattedText = `${words.slice(0, bestIdx).join(" ")}\n${words.slice(bestIdx).join(" ")}`;
		}

		cues.push({
			start: Number(curStart.toFixed(2)),
			end: Number(curEnd.toFixed(2)),
			text: formattedText,
		});

		curStart = curEnd;
	}

	return cues;
}
