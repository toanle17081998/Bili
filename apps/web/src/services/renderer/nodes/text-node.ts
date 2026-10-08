import { BaseNode } from "./base-node";
import type { TextElement } from "@/timeline";
import type { EffectPass } from "@/effects/types";
import type { BlendMode, Transform } from "@/rendering";
import { drawMeasuredTextLayout } from "@/text/primitives";
import type { MeasuredTextElement } from "@/text/measure-element";

export type TextNodeParams = TextElement & {
	transform: Transform;
	opacity: number;
	blendMode?: BlendMode;
	canvasCenter: { x: number; y: number };
	canvasHeight: number;
	textBaseline?: CanvasTextBaseline;
};

export interface ResolvedTextNodeState {
	transform: Transform;
	opacity: number;
	textColor: string;
	backgroundColor: string;
	effectPasses: EffectPass[][];
	measuredText: MeasuredTextElement;
}

export class TextNode extends BaseNode<TextNodeParams, ResolvedTextNodeState> {}

export function renderTextToContext({
	node,
	ctx,
}: {
	node: TextNode;
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}): void {
	const resolved = node.resolved;
	if (!resolved) {
		return;
	}

	const x = resolved.transform.position.x + node.params.canvasCenter.x;
	const y = resolved.transform.position.y + node.params.canvasCenter.y;
	const baseline = node.params.textBaseline ?? "middle";
	const background = resolved.measuredText.resolvedBackground;
	if (background.enabled && background.fullWidth) {
		// Draw in canvas coordinates, independently of caption width/transforms.
		const width = ctx.canvas.width;
		const height = ctx.canvas.height;
		const stripHeight =
			(height * Math.max(5, Math.min(50, background.stripHeight ?? 22))) / 100;
		const blur = (Math.max(0, background.blur ?? 0) * height) / 1080;
		ctx.save();
		ctx.fillStyle = resolved.backgroundColor;
		ctx.shadowColor = resolved.backgroundColor;
		ctx.shadowBlur = blur;
		// Extend beyond the sides/bottom so only the upper edge is feathered.
		ctx.fillRect(
			-blur * 2,
			height - stripHeight,
			width + blur * 4,
			stripHeight + blur * 2,
		);
		ctx.restore();
	}

	ctx.save();
	ctx.translate(x, y);
	ctx.scale(resolved.transform.scaleX, resolved.transform.scaleY);
	if (resolved.transform.rotate) {
		ctx.rotate((resolved.transform.rotate * Math.PI) / 180);
	}

	drawMeasuredTextLayout({
		ctx,
		layout: resolved.measuredText,
		textColor: resolved.textColor,
		background: background.fullWidth
			? { ...background, enabled: false }
			: background,
		backgroundColor: resolved.backgroundColor,
		textBaseline: baseline,
		strokeColor:
			typeof node.params.params["stroke.color"] === "string"
				? node.params.params["stroke.color"]
				: "#000000",
		strokeWidth:
			typeof node.params.params["stroke.width"] === "number"
				? (node.params.params["stroke.width"] * node.params.canvasHeight) / 1080
				: 0,
	});

	ctx.restore();
}
