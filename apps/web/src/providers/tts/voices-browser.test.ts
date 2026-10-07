import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

test("voice picker can be bundled for the browser without server dependencies", async () => {
	const result = await Bun.build({
		entrypoints: [
			fileURLToPath(new URL("../../components/editor/vietnamese-ai/voice-picker-dialog.tsx", import.meta.url)),
		],
		target: "browser",
		write: false,
	});

	expect(result.logs.filter((log) => log.level === "error")).toEqual([]);
	expect(result.success).toBe(true);
});
