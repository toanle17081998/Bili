import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";
import { withContentCollections } from "@content-collections/next";

const nextConfig: NextConfig = {
	compiler: {
		removeConsole: process.env.NODE_ENV === "production",
	},
	reactStrictMode: true,
	productionBrowserSourceMaps: true,
	output: "standalone",
	outputFileTracingIncludes: {
		"/api/localization/process": ["../../rust/crates/localization/timing.wasm"],
		"/api/social-copy": ["../../rust/social-copy/social-copy.wasm"],
		"/api/media/watermark-removals": [
			"../../rust/crates/watermark/watermark.wasm",
		],
	},
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "*.hdslb.com",
			},
			{
				protocol: "http",
				hostname: "*.hdslb.com",
			},
			{
				protocol: "https",
				hostname: "plus.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "images.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "images.marblecms.com",
			},
			{
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
			},
			{
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
			{
				protocol: "https",
				hostname: "api.iconify.design",
			},
			{
				protocol: "https",
				hostname: "api.simplesvg.com",
			},
			{
				protocol: "https",
				hostname: "api.unisvg.com",
			},
			{
				protocol: "https",
				hostname: "cdn.brandfetch.io",
			},
		],
	},
};

export default withContentCollections(withBotId(nextConfig));
