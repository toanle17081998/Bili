# Plan: Chia video dài thành nhiều project nhỏ

## Mục tiêu

Cho phép user mở editor → click "Chia video" → chọn 1 video đã tải từ Bilibili → đánh dấu các điểm cắt thủ công trên timeline → tạo N project mới, mỗi project chứa 1 đoạn video đã cắt.

## Quyết định đã chốt (từ user)

| Câu hỏi | Quyết định |
|---|---|
| Video nguồn | Video đã tải về từ Bilibili (file `.mp4` trong `.local_storage/downloads/`) |
| Cách chia | Chọn thời điểm cắt thủ công (xem video + đánh dấu cut points) |
| Nội dung project mới | Chỉ video đã cắt (1 media asset, chưa có edit) |
| Vị trí UI | Trong editor (button trên header) |
| Lưu trữ media | Copy file vào IndexedDB/OPFS của mỗi project mới |
| Sau khi tạo | Chuyển sang project đầu tiên |

## Kiến trúc

Theo AGENTS.md, logic thuộc về `rust/`, UI thuộc về `apps/web/`. Tuy nhiên:
- FFmpeg đã được sử dụng trực tiếp từ web qua `FFmpegService` (Node.js spawn) — pattern hiện tại
- Chức năng này chủ yếu là UI orchestration + gọi ffmpeg, không có logic tính toán phức tạp
- **Quyết định**: Giữ theo pattern hiện tại — thêm API route ở web, không cần crate Rust mới

## Files cần tạo

### 1. `apps/web/src/app/api/source/split/route.ts` (API mới)

POST endpoint nhận:
```ts
{
  sourceVideoPath: string,  // path tuyệt đối tới file gốc
  cuts: number[],           // mảng thời điểm cắt (giây), sorted ascending
  baseName: string          // tên gốc để đặt tên project con
}
```

Logic:
1. Validate `cuts` (sorted, không trùng, trong khoảng [0, duration])
2. Tạo thư mục tạm `.local_storage/splits/{uuid}/`
3. Dùng `FFmpegService.runCommand("ffmpeg", ...)` với filter `segment` để cắt:
   ```
   ffmpeg -i input.mp4 -f segment -segment_times 30,60,90 -reset_timestamps 1
          -c copy part_%03d.mp4
   ```
   - `-c copy` để cắt nhanh không re-encode
   - `reset_timestamps 1` để mỗi part bắt đầu từ 0
4. Trả về danh sách file paths + metadata (duration từng part)

### 2. `apps/web/src/services/split-video/index.ts` (Service mới)

```ts
export interface SplitPart {
  index: number;
  filePath: string;        // path tạm sau khi ffmpeg cắt
  duration: number;        // giây
  startTime: number;       // thời điểm bắt đầu trong video gốc
  endTime: number;         // thời điểm kết thúc
}

export interface SplitResult {
  parts: SplitPart[];
  sourceVideoPath: string;
}

export async function listDownloadedVideos(): Promise<DownloadedVideo[]>;
export async function probeVideoDuration(path: string): Promise<number>;
export async function splitVideo({ sourceVideoPath, cuts }): Promise<SplitResult>;
export async function createProjectsFromSplits({
  parts, baseName, editor
}): Promise<string[]>;  // trả về danh sách project IDs
```

`createProjectsFromSplits`:
1. Với mỗi part:
   - Tạo project mới: `editor.project.createNewProject({ name: \`${baseName} - Part ${i+1}\` })`
   - Đọc file part thành `File` object
   - Tạo `MediaAsset` (type: "video", duration, width, height từ probe)
   - Gọi `editor.media.addMediaAsset({ projectId, asset })` → tự động copy vào IndexedDB/OPFS
   - Thêm element vào timeline (track video) — dùng command `InsertElementCommand`
2. Cleanup file tạm trong `.local_storage/splits/`

### 3. `apps/web/src/components/editor/split-video-dialog.tsx` (UI mới)

Multi-step dialog:

