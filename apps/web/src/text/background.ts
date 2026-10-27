export const CORNER_RADIUS_MIN = 0;
export const CORNER_RADIUS_MAX = 100;

export interface TextBackground {
	enabled: boolean;
	color: string;
	cornerRadius?: number;
	paddingX?: number;
	paddingY?: number;
	offsetX?: number;
	offsetY?: number;
	blur?: number;
	fullWidth?: boolean;
	backdropBlur?: boolean;
	/** Blur strip height as a percentage of the video canvas height. */
	stripHeight?: number;
	/** Blur strip width as a percentage of the video canvas width. */
	stripWidth?: number;
}
