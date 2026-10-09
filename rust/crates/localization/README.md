# Localization timing

Shared Rust policy for source speech windows, fragmented recognition and tempo fitting.
Speech paragraphs join adjacent phrases within 350 ms, up to 15 seconds per synthesis.
Caption line breaks do not split the voice. The server assembles one full-length voice
asset with silence between paragraphs, preserving the source positions on the timeline.
The web server loads `timing.wasm`; desktop can call the same Rust functions directly.
Translations retain recognized source timestamps. Long speech is sped up without
changing pitch; ratios above 2.5 fail rather than dropping words or overlapping clips.

Rebuild the dependency-free server artifact after changing `src/lib.rs`:

```powershell
rustup target add wasm32-unknown-unknown
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-localization.ps1
cd apps/web
bun test src/localization/timing.test.ts
```

Vocal separation uses the platform adapter at `apps/web/src/media/vocal-separation.ts`
with Demucs `htdemucs`. Install a local CPU environment from the repository root:

```powershell
python -m venv .local_tools/audio
.local_tools/audio/Scripts/python.exe -m pip install torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cpu
.local_tools/audio/Scripts/python.exe -m pip install demucs==4.0.1 soundfile
.local_tools/audio/Scripts/python.exe -m pip install faster-whisper edge-tts
```

The model downloads on its first run. Separated stems are cached against source path,
size and modification time. Use Python 3.11 for this pinned environment. Transcription,
TTS and separation automatically use this environment when installed. `PYTHON_BIN`
can override the transcription/TTS runtime; that runtime needs `faster-whisper` and
`edge-tts`. `WHISPER_MODEL` defaults to `base` and can be
set to `small` for higher quality at additional CPU cost. Separation can leave vocal
residue or affect background effects; its output is never silently substituted with
the original mix. Failed transcription, translation and TTS are surfaced as errors.

Separation automatically uses CUDA when the selected Python environment has a
CUDA-enabled PyTorch installation and a compatible GPU; otherwise it uses CPU.
Set `DEMUCS_DEVICE=cpu` to force CPU, or `DEMUCS_DEVICE=cuda` to require CUDA.
Installing the CPU-only PyTorch wheels above keeps separation on CPU.

Keyed LLM translation runs up to two bounded batches concurrently, with the limit
owned by Rust. Source IDs preserve the original order even if responses finish
out of order. In-flight batches finish caching before an error is returned; later
waves are not started after a failure.

Free translation shares a serial request queue across preview/process jobs, spaces
requests by at least one second and retries transient errors at most twice. Rust
owns the pacing, retry and cooldown policy. Retry-After is respected, including
HTTP dates; requests requiring more than 30 seconds of backoff stop rather than
retrying early. Persistent 429 responses open a shared cooldown and reach the UI
as HTTP 429 with Retry-After. Configure a supported keyed provider for persistent
upstream throttling; the free endpoint is not a guaranteed translation service.
Server Retry-After also blocks queued jobs when a terminal 503 prevents retries.
Successful translations are cached per source text/target in
`apps/web/.local_storage/translations/free-translate/`, retaining clip timestamps
when reused. A bounded 512-entry memory cache retains successful results even if
disk persistence fails. Failed or invalid responses are never saved as translations.

## Visual narration

The AI panel's narration mode analyzes the selected video's images, not its audio.
It first identifies the whole video's throughline, tone and evidence-backed story
beats, then makes a second text-only request to write a spoken narrative. The writer
adds curiosity, commentary and emotional rhythm rather than captioning every frame;
it preserves pauses, aligns reveals with the evidence and respects unknown facts.
Optional notes can guide the audience and delivery style, not invent video events.
Both stages use the configured provider, so a preview makes two model requests.
The user reviews or edits the timestamped script before requesting VieNeu speech.
Narration never runs transcription, translation or vocal separation. Source audio
and video files are not changed; narration is inserted as a separate timeline asset.
Moved, trimmed or replaced clips require a fresh preview before applying the result.
Retimed clips must first be exported and reimported.

Configure `GEMINI_API_KEY` or `OPENAI_LLM_API_KEY` plus an image-capable
`OPENAI_LLM_MODEL` in `apps/web/.env.local`. OpenAI-compatible services can use
`OPENAI_LLM_BASE_URL`. The selected provider receives sampled JPEG frames and
optional context only when analysis is requested; provider usage may be billed.
VieNeu and FFmpeg must also be available for speech and local media processing.

Rust owns both narration prompts, output-token budgets, sampling, script bounds and proxy budgets:
videos up to 10 minutes, at most 72 sampled images, 100 narration segments,
8 KiB per segment and 64 KiB total text. Uploaded files are limited to 256 MiB;
analysis proxies are limited to 512px, 2 fps and 64 MiB. Temporary sources expire
after 24 hours, with up to 16 per project; active jobs retain their sources.
Final narration audio is stored independently from the temporary proxy and from
normal dubbing results. Sparse sampling can miss brief actions, so scripts need
human review. Empty or invalid AI scripts are rejected before speech synthesis.

Run narration and dubbing regression checks from `apps/web`:

```powershell
bun --env-file=.env.local test src/localization
```

## Background music

The AI panel includes a separate background-music section in both modes. Select a
video and upload music or choose an audio asset already in the project. The preview
player and volume slider work independently from AI narration. Music starts at the
selected video's timeline position and covers its full visible duration, including
retimed videos. No AI credentials or TTS service are needed to prepare music.

Rust bounds uploads to 64 MiB and clip durations to 0.1 seconds–60 minutes, and
chooses the edge fade (up to 1.5 seconds, never overlapping on short clips). FFmpeg
loops shorter music or trims longer music into one MP3, fading the full bed's edges.
The server returns audio bytes and removes its temporary files; the browser saves
the fitted music as a project asset used by both playback and normal video export.

Music defaults to 15% volume. Adding/replacing it is an atomic undoable edit on an
unmuted music-only track. Removing music preserves other clips' positions even
with ripple editing enabled, and the same policy is retained during redo.
