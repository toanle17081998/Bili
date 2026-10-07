export interface WatermarkRegion {
	x: number;
	y: number;
	width: number;
	height: number;
	start: number;
	end: number;
}

export interface WatermarkResult {
	success: boolean;
	streamUrl?: string;
	error?: string;
}
