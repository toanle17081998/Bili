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
	const width = ctx.canvas.width;
	const height = ctx.canvas.height;
	const stripWidthPct = Math.max(
		15,
		Math.min(100, background.stripWidth ?? 88),
	);
	const stripHeightPct = Math.max(
		4,
		Math.min(80, background.stripHeight ?? 12),
	);
	const stripWidthPx = (width * stripWidthPct) / 100;
	const stripHeightPx = (height * stripHeightPct) / 100;

	if (
		background.enabled &&
		background.fullWidth &&
		resolved.backgroundColor &&
		resolved.backgroundColor !== "transparent" &&
		!/,\s*0(\.0+)?\)$/.test(resolved.backgroundColor)
	) {
		// Draw the floating strip centered on (x, y) rather than anchored to bottom or full width.
		const stripLeft = x - stripWidthPx / 2;
		const stripTop = y - stripHeightPx / 2;
		const blur = (Math.max(0, background.blur ?? 0) * height) / 1080;
		const cornerRadius =
			stripWidthPct < 100
				? ((background.cornerRadius ?? 12) *
						Math.min(stripWidthPx, stripHeightPx)) /
					200
				: 0;
		ctx.save();
		ctx.fillStyle = resolved.backgroundColor;
		ctx.shadowColor = resolved.backgroundColor;
		ctx.shadowBlur = blur * 0.5;
		ctx.beginPath();
		if (cornerRadius > 0) {
			ctx.roundRect(
				stripLeft,
				stripTop,
				stripWidthPx,
				stripHeightPx,
				cornerRadius,
			);
		} else {
			ctx.rect(stripLeft, stripTop, stripWidthPx, stripHeightPx);
		}
		ctx.fill();
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
		layout: background.fullWidth
			? { ...resolved.measuredText, textAlign: "center" }
			: resolved.measuredText,
		textColor: resolved.textColor,
		background: background.fullWidth
			? { ...background, enabled: false }
			: background,
		backgroundColor: resolved.backgroundColor,
		textBaseline: background.fullWidth ? "middle" : baseline,
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
