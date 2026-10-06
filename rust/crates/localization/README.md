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
```

The model downloads on its first run. Separated stems are cached against source path,
size and modification time. `PYTHON_BIN` selects the transcription/TTS Python runtime;
it needs `faster-whisper` and `edge-tts`. `WHISPER_MODEL` defaults to `base` and can be
set to `small` for higher quality at additional CPU cost. Separation can leave vocal
residue or affect background effects; its output is never silently substituted with
the original mix. Failed transcription, translation and TTS are surfaced as errors.
