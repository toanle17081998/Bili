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
