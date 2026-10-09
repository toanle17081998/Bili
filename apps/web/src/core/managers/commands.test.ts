/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Synthetic ticks and a minimal editor fixture avoid browser-only WASM initialization. */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { EditorCore } from "@/core";
import { Command } from "@/commands/base-command";
import type { SceneTracks, UploadAudioElement } from "@/timeline";
import type { MediaTime } from "@/wasm";
import { CommandManager } from "./commands";

test("a position-preserving command leaves later audio aligned through execute, undo and redo with ripple enabled", () => {
	const audio = ({ id, start }: { id: string; start: number }): UploadAudioElement => ({
		id, name: id, type: "audio", sourceType: "upload", mediaId: id,
		startTime: start as MediaTime,
		duration: 10 as MediaTime,
		trimStart: 0 as MediaTime, trimEnd: 0 as MediaTime, params: { volume: 0, muted: false },
	});
	for (const ripple of ["preserve", "apply"] as const) {
		let tracks: SceneTracks = {
			main: { id: "main", name: "Main", type: "video", elements: [], muted: false, hidden: false },
			overlay: [],
			audio: [{ id: "audio", name: "Audio", type: "audio", muted: false, elements: [audio({ id: "music", start: 0 }), audio({ id: "later-audio", start: 10 })] }],
		};
		const editor = {
			scenes: { getActiveSceneOrNull: () => ({ tracks }) },
			selection: { getSnapshot: () => ({ selectedElements: [], selectedKeyframes: [] }) },
			timeline: { updateTracks: (next: SceneTracks) => { tracks = next; } },
		} as unknown as EditorCore;
		const manager = new CommandManager(editor);
		manager.isRippleEnabled = true;
		class RemoveMusic extends Command {
			private before: SceneTracks | undefined;
			execute() {
				this.before = tracks;
				tracks = { ...tracks, audio: tracks.audio.map((track) => ({ ...track, elements: track.elements.filter((element) => element.id !== "music") })) };
				return undefined;
			}
			undo() { tracks = this.before!; }
		}
		if (ripple === "preserve") manager.execute({ command: new RemoveMusic(), ripple });
		else manager.execute({ command: new RemoveMusic() });
		const expected = ripple === "preserve" ? 10 : 0;
		assert.equal(tracks.audio[0].elements[0].startTime, expected);
		manager.undo();
		assert.equal(tracks.audio[0].elements.length, 2);
		assert.equal(tracks.audio[0].elements[1].startTime, 10);
		manager.redo();
		assert.equal(tracks.audio[0].elements[0].startTime, expected);
	}
});
