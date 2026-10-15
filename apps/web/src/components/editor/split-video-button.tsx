"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { ScissorIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";

const SplitVideoDialog = dynamic(() => import("./split-video-dialog"), {
	ssr: false,
});

export function SplitVideoButton() {
	const [open, setOpen] = useState(false);
	const editor = useEditor();
	return (
		<>
			<Button
				variant="outline"
				onClick={() => {
					editor.playback.pause();
					setOpen(true);
				}}
			>
				<HugeiconsIcon icon={ScissorIcon} />
				Chia video
			</Button>
			{open && <SplitVideoDialog onClose={() => setOpen(false)} />}
		</>
	);
}
