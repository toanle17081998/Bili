export interface StorySettings {
	language: string;
	style:
		| "dramatic_challenge"
		| "funny_commentary"
		| "documentary"
		| "engineering_explainer"
		| "viral_short_form";
	drama: number;
	humor: number;
	speaking_rate: number;
	density: number;
	sentence_words: number;
	perspective: "first" | "third";
	notes: string;
}
export interface StoryEvent {
	instantaneous?: boolean;
	id: string;
	start: number;
	end: number;
	event_type: string;
	description: string;
	objects: string[];
	confidence: number;
	source: "video" | "audio" | "both";
	importance: string;
	evidence_times: number[];
	preserve_audio: boolean;
}
export interface StorySegment {
	segment_id: string;
	paragraph_id: string;
	start_time: number;
	end_time: number;
	narration_text: string;
	story_role: string;
	emotion: string;
	speaking_rate: number;
	estimated_duration: number;
	associated_event_ids: string[];
	pause_before: number;
	pause_after: number;
	intentional_lead_in: boolean;
	locked: boolean;
	audio?: {
		path: string;
		url: string;
		duration: number;
		original_duration: number;
		tempo: number;
		text: string;
		voice: string;
		speaking_rate: number;
	};
}
export interface StoryIssue {
	severity: "error" | "warning";
	code: string;
	message: string;
	segment_id?: string;
}
export interface StoryDocument {
	title: string;
	summary: string;
	outcome: "success" | "failure" | "partial" | "unknown";
	outcome_event_ids: string[];
	understanding: Record<string, { text: string; event_ids: string[] } | null>;
	outline: { role: string; description: string; event_ids: string[] }[];
	causal_links: {
		event_ids: string[];
		explanation: string;
		observed: boolean;
	}[];
	paragraphs: { id: string; role: string; text: string; event_ids: string[] }[];
	full_script: string;
}
export interface StoryProject {
	schema_version: number;
	project_id: string;
	revision: number;
	video_path: string;
	original_path: string;
	source_signature: string;
	timeline_start: number;
	source_element_id: string;
	duration: number;
	metadata: {
		duration: number;
		width: number;
		height: number;
		fps: number;
		hasAudio: boolean;
	};
	settings: StorySettings;
	voice: string;
	scenes: { id: string; start: number; end: number }[];
	windows: {
		index: number;
		start: number;
		end: number;
		frame_times: number[];
	}[];
	analysis_key: string;
	analyzed_windows: number;
	events: StoryEvent[];
	uncertainties: string[];
	story?: StoryDocument;
	segments: StorySegment[];
	review?: { issues: StoryIssue[]; can_synthesize: boolean };
	ai_review?: { issues: StoryIssue[] };
	user_edits: unknown[];
	warnings: string[];
	mix: {
		original_volume: number;
		voice_volume: number;
		ducking: boolean;
		quality: "preview" | "standard" | "high";
	};
	render?: {
		path: string;
		url: string;
		revision: number;
		captions_url: string;
	};
}
export interface StoryDefaults {
	schema_version: number;
	voice: string;
	settings: StorySettings;
	mix: StoryProject["mix"];
	limits: {
		max_duration: number;
		window_seconds: number;
		sample_seconds: number;
		max_frames: number;
		max_retries: number;
		max_shorten: number;
		max_tempo: number;
		job_timeout_ms: number;
		stage_timeout_ms: number;
		max_jobs: number;
		request_max_bytes: number;
		ai_output_tokens: number;
	};
}
export interface StorySource {
	file: File;
	start: number;
	duration: number;
	signature: string;
	timelineStart: number;
	elementId: string;
}
export interface StoryJob {
	id: string;
	status: "running" | "complete" | "failed" | "cancelled";
	stage: string;
	progress: number;
	error?: string;
}