**Step 1 — Chọn video:**
- Gọi `GET /api/source/list-downloads` (cần tạo thêm) để list file `.mp4` trong `.local_storage/downloads/`
- Hiển thị grid: thumbnail (lấy từ frame đầu) + tên + duration
- Click để chọn

**Step 2 — Đánh dấu cut points:**
- Video player (HTML5 `<video>` với src = `/api/media/stream?file=...`)
- Timeline bar bên dưới với:
  - Playhead
  - Các marker cut (draggable để điều chỉnh)
  - Button "Add cut at current time"
- Bảng bên phải liệt kê các cuts với thời gian, cho phép xóa/sửa
- Preview: hiển thị "Sẽ tạo N đoạn: 0:00-1:30, 1:30-3:00, ..."

**Step 3 — Confirm & tạo:**
- Input tên base (mặc định = tên file gốc)
- Button "Tạo N projects"
- Loading state với progress (cắt ffmpeg + tạo N projects)
- Toast thông báo hoàn thành
- Redirect sang `/editor/{firstProjectId}`

### 4. `apps/web/src/app/api/source/list-downloads/route.ts` (API mới)

GET endpoint:
- Đọc `.local_storage/downloads/*.mp4`
- Với mỗi file: probe duration bằng `FFmpegService.probeVideo()`
- Trả về `{ id, name, path, duration, thumbnail? }[]`

### 5. `apps/web/src/components/editor/split-video-button.tsx` (UI mới)

Button "Chia video" trên editor header, mở `SplitVideoDialog`.

## Files cần sửa

### `apps/web/src/components/editor/editor-header.tsx`
- Thêm `<SplitVideoButton />` cạnh các button hiện có (Export, v.v.)

### `apps/web/src/media/ffmpeg/index.ts`
- Thêm method `splitVideo({ inputPath, cuts, outputDir })` để gọi ffmpeg segment
- (Optional) Có thể để logic trong API route, không cần method mới

## Flow chi tiết

```
[Editor Header] → click "Chia video"
       ↓
[SplitVideoDialog mở]
       ↓
Step 1: GET /api/source/list-downloads → chọn video
       ↓
Step 2: User xem video, thêm cut points
       ↓
Step 3: Click "Tạo N projects"
       ↓
POST /api/source/split { sourceVideoPath, cuts }
       ↓
FFmpeg cắt thành N file tạm
       ↓
Với mỗi file:
  - editor.project.createNewProject()
  - editor.media.addMediaAsset()  ← copy vào IndexedDB/OPFS
  - InsertElementCommand (thêm vào timeline)
       ↓
Cleanup file tạm
       ↓
router.push(/editor/{firstProjectId})
```

## Edge cases & validation

| Case | Xử lý |
|---|---|
| Video < 10s | Disable button "Add cut", yêu cầu video dài hơn |
| Cut points không sorted | Auto-sort khi thêm |
| Cut point trùng | Validate, không cho thêm |
| Cut point ngoài [0, duration] | Clamp về [0, duration] |
| Storage quota đầy | Catch error từ `addMediaAsset`, hiển thị toast, dừng tạo |
| FFmpeg fail | Cleanup file tạm, hiển thị error |
| User đóng dialog giữa chừng | Cleanup file tạm nếu đã cắt |
| Project tạo fail giữa chừng | Tiếp tục tạo các project còn lại, báo lỗi cuối |

## Testing

- Unit test cho `splitVideo` service (mock ffmpeg)
- Manual test với video 5 phút, cắt thành 3 đoạn
- Test edge cases: video rất ngắn, storage đầy, cancel giữa chừng

## Out of scope (làm sau nếu cần)

- Chia theo thời lượng tự động (max duration)
- Chia theo số phần
- Auto-detect scene changes để gợi ý cut points
- Áp dụng template edit cho mỗi project mới
- Upload file từ máy (chỉ hỗ trợ video đã tải từ Bilibili)

## Triển khai thực tế — 2026-10-14

Các điều chỉnh so với bản thiết kế ban đầu:

