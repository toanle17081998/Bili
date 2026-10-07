# Social copy policy

Dependency-free Rust module for TikTok, Facebook Reels, and YouTube Shorts post copy.
It builds the Vietnamese AI prompt, produces explicitly labeled quick drafts, and
normalizes generated titles, captions, and hashtags. The web app owns provider HTTP
transport, input/output decoding, editing, clipboard access, and browser persistence.

From the repository root:

```sh
npm run build:social-copy
bun run test:social-copy
```

Building requires Rust with the `wasm32-unknown-unknown` target. `RUSTC_PATH` can
override the compiler path. `social-copy.wasm` is included for local development.

The server uses `GEMINI_API_KEY`, or `OPENAI_API_KEY` when Gemini is not configured.
Without either key, it returns quick drafts with `mode: "draft"`. Provider failures
return an error rather than silently replacing the user's post with a draft.
