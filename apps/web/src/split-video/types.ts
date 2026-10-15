export interface SplitRange {
	start: number;
	end: number;
}

export interface DownloadedVideo {
	id: string;
	name: string;
	path: string;
	duration: number;
	width: number;
	height: number;
	fps: number;
	hasAudio: boolean;
	size: number;
	streamUrl: string;
	thumbnailUrl: string;
}

export interface SplitPart extends SplitRange {
	index: number;
	duration: number;
	width: number;
	height: number;
	fps: number;
	hasAudio: boolean;
	size: number;
	downloadUrl: string;
}

export interface SplitResult {
	batchId: string;
	parts: SplitPart[];
}

export interface CreatedSplitProject {
	id: string;
	index: number;
	name: string;
}

export interface SplitJob {
	batchId: string;
	origin: string;
	video: DownloadedVideo;
	sourceVideoPath: string;
	cuts: number[];
	baseName: string;
	status:
		| "draft"
		| "queued"
		| "splitting"
		| "ready"
		| "error"
		| "paused"
		| "completed";
	draftStep: "cuts" | "confirm";
	draftRevision: number;
	editorId?: string;
	completedParts: number;
	totalParts: number;
	createdProjects: CreatedSplitProject[];
	createdAt: string;
	updatedAt: string;
	error?: string;
	result?: SplitResult;
	encoderProgress?: {
		part: number;
		seconds: number;
		partDuration: number;
		speed?: number;
		fps?: number;
	};
}
