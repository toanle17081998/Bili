# AI Story Narrator

This extends the existing Vietnamese AI editor panel. The original dubbing and
frame-based narration modes remain available. Story policy, prompts, evidence
validation, editing, timing and render plans live in `rust/crates/story-narrator`.
The web layer provides editor interaction, HTTP/provider adapters, filesystem IO
and the Node job runtime.

## Audit and reuse map

| Existing component | Integration |
| --- | --- |
| `components/editor/vietnamese-ai/index.tsx` | Reuses selected video, trim, source identity and existing panel design; adds a Story Narrator tab. |
| `/api/localization/sources`, `localization/source.ts` | Reuses upload limits, trim validation, source confinement, leases and expiration. Optional `purpose=story` retains original audio and a full-resolution selected clip. Default behavior stays the same. |
| `media/ffmpeg/index.ts` | Reuses binary discovery, probing, subprocess cancellation and rendering execution. |
| `providers/openai-compatible.ts` | Reuses existing key, base URL and model configuration. |
| `providers/tts/service.ts`, `vieneu.ts` | Reuses VieNeu, voice mapping and its speech cache. Adds an optional cancellation signal to the existing contract. |
| `localization/http.ts` | Reuses bounded request reading; Story requests use a Rust-defined 2 MiB limit. |
| `/api/media/stream` | Reuses media preview/download; adds WebVTT content type for narration captions. |
| Rust server WASM pattern | Uses a compiled module and a fresh instance per call, keeping mutable WASM state isolated between jobs. Native callers can use the same crate directly. |

No UI migration, database migration, Python model, GPU requirement, new TTS
provider or new JavaScript dependency was added. `serde_json` was already in the
Cargo workspace dependency graph.

## Workflow

1. Select one unretimed video in the editor timeline, then open **Vietnamese AI →
   Story Narrator**. Import video through the existing media workflow if needed.
2. Choose a style and click **Phân tích & Tạo kịch bản AI**.
3. Inspect the original video, detected scene boundaries, timestamped events,
   uncertainties and protected original audio intervals.
4. Review/edit the global story and its paragraphs. Narration text comes from
   this complete story; it is not written independently for individual frames.
5. Edit timestamps/text, regenerate one paragraph or lock approved segments in
   the narration timeline. Structural and AI quality review precede synthesis.
6. Select an existing VieNeu voice and synthesize all missing segments or one
   segment. The output is measured with ffprobe. Overflow first triggers one
   rewrite, then bounded tempo adjustment, then an extension only into free,
   evidenced time without crossing another segment or important event. Words
   are never cut to force a fit. Remaining overflow is reported explicitly.
7. Configure original/voice gain and ducking. Render **Xem thử nhanh** for a
   preview, then choose standard/high quality for the downloadable result.
   WebVTT captions accompany the preview. Server project state saves after
   each completed step; a JSON download is also available. **Thêm thành phẩm vào
   thư viện video** imports the result through the existing media manager for
   further editing and the normal editor export workflow.

## Pipeline and data contract

Scene cuts use FFmpeg `select`/`showinfo`. Continuous shots are also sampled:
30-second chronological windows include samples every two seconds, the final
available frame and nearby scene boundaries, bounded to 24 images per window.
Frames are not sampled after the last decodable frame. Gemini receives short
video clips with audio. Compatible image models receive timestamped JPEGs.
Before extraction, Rust maps requested samples to actual presentation timestamps
decoded by ffprobe, including when resuming older cached windows. This handles
audio that outlasts the video, fractional end times and variable frame rates.
The frame index is cached beside the analysis media and regenerated if the file
changes or the cache is invalid; the full index is never sent to AI. Empty visual
tails are reported as uncertain rather than filled with invented frames.
Each window includes recent preceding events, and the story stage sees the
complete ordered event timeline.

The authoritative validation and JSON contracts are implemented in
`rust/crates/story-narrator/src/lib.rs`; generation schemas are included in
`src/prompts.rs`. `apps/web/src/story-narrator/types.ts` mirrors the wire format
for rendering and IO adapters.

