export interface SearchResult {
	id: string; // e.g. bvid or video id
	title: string;
	duration: number; // in seconds
	durationFormatted: string; // "MM:SS" or "HH:MM:SS"
	thumbnail: string;
	uploader: string;
	viewCount?: string;
	url: string;
	provider: string;
}

export interface VideoMetadata {
	id: string;
	title: string;
	description?: string;
	duration: number;
	thumbnail: string;
	uploader: string;
	url: string;
	width?: number;
	height?: number;
}

export interface VideoPreview {
	id: string;
	title: string;
	streamUrl?: string;
	videoUrl?: string;
	thumbnail: string;
	duration: number;
	embedUrl?: string;
}

export interface ImportedVideo {
	provider: string;
	sourceId: string;
	sourceUrl: string;
	title: string;
	thumbnail: string;
	duration: number;
	localMediaPath: string; // File path or local serving URL
	audioPath?: string;
	createdAt: string;
}

export interface VideoSourceProvider {
	readonly name: string;
	search(query: string): Promise<SearchResult[]>;
	getMetadata(id: string): Promise<VideoMetadata>;
	getPreview(id: string): Promise<VideoPreview>;
	importVideo(id: string): Promise<ImportedVideo>;
}