- **Kiến trúc:** tuân thủ `AGENTS.md`; validation, sắp xếp cut points, lập khoảng
  thời gian và kiểm tra video có frame nằm trong `rust/crates/split-video/`.
  Browser và server cùng dùng `split-video.wasm`. Build: `bun run build:split-video`.
- **Điểm cắt:** mã hóa H.264/AAC từng đoạn thay vì `-c copy`, tránh lệch theo keyframe.
  Mốc cắt kiểm tra theo thời lượng video stream; giữ FPS chính xác (kể cả 29.97),
  kích thước và audio đầu tiên của video gốc.
- **Project:** `ProjectManager.createProjectFromVideo()` lưu project độc lập,
  không chuyển active project trong quá trình tạo. Chỉ mở project đầu tiên sau
  khi toàn bộ thao tác thành công. Mỗi project có một video ở thời điểm 0.
- **Lưu trữ:** file được copy vào OPFS của project; metadata/project được lưu vào
  IndexedDB. Các thao tác ghi đợi transaction commit; lỗi sẽ rollback project dở.
  FPS và `hasAudio` được lưu/khôi phục cùng metadata media.
- **API:** `GET /api/source/list-downloads` (kèm thumbnail frame đầu),
  `GET /api/source/split/core`, `POST /api/source/split`,
  `GET /api/source/split?batchId=...&part=...`, `DELETE /api/source/split?batchId=...`.
  Batch IDs giới hạn UUID, nguồn chỉ nhận MP4 trực tiếp trong downloads.
- **UI:** nút “Chia video” trên header, dialog chọn video → xem/seek/add/edit/drag/delete
  cut points → đặt tên/xác nhận. Có progress, hủy, báo lỗi từng phần và link tới
  các project đã lưu nếu không hoàn thành toàn bộ.
- **Cleanup:** dừng FFmpeg khi hủy, đợi process đóng file rồi dọn batch. Thành công
  cũng dọn file tạm; batch bỏ dở có TTL một giờ. Không xóa video gốc.

Kiểm tra: Rust WASM ABI, điểm cắt không phải keyframe, frame đầu từng đoạn,
timestamp reset, audio, FPS phân số, audio tail, tải file/cleanup/hủy, IndexedDB
commit/quota-abort, và Playwright end-to-end tạo/lưu/mở lại nhiều project.

### Sửa lỗi mất mốc/project khi reload — 2026-10-14

- Bản đầu chỉ giữ cuts trong React state, POST đợi encode hoàn tất và cleanup khi
  rời tab/lỗi. Không thể lấy lại mốc cũ nếu chưa có bản lưu nào; lúc điều tra thư
  mục `splits` rỗng. Không tuyên bố khôi phục được các mốc đã mất ở bản đầu.
- Draft lưu ở browser + `.local_storage/split-jobs/{batchId}.json` ngay khi chỉnh
  mốc hợp lệ. Web Locks bảo vệ thao tác lưu giữa các tab; bản sửa cũ không ghi đè
  bản mới, xung đột được giữ thành bản nháp riêng.
- POST trả 202, job nền tiếp tục khi reload/rời editor. GET trả trạng thái/tiến độ,
  PUT autosave, PATCH checkpoint/pause/complete. Stop khác với đóng hộp thoại.
- Projects có card bản nháp/phiên chưa hoàn tất và nút tiếp tục. ID project/media
  ổn định theo batch/part; kiểm tra dữ liệu thực trong browser để không tạo trùng
  và để khôi phục import dở. Thất bại ở bước complete vẫn có thể thử lại.
- Job metadata giữ lại khi lỗi/hết hạn media. Các thao tác server được serialize
  theo batch, registries sống qua Next hot reload; discard có tombstone chống
  request keepalive cũ làm sống lại bản nháp.
- Kiểm tra trên **http://127.0.0.1:3000**: reload sau chọn mốc, rời editor khi job
  đang chạy, reload sau khi lưu part đầu, tiếp tục không trùng, lỗi complete sau
  mọi checkpoint, đủ project thực sự hiển thị ở Projects và original không đổi.
  Kiểm tra hai tab: đóng tab cũ không mất mốc mới; chỉnh sửa xung đột giữ cả hai.
