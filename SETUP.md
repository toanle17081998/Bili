# Hướng dẫn cài đặt & chạy OpenCut Vietnamese Localization

Tài liệu này hướng dẫn cài đặt và chạy OpenCut Classic với **Vietnamese localization pipeline** (Bilibili → Tiếng Việt) trên máy local.

## Tổng quan luồng

```
Video Bilibili (Trung)
    ↓
1. Tải video (yt-dlp)
    ↓
2. Tách vocal + background (Demucs)
    ↓
3. Nhận diện lời thoại (Whisper / Gemini)
    ↓
4. Dịch + biên kịch tiếng Việt (LLM: Gemini / OpenAI / FreeTranslate)
    ↓
5. Tạo giọng đọc tiếng Việt (VieNeu-TTS)
    ↓
6. Ghép timeline + render
```

## Yêu cầu hệ thống

- **OS**: Windows 10/11, macOS, hoặc Linux
- **RAM**: tối thiểu 8GB (khuyến nghị 16GB cho VieNeu + Whisper)
- **Disk**: ~10GB trống (model weights + cache)
- **GPU**: không bắt buộc, nhưng có GPU sẽ nhanh hơn nhiều

## Phần mềm cần cài

| Phần mềm | Mục đích | Cài đặt |
|---|---|---|
| [Bun](https://bun.sh) ≥ 1.2 | Runtime + package manager | `curl -fsSL https://bun.sh/install \| bash` |
| [Node.js](https://nodejs.org) ≥ 20 | Next.js runtime | Tải từ nodejs.org |
| [Python](https://python.org) ≥ 3.10 | VieNeu-TTS, Whisper, Demucs | Tải từ python.org |
| [uv](https://docs.astral.sh/uv/) | Python package manager | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| [FFmpeg](https://ffmpeg.org) | Audio/video processing | `winget install ffmpeg` (Windows) |
| [Rust](https://rustup.rs) | Build WASM modules | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| [Docker](https://docker.com) | Database + Redis (optional) | Tải Docker Desktop |

## Bước 1: Clone repo

```bash
git clone https://github.com/your-fork/opencut-classic.git
cd opencut-classic
```

## Bước 2: Cài dependencies

```bash
bun install
```

## Bước 3: Cấu hình môi trường

```bash
# Unix/Linux/Mac
cp apps/web/.env.example apps/web/.env.local

# Windows PowerShell
Copy-Item apps/web/.env.example apps/web/.env.local
```

Mở `apps/web/.env.local` và điền các key cần thiết:

### Bắt buộc

```bash
# VieNeu-TTS endpoint (xem Bước 4)
VIENEU_ENDPOINT=http://localhost:8000/v1/audio/speech
VIENEU_MODEL=vieneu-v3-turbo
VIENEU_API_KEY=x
```

### Tùy chọn (chọn 1 trong các LLM provider)

```bash
# Option A: Gemini (khuyến nghị, free tier rộng)
GEMINI_API_KEY=your_gemini_api_key_here

# Option B: OpenAI
OPENAI_API_KEY=your_openai_api_key_here

# Option C: FreeTranslate (không cần key, chất lượng thấp hơn)
# → không cần config gì
```

### Tùy chọn (chọn 1 trong các STT provider)

```bash
# Option A: Faster-Whisper (local, miễn phí, chậm)
# → không cần config gì, dùng model base

# Option B: Gemini (nhanh, cần key ở trên)

# Option C: OpenAI Whisper (cần key ở trên)
```

### Database (optional, chỉ cần nếu dùng auth)

```bash
DATABASE_URL="postgresql://opencut:opencut@localhost:5432/opencut"
BETTER_AUTH_SECRET=your_better_auth_secret
```

## Bước 4: Cài VieNeu-TTS server

VieNeu-TTS là TTS provider duy nhất của app. Nó self-hosted, miễn phí, hỗ trợ 25 giọng tiếng Việt.

```bash
# Clone VieNeu
git clone https://github.com/pnnbao97/VieNeu-TTS.git
cd VieNeu-TTS

# Cài dependencies
uv sync

# Chạy server (dùng mirror HuggingFace để tránh timeout)
HF_ENDPOINT=https://hf-mirror.com uv run python -m apps.openai_speech
```

Server sẽ chạy ở `http://localhost:8000`. Kiểm tra:

```bash
curl http://localhost:8000/health
# → {"status":"ok","backend":"onnx","max_streams":1,...}
```

> **Lưu ý**: Nếu ở nước ngoài và truy cập `huggingface.co` bình thường, có thể bỏ `HF_ENDPOINT`.

> **Lưu ý 2**: VieNeu CPU mode chỉ support 1 stream. Provider đã có retry với exponential backoff. Nếu muốn nhanh hơn, dùng GPU mode (xem [VieNeu docs](https://github.com/pnnbao97/VieNeu-TTS)).

## Bước 5: Build WASM modules

App dùng Rust → WASM cho timing/policy. Build một lần:

```bash
bun run build:wasm
bun run build:watermark
bun run build:social-copy
```

Yêu cầu Rust toolchain + target `wasm32-unknown-unknown`:

```bash
rustup target add wasm32-unknown-unknown
```

## Bước 6: Start database (optional)

Nếu dùng auth features:

```bash
docker compose up -d db redis serverless-redis-http
```

Nếu không dùng auth, bỏ qua bước này.

## Bước 7: Start dev server

```bash
bun run dev:web
```

App sẽ chạy ở [http://localhost:3000](http://localhost:3000).

## Bước 8: Test pipeline

### Test TTS

```bash
cd apps/web
bun --env-file=.env.local run scripts/test-tts.mjs
```

Nếu thấy `✅ Success trong X.Xs` → VieNeu hoạt động bình thường.

### Test full pipeline

1. Mở [http://localhost:3000](http://localhost:3000)
2. Paste link Bilibili vào ô nhập
3. Chọn giọng (mặc định: Ngọc Huyền)
4. Click "Việt hóa"
5. Đợi ~5-15 phút tùy độ dài video

## Cấu trúc thư mục

```
opencut-classic/
├── apps/
│   ├── web/                    # Next.js app
│   │   ├── src/
│   │   │   ├── providers/
│   │   │   │   ├── tts/        # TTS providers (chỉ có VieNeu)
│   │   │   │   ├── llm/        # LLM providers (Gemini, OpenAI, FreeTranslate)
│   │   │   │   └── transcription/  # STT providers (Whisper, Gemini)
│   │   │   ├── localization/   # Pipeline chính
│   │   │   └── media/          # FFmpeg, vocal separation, watermark
│   │   └── scripts/
│   │       └── test-tts.mjs    # Test nhanh TTS
│   └── desktop/                # GPUI desktop app (WIP)
├── rust/
│   ├── crates/
│   │   ├── localization/       # Timing/policy WASM
│   │   ├── watermark/          # Watermark removal WASM
│   │   └── social-copy/        # Social copy WASM
│   └── wasm/                   # Main WASM module
├── scripts/
│   ├── build-watermark.mjs
│   ├── build-social-copy.mjs
│   └── build-localization.ps1
└── SETUP.md                    # File này
```

## Chi phí

| Service | Chi phí |
|---|---|
| VieNeu-TTS | **Miễn phí** (self-hosted) |
| Faster-Whisper | **Miễn phí** (local) |
| Demucs | **Miễn phí** (local) |
| FFmpeg | **Miễn phí** (local) |
| Gemini API | Free tier: 15 req/min, 1500 req/day |
| OpenAI API | Trả phí theo token (~$0.01/video) |
| FreeTranslate | **Miễn phí** (chất lượng thấp) |

**Khuyến nghị**: Dùng Gemini cho cả STT + LLM (free tier rộng), VieNeu cho TTS (miễn phí). Tổng chi phí: **$0/video**.

## Troubleshooting

### VieNeu không kết nối được

```bash
# Kiểm tra server có chạy không
curl http://localhost:8000/health

# Nếu lỗi, restart server
cd VieNeu-TTS
HF_ENDPOINT=https://hf-mirror.com uv run python -m apps.openai_speech
```

### Whisper chậm

→ Dùng Gemini thay thế (set `GEMINI_API_KEY` trong `.env.local`).

### Lỗi "Translation lost source segments"

→ Lỗi này đã fix. Nếu vẫn gặp, restart dev server và thử lại.

### Lỗi FFmpeg không tìm thấy

```bash
# Windows
winget install ffmpeg

# macOS
brew install ffmpeg

# Linux
sudo apt install ffmpeg
```

### Lỗi build WASM

```bash
# Cài target wasm32
rustup target add wasm32-unknown-unknown

# Build lại
bun run build:wasm
```

### Port 3000 bị chiếm

```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <pid> /F

# macOS/Linux
lsof -ti:3000 | xargs kill -9
```

## Tài liệu tham khảo

- [VieNeu-TTS](https://github.com/pnnbao97/VieNeu-TTS) — TTS provider
- [OpenCut](https://github.com/opencut-app/opencut) — Original repo
- [Next.js docs](https://nextjs.org/docs) — Framework
- [Bun docs](https://bun.sh/docs) — Runtime
