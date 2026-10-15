# Split video

Platform-independent cut validation and range planning. The same dependency-free
Rust WASM module runs in the browser for previews and in the server before FFmpeg.

- Source videos must be at least 10 seconds long.
- Up to 99 manual cut points / 100 projects per batch.
- Unordered cuts are sorted; duplicate, non-finite, outside and too-close points
  are rejected. Each segment must be at least 0.05 seconds.
- Planning uses the video stream duration, not a longer audio/container tail.
- Output/source video metadata must describe actual nonempty video frames.

Build from the repository root:

```sh
bun run build:split-video
```

Requires `rustc` with `wasm32-unknown-unknown`. Set `RUSTC_PATH` if the compiler
is installed outside PATH. Commit the generated `split-video.wasm` alongside source.

Verify WASM ABI, real FFmpeg cuts and transaction persistence:

```sh
bun test --cwd apps/web ./src/split-video/core.test.ts ./src/split-video/server.test.ts ./src/split-video/jobs.test.ts ./src/services/storage/indexeddb-adapter.test.ts
```

The web shell handles downloaded-file discovery, FFmpeg processes and cancellation,
temporary batches, UI, and IndexedDB/OPFS persistence. FFmpeg re-encodes H.264/AAC
instead of keyframe-only stream copying, preserving dimensions and precise source FPS.
Projects are saved without changing the active editor; navigation happens only after
successful completion. Failed project writes roll back their project/media storage.

## Durable drafts and background processing

Every valid cut edit is saved in browser storage and autosaved to
`.local_storage/split-jobs/{batchId}.json`. Browser writes use a Web Lock around
the complete read/compare/write transaction. Concurrent stale edits fork a separate
draft instead of replacing newer cuts; server editor/base revisions reject conflicts.
Unchanged dialog closure does not republish old edits with a fresh timestamp.

POST acknowledges a durable job with HTTP 202. Encoding is independent of the
request/tab and reports completed parts through GET status. Closing the dialog,
reloading, or leaving the editor stops browser polling/import, not the FFmpeg job.
Only the explicit Stop action pauses it. Encoding has a six-hour process deadline,
separate from the one-hour lifetime of temporary media; draft metadata remains.

The Projects page displays unfinished jobs and drafts with a Resume action.
Deterministic project/media IDs and per-job browser import locks allow partial
imports to resume without duplication. Finalization can be retried even after the
last project checkpoint; existing local projects are verified rather than trusting
server checkpoint counts. An all-local retry does not need another encode pass.

Per-batch server transitions serialize autosave/start/pause/checkpoint/query repair/
completion/discard. Worker capacity is reserved atomically, and registries survive
Next.js hot reload. Explicit discard leaves a tombstone rejecting late requests.

Temporary batches are cleaned only after full successful import, explicit discard,
encoding failure/pause, or media TTL expiration. Failure never deletes cut metadata.
Expired/interrupted encoding can be retried from the original file and stored cuts.
Browser projects and server draft lists are scoped to the same origin; use the same
host (`127.0.0.1` versus `localhost`) consistently. The original implementation did
not retain drafts, so pre-fix cuts cannot be reconstructed from absent records.