- Events contain `id`, `start`, `end`, `event_type`, `description`, `objects`,
  `confidence`, `source`, `importance`, `evidence_times`, `preserve_audio`.
  A single-frame observation may have `start == end` and is marked
  `instantaneous`; no duration is invented for it. Narration slots must still
  have positive duration. Reversed, out-of-window and ungrounded timestamps are
  rejected. Protected audio impulses also prevent narration starting at that time.
  Evidence must be inside its supplied window/event and correspond to supplied
  frames or clip timestamps. Audio claims require an audio-capable provider.
- The global story contains title, summary, outcome, outcome evidence,
  understanding, outline, observed causal links and ordered paragraphs.
  All 13 understanding fields must be present; absent evidence is `null`.
  Known outcomes require matching visual result events, and cannot select an
  intermediate failure while later attempts continue. `full_script` is derived
  from the story paragraphs.
- Narration segments contain every field from the requested timeline schema,
  plus `paragraph_id`, `intentional_lead_in`, `locked` and optional measured
  audio metadata. Each segment maps to one story paragraph, in order, with the
  same text and valid event references. Overlap, invalid ranges and unmarked
  narration before evidence are rejected.
- Reviews contain concrete `error`/`warning` issues and optional affected segment
  IDs. Protected original sound/dialogue prevents overlapping narration. AI
  review is advisory evidence to inspect, not a quality score or proof of truth.
- Audio references include actual duration, original duration, applied tempo,
  voice, text and speaking rate. Rendering rejects missing, stale or overflowing
  speech. The mixer delays each segment to its timestamp, fades edges, applies
  sidechain ducking to the original audio, and limits the mixed output.

## Persistence, cache and cancellation

State lives under `.local_storage/projects/<id>/story-narrator/`. `project.json`
and `job.json` use temporary files followed by atomic rename. Filesystem reads
and writes share a per-path queue that survives Next hot reloads, so polling
cannot hold an application read handle during replacement. Windows sharing
violations (`EPERM`, `EACCES`, `EBUSY`) receive bounded retries. Complete JSON
is staged as `<file>.pending` before replacing the committed file; if the lock
persists, the save reports an error and retains both versions. A subsequent read
validates and promotes the pending checkpoint after the lock is released, also
recovering after a server restart. Replacement never deletes the committed file
as a workaround. Frame-index cache IO uses the same helper. Source media is
copied into persistent per-analysis directories, so upload-source expiration
does not break saved Story projects. Source/style replacements retain snapshot
JSON files, and individual edits are recorded in `user_edits`.

The analysis identity includes the editor source signature, provider/model and
pipeline version. Successful windows are checkpointed immediately. Retry resumes
from the first incomplete window or story stage; a style change retains scenes
and events. A voice change retains analysis and the story but invalidates speech.
Text/timing edits invalidate affected audio and derived reviews/render output.
Locked segments reject text/timing changes and global style replacement.

The API supports asynchronous job creation, polling, cancellation and revision
conflicts. Two jobs may run at once, with one mutation per project. Transient AI
failures have at most two retries and honor bounded Retry-After delays. AI calls
time out after four minutes and complete jobs after two hours. The job controller
cancels FFmpeg, AI calls and the existing VieNeu request/retry loop. A server
restart reports an interrupted job; running the action again uses saved steps.

## Setup and checks

Build the shared module from the repository root:

```sh
bun run build:story-narrator
cargo test -p story-narrator
```

On Windows without MSVC tools, the build script uses an installed `stable-gnu`
toolchain automatically. Native tests in this environment use
`cargo +stable-gnu test -p story-narrator`. Rust needs the
`wasm32-unknown-unknown` target. The generated `story-narrator.wasm` is included in
the Next standalone output tracing configuration.

Configure the existing Gemini or image-capable OpenAI-compatible settings and
the existing `VIENEU_ENDPOINT`. `STORY_GEMINI_MODEL` optionally overrides the
existing Gemini model default. No credentials are stored in project files.

Run related web regression tests from `apps/web` (PowerShell):

