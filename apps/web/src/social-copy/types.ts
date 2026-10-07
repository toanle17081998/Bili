export type SocialPlatform = "tiktok" | "facebook" | "youtube";
export type SocialTone = "engaging" | "informative" | "friendly";

export interface SocialPost {
	title: string;
	caption: string;
	hashtags: string[];
}

export type SocialPosts = Record<SocialPlatform, SocialPost>;

export interface SocialCopyResult {
	posts: SocialPosts;
	mode: "ai" | "draft";
}
