# Social copy policy

Dependency-free Rust module for TikTok, Facebook Reels, and YouTube Shorts post copy.
It builds the Vietnamese AI prompt, produces explicitly labeled quick drafts, and
normalizes generated titles, captions, and hashtags. The web app owns provider HTTP
transport, input/output decoding, editing, clipboard access, and browser persistence.

The Caption & tag panel automatically uses visible timeline subtitles. Without
subtitles it mixes the timeline audio and uploads an Opus/WebM audio file for speech
recognition. The Rust policy supplies the original-language transcription prompt
and orders/bounds transcript content before generating social posts. Speech
recognition uses Gemini, OpenAI Whisper, or local Faster Whisper, without requiring
the dubbing/TTS service. Saved posts and manual edits are retained when reopening
the panel; the regenerate button uses the current timeline.

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