```powershell
$env:VIENEU_ENDPOINT = 'http://localhost:8000/v1/audio/speech'
bun test src/localization src/providers/tts src/components/editor/vietnamese-ai/volume-control.test.ts src/story-narrator
```

The tests inject AI/TTS fixtures and generate real test video/audio with FFmpeg;
they do not contact a real AI or speech service. The endpoint variable is needed
by pre-existing provider selection/rate-limit tests which construct the TTS
factory. New tests cover rendering, duration measurement/shortening, source
audio retention, silent video, checkpoints, style/voice invalidation, cancellation,
revision conflicts, provider failures and API validation. Persistence tests use
a real Windows file-sharing lock, verify concurrent polling and writes, and
recover a pending timeline without repeating AI analysis/story/segments calls.
Rust tests also cover
known/unknown outcomes, intermediate failures, continuous shots, grounding,
protected audio, locks, natural speed bounds and safe timeline extension.

## Verification limits

- No end-to-end LEGO story or live TTS acceptance run has been verified. Fixture
  tests verify the integration and invariants, not the quality of model narration.
- Image-only providers cannot analyze original sound. The UI reports this gap;
  users must inspect the source audio and leave appropriate pauses. Gemini clip
  analysis is the audio-capable integration. No separate ASR model is installed.
- Temporal sampling and provider sampling can miss very fast action. There is
  no frame-perfect motion-tracking or guarantee against model hallucination.
- Video duration is bounded to 60 minutes. Global story/review requests are still
  subject to the configured provider's context and output limits (16,384 output
  tokens), especially for dense hour-long videos.
- The job runtime targets one persistent Node server with writable local storage
  and FFmpeg/ffprobe. It is not a distributed worker or an ephemeral/serverless
  deployment. Interrupted jobs resume on explicit retry. Snapshots/media remain
  on disk until the project is deliberately managed; no destructive cleanup or
  snapshot restoration UI is introduced.
- Rendering uses the selected source clip and the shared FFmpeg service. It does
  not bake unrelated editor overlays/effects into the Story output or insert
  generated voice assets into the main editor timeline automatically.
- Production Next compilation succeeds, but the full build/typecheck is blocked
  by 15 diagnostics also present in HEAD. The first build blocker is missing
  `isShortcutKey` in `src/actions/keybindings/persistence.ts:2`. Other diagnostics
  affect existing migrations, mediabunny, split-video, stickers and tests. No
  type errors were added by Story Narrator.

Verified checks: 17 native Rust tests and 46 related web tests pass; new-module
ESLint and `git diff --check` pass. The integration tests exercise actual FFmpeg
rendering for both sources with original audio and silent sources. A six-window
regression verifies resuming at the second window with instantaneous events while
retaining the successful first window. The WASM adapter detects rebuilt binaries
and refreshes its compiled module automatically.
The EOF regression also resumes a saved sixth window with five completed
checkpoints, using real video whose audio is longer than its last frame. The
reported user's final-window extraction was independently checked against the
actual source without sending it to AI or changing completed project data.

Implementation references: [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html),
[Gemini video input](https://ai.google.dev/gemini-api/docs/video-understanding),
[Gemini audio input](https://ai.google.dev/gemini-api/docs/audio).

## Changed files

New: `rust/crates/story-narrator/{Cargo.toml,src/lib.rs,src/prompts.rs,src/tests.rs,story-narrator.wasm}`,
`scripts/build-story-narrator.mjs`, `apps/web/src/story-narrator/{types,engine,provider,media,media.test,frame-index,atomic-json,storage,storage.test,service,service.test}.ts`,
`apps/web/src/app/api/localization/story/route.ts`,
`apps/web/src/components/editor/vietnamese-ai/story-narrator.tsx`, and this document.

Updated: workspace `Cargo.toml`/`Cargo.lock`/`package.json`, `apps/web/.env.example`,
`apps/web/next.config.ts`, existing source-upload/media-stream routes,
`localization/http.ts`, `providers/tts/{types,vieneu}.ts`, and the Vietnamese AI
panel entry point.
