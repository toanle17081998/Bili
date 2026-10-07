import { z } from "zod";

const text = z.string().refine((value) => !value.includes("\0"));
export const SocialToneSchema = z.enum(["engaging", "informative", "friendly"]);
export const SocialPlatformSchema = z.enum(["tiktok", "facebook", "youtube"]);
export const SocialCopyRequestSchema = z.object({
	title: text.pipe(z.string().trim().max(300)),
	content: text.pipe(z.string().trim().min(1).max(12000)),
	tone: SocialToneSchema,
});
const PostSchema = z.object({
	title: text.pipe(z.string().max(1000)).default(""),
	caption: text.pipe(z.string().trim().min(1).max(12000)),
	hashtags: z.array(text.pipe(z.string().max(100))).min(1).max(30),
});
export const PostsSchema = z.object({
	tiktok: PostSchema,
	facebook: PostSchema,
	youtube: PostSchema.extend({ title: text.pipe(z.string().trim().min(1).max(1000)) }),
});
export const SocialCopyResultSchema = z.object({
	posts: PostsSchema,
	mode: z.enum(["ai", "draft"]),
});
