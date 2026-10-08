# TTS (Text-to-Speech)

Thư mục này chứa toàn bộ logic tạo giọng đọc tiếng Việt cho localization pipeline.

## Cấu trúc

```
providers/tts/
├── types.ts          # Interface TTSProvider, TTSRequest, TTSResult, SpeechProviderError
├── vieneu.ts         # Provider duy nhất: VieNeu-TTS (self-hosted, miễn phí)
├── vieneu.test.ts    # 5 tests cho VieNeu provider
└── service.ts        # createDefaultTTSProvider() — factory trả về provider đang dùng
```

## Provider đang dùng: VieNeu-TTS

App chỉ dùng **một** TTS provider: [VieNeu-TTS](https://github.com/pnnbao97/VieNeu-TTS) — mã nguồn mở, self-hosted, miễn phí, hỗ trợ 25 giọng tiếng Việt.

### Tại sao VieNeu?

- **Miễn phí hoàn toàn**, không giới hạn quota
- **Self-hosted** → không phụ thuộc dịch vụ bên ngoài
- **25 giọng tiếng Việt** chất lượng cao (Hải Đăng, Mai Anh, Trúc Ly, Thiện Minh, Ngọc Huyền, Thùy Dung, …)
- **OpenAI-compatible API** → dễ tích hợp
- **Chạy local** bằng Python + ONNX Runtime (CPU)

### Voice mapping

VieNeu dùng tên giọng tiếng Việt, nhưng app nhận cả Edge TTS voice IDs để tương thích ngược:

| Input voice | VieNeu voice |
|---|---|
| `vi-VN-HoaiMyNeural` | Ngọc Huyền |
| `vi-VN-NamMinhNeural` | Hải Đăng |
| `Hải Đăng` | Hải Đăng |
| `Mai Anh` | Mai Anh |
| `Trúc Ly` | Trúc Ly |
| `Thiện Minh` | Thiện Minh |
| `Thùy Dung` | Thùy Dung |
| _(unknown)_ | Hải Đăng (default) |

## Cài đặt VieNeu server

### Yêu cầu

- Python 3.10+
- [uv](https://docs.astral.sh/uv/) (package manager)
- ~2GB RAM cho ONNX model
- ~500MB disk cho model weights

### Bước 1: Clone repo

```bash
git clone https://github.com/pnnbao97/VieNeu-TTS.git
cd VieNeu-TTS
```

### Bước 2: Cài dependencies

```bash
uv sync
```

### Bước 3: Chạy server

```bash
HF_ENDPOINT=https://hf-mirror.com uv run python -m apps.openai_speech
```

> **Lưu ý**: `HF_ENDPOINT=https://hf-mirror.com` dùng mirror HuggingFace Trung Quốc để tránh timeout khi tải model. Nếu ở nước ngoài và truy cập `huggingface.co` bình thường, có thể bỏ biến này.

Server sẽ chạy ở `http://localhost:8000`. Kiểm tra:

```bash
curl http://localhost:8000/health
# → {"status":"ok","backend":"onnx","max_streams":1,"active":0,"waiting":0,"sample_rate":48000}
```

## Cấu hình app

Thêm vào `apps/web/.env.local`:

```bash
VIENEU_ENDPOINT=http://localhost:8000/v1/audio/speech
VIENEU_MODEL=vieneu-v3-turbo
VIENEU_API_KEY=x
```

> `VIENEU_API_KEY` mặc định là `x` vì VieNeu local không yêu cầu auth. Nếu deploy VieNeu ra ngoài và bật auth, set key thật vào đây.

### Cache giọng đọc

Audio hợp lệ được lưu trong `apps/web/.local_storage/speech/vieneu/`. Những lần
chạy lại dùng cùng nội dung, giọng, tốc độ, endpoint và model sẽ dùng lại audio,
không gọi VieNeu. Cache dùng nội dung sau chuẩn hoá phát âm và giọng đã resolve,
nên các alias của cùng một giọng dùng chung cache. File được kiểm tra bằng ffprobe
trước khi dùng lại; audio hỏng được tạo lại và lỗi tạo giọng không được lưu cache.

Đổi nội dung/giọng/tốc độ/model sẽ tạo cache mới. Nếu thay weights hoặc voice preset
trên server nhưng giữ nguyên tên model và endpoint, xoá thư mục cache để tạo lại.

## Chạy test

### Test VieNeu provider

```bash
cd apps/web
bun test src/providers/tts/vieneu.test.ts
```

5 tests:
1. Gửi OpenAI-compatible request, ghi WAV hợp lệ
2. Map Edge TTS voice IDs, fallback cho unknown voices
3. Retry 429 với exponential backoff, honor `Retry-After`
4. Bỏ cuộc sau `MAX_RETRIES` lần 429 liên tiếp
5. Reject empty text, surface server errors với `Retry-After`

### Test nhanh end-to-end

```bash
cd apps/web
bun --env-file=.env.local run scripts/test-tts.mjs
```

Script sẽ:
1. Đọc `VIENEU_ENDPOINT` từ `.env.local`
2. Tạo giọng test "Xin chào, đây là bài kiểm tra giọng đọc tiếng Việt của VieNeu TTS."
3. In duration, file size, FFmpeg probe

## Troubleshooting

### Lỗi "VIENEU_ENDPOINT chưa được cấu hình"

→ Chưa set `VIENEU_ENDPOINT` trong `.env.local`. Copy từ `.env.example` và uncomment dòng VieNeu.

### Lỗi "VieNeu (server không chạy?)"

→ VieNeu server chưa start. Chạy lại:
```bash
cd VieNeu-TTS
HF_ENDPOINT=https://hf-mirror.com uv run python -m apps.openai_speech
```

### Lỗi HTTP 429 liên tục

→ VieNeu CPU mode chỉ support 1 stream. Provider đã có retry với exponential backoff (1s, 2s, 4s, 8s, 16s). Nếu vẫn 429, giảm số segment xử lý đồng thời hoặc nâng cấp lên GPU mode.

### Audio bị ngắt / duration sai

→ Kiểm tra FFmpeg đã cài:
```bash
ffmpeg -version
```

### Model tải chậm / timeout

→ Dùng mirror:
```bash
HF_ENDPOINT=https://hf-mirror.com uv run python -m apps.openai_speech
```

## Thêm provider mới

Nếu sau này muốn thêm provider khác (Azure, FPT.AI, …):

1. Tạo file mới trong `providers/tts/` (vd: `azure.ts`)
2. Implement interface `TTSProvider` từ `types.ts`
3. Throw `SpeechProviderError` khi lỗi
4. Update `createDefaultTTSProvider()` trong `service.ts` để chọn provider dựa trên env vars
5. Thêm tests trong `azure.test.ts`

Không cần đụng đến `types.ts` — interface đã đủ generic.
