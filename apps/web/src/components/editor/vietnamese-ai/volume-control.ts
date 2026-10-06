import { clampDb } from "@/timeline/audio-state";

/** Convert the panel's displayed percentage to the editor's dB controls. */
export function volumeControlParams(percent: number) {
	return {
		volume: clampDb(20 * Math.log10(Math.max(percent / 100, 0.001))),
		muted: percent <= 0,
	};
}
