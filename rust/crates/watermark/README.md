# Watermark removal

Shared Rust policy validates pixel regions and source-time windows and produces
FFmpeg `delogo` filters. Delogo reconstructs each region from neighboring pixels;
it does not add a covering graphic or recover hidden original detail perfectly.
Keep a border around the watermark and at least one pixel between the selection
and the frame edge. A region is enabled only within its half-open time window.

The web app uploads a source video to a Node platform adapter, executes FFmpeg,
previews a separate H.264 copy, and replaces media references only after approval.
The original asset, timeline timing, transforms, effects and audio remain intact.
Undo restores the original media references. Processing can be cancelled.
AAC audio is copied without re-encoding or retiming. Other audio codecs are
converted to AAC for browser compatibility. Preview playback pre-decodes short
sources instead of scheduling tiny packets while rendering video; long recordings
keep the streaming path to limit memory use.

The checked-in `watermark.wasm` requires no Rust installation at runtime. Rebuild
the artifact after changing `src/lib.rs`:

```sh
rustup target add wasm32-unknown-unknown
bun run build:watermark
```

`RUSTC_PATH` can point to a standalone compiler. Restart the dev server after
rebuilding. FFmpeg/FFprobe must be on PATH, or set `FFMPEG_PATH`/`FFPROBE_PATH` in
`apps/web/.env.local`. Jobs use `.local_storage/watermark-removals/`; source uploads
are removed after processing. Server preview copies expire after one hour; applied
videos are stored separately in the project's media storage and are not expired.
Multipart ingestion is bounded to 256 MB plus framing, including chunked uploads.
Cancelling stops both probing and encoding before temporary-file cleanup.

Tests:

```sh
cd apps/web
bun test src/media/watermark
```
