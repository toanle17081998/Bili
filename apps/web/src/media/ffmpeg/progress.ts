export interface FFmpegProgress {
	seconds: number;
	frame?: number;
	fps?: number;
	speed?: number;
}

export class FFmpegProgressReader {
	private pending = "";
	private fields = new Map<string, string>();

	push({
		chunk,
		onProgress,
	}: {
		chunk: string;
		onProgress: (progress: FFmpegProgress) => void;
	}) {
		this.pending += chunk;
		const lines = this.pending.split("\n");
		this.pending = lines.pop() ?? "";
		for (const raw of lines) {
			const line = raw.trim();
			const separator = line.indexOf("=");
			if (separator < 1) continue;
			const key = line.slice(0, separator);
			this.fields.set(key, line.slice(separator + 1));
			if (key !== "progress") continue;
			const seconds =
				Number(
					this.fields.get("out_time_us") ?? this.fields.get("out_time_ms"),
				) / 1_000_000;
			if (Number.isFinite(seconds) && seconds >= 0) {
				const number = ({ name }: { name: string }) => {
					const rawValue = this.fields.get(name);
					const value =
						rawValue === undefined ? NaN : Number(rawValue.replace(/x$/, ""));
					return Number.isFinite(value) ? value : undefined;
				};
				onProgress({
					seconds,
					frame: number({ name: "frame" }),
					fps: number({ name: "fps" }),
					speed: number({ name: "speed" }),
				});
			}
			this.fields.clear();
		}
	}
}
