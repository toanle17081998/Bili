//! Shared story policy. Hosts perform IO; schemas, prompts, evidence checks,
//! editing, timing and FFmpeg render plans live here for web and desktop.
use serde_json::{Value, json};
use std::collections::HashSet;

mod prompts;
#[cfg(test)]
mod tests;

type Result<T> = std::result::Result<T, String>;
fn err(message: &str) -> String {
    message.to_owned()
}
fn number(v: &Value, key: &str) -> Result<f64> {
    v[key]
        .as_f64()
        .filter(|n| n.is_finite())
        .ok_or_else(|| format!("{key}: cần số hữu hạn"))
}
fn text<'a>(v: &'a Value, key: &str) -> Result<&'a str> {
    v[key]
        .as_str()
        .filter(|s| !s.trim().is_empty() && s.len() <= 24000)
        .ok_or_else(|| format!("{key}: nội dung trống hoặc quá dài"))
}
fn list<'a>(v: &'a Value, key: &str) -> Result<&'a Vec<Value>> {
    v[key]
        .as_array()
        .filter(|a| a.len() <= 2000)
        .ok_or_else(|| format!("{key}: danh sách không hợp lệ"))
}
fn range(v: &Value, duration: f64, start: &str, end: &str) -> Result<(f64, f64)> {
    let (a, b) = (number(v, start)?, number(v, end)?);
    if a < 0.0 || b <= a || b > duration + 0.001 {
        return Err(err("Mốc thời gian nằm ngoài video"));
    }
    Ok((a, b))
}
fn event_range(v: &Value, duration: f64) -> Result<(f64, f64)> {
    let (start, end) = (number(v, "start")?, number(v, "end")?);
    // A frame-grounded observation or an audio impulse can be instantaneous.
    // Do not invent a duration for it or relax positive narration slot lengths.
    if start < 0.0 || end < start || end > duration + 0.001 {
        return Err(format!(
            "Mốc sự kiện {start:.3}–{end:.3}s không hợp lệ trong video {duration:.3}s: mốc kết thúc phải từ mốc bắt đầu trở đi."
        ));
    }
    Ok((start, end))
}
fn ids<'a>(
    v: &'a Value,
    key: &str,
    allowed: &HashSet<&str>,
    required: bool,
) -> Result<Vec<&'a str>> {
    let a = list(v, key)?;
    let mut seen = HashSet::new();
    let result: Vec<_> = a
        .iter()
        .map(|s| s.as_str().ok_or_else(|| err("ID không hợp lệ")))
        .collect::<Result<_>>()?;
    if (required && result.is_empty())
        || result
            .iter()
            .any(|s| !allowed.contains(s) || !seen.insert(*s))
    {
        return Err(format!(
            "{key}: thiếu bằng chứng, ID trùng hoặc không tồn tại"
        ));
    }
    Ok(result)
}
fn event_ids(events: &[Value]) -> Result<HashSet<&str>> {
    let mut result = HashSet::new();
    for event in events {
        if !result.insert(text(event, "id")?) {
            return Err(err("ID sự kiện trùng nhau"));
        }
    }
    Ok(result)
}
pub fn defaults() -> Value {
    json!({"schema_version":1,"voice":"Hải Đăng","settings":{"language":"vi","style":"dramatic_challenge","drama":0.6,"humor":0.2,"speaking_rate":1.0,"density":0.65,"sentence_words":24,"perspective":"third","notes":""},
        "mix":{"original_volume":0.8,"voice_volume":1.0,"ducking":true,"quality":"standard"},
        "limits":{"max_duration":3600,"window_seconds":30,"sample_seconds":2.0,"max_frames":24,"max_retries":2,"max_shorten":1,"max_tempo":1.2,"job_timeout_ms":7200000,"stage_timeout_ms":240000,"max_jobs":2,"request_max_bytes":2097152,"ai_output_tokens":16384}})
}
fn settings(v: &Value) -> Result<Value> {
    let mut s = defaults()["settings"].clone();
    if let Some(fields) = v.as_object() {
        for (k, value) in fields {
            s[k] = value.clone();
        }
    }
    if ![
        "dramatic_challenge",
        "funny_commentary",
        "documentary",
        "engineering_explainer",
        "viral_short_form",
    ]
    .contains(&text(&s, "style")?)
    {
        return Err(err("Phong cách không được hỗ trợ"));
    }
    if !["first", "third"].contains(&text(&s, "perspective")?) {
        return Err(err("Ngôi kể không hợp lệ"));
    }
    for key in ["drama", "humor", "density"] {
        if !(0.0..=1.0).contains(&number(&s, key)?) {
            return Err(err("Mức độ phải từ 0 đến 1"));
        }
    }
    if !(0.8..=1.2).contains(&number(&s, "speaking_rate")?)
        || !(8.0..=50.0).contains(&number(&s, "sentence_words")?)
    {
        return Err(err("Tốc độ kể hoặc độ dài câu không hợp lệ"));
    }
    if s["language"]
        .as_str()
        .is_none_or(|s| s.is_empty() || s.len() > 40)
        || s["notes"].as_str().is_none_or(|s| s.len() > 4000)
    {
        return Err(err("Ngôn ngữ hoặc ghi chú không hợp lệ"));
    }
    Ok(s)
}
fn plan(v: &Value) -> Result<Value> {
    let duration = number(v, "duration")?;
    if duration <= 0.0 || duration > 3600.0 {
        return Err(err("Video phải dài hơn 0 và tối đa 60 phút"));
    }
    let mut cuts = vec![0.0];
    // FFmpeg showinfo reports actual transition timestamps, not evenly spaced guesses.
    if let Some(log) = v["scene_log"].as_str() {
        for line in log.lines() {
            if let Some(tail) = line.split("pts_time:").nth(1) {
                if let Some(time) = tail
                    .split_whitespace()
                    .next()
                    .and_then(|s| s.parse::<f64>().ok())
                {
                    if time.is_finite() && time > 0.0 && time < duration {
                        cuts.push(time);
                    }
                }
            }
        }
    }
    cuts.sort_by(f64::total_cmp);
    cuts.dedup_by(|a, b| (*a - *b).abs() < 0.05);
    cuts.push(duration);
    let scenes: Vec<_> = cuts
        .windows(2)
        .enumerate()
        .map(|(i, w)| json!({"id":format!("scene_{i}"),"start":w[0],"end":w[1]}))
        .collect();
    let mut windows = vec![];
    let mut start = 0.0;
    while start < duration - 0.001 {
        let end = (start + 30.0).min(duration);
        let margin = (1.0
            / v["fps"]
                .as_f64()
                .filter(|f| f.is_finite() && *f > 0.0)
                .unwrap_or(8.0)
            + 0.01)
            .max(0.05);
        let last = (end - margin).max(start);
        let mut times = vec![start];
        let mut t = start + 2.0;
        while t < end - 0.05 {
            times.push(t);
            t += 2.0;
        }
        times.push(last);
        for cut in &cuts {
            if *cut > start && *cut < last {
                times.push((*cut + 0.1).min(last));
            }
        }
        times.sort_by(f64::total_cmp);
        times.dedup_by(|a, b| (*a - *b).abs() < 0.05);
        // Retain beginning, end and evenly distributed action samples in busy edits.
        if times.len() > 24 {
            let last = times.len() - 1;
            times = (0..24).map(|i| times[i * last / 23]).collect();
        }
        windows.push(json!({"index":windows.len(),"start":start,"end":end,"frame_times":times}));
        start = end;
    }
    Ok(json!({"scenes":scenes,"windows":windows}))
}
fn frame_index(v: &Value) -> Result<Vec<f64>> {
    let frames = v["frames"]
        .as_array()
        .filter(|frames| frames.len() <= 1_000_000)
        .ok_or_else(|| err("Danh sách khung hình video không hợp lệ"))?;
    let mut times: Vec<f64> = frames
        .iter()
        .filter_map(|frame| {
            frame.as_f64().or_else(|| {
                frame["best_effort_timestamp_time"]
                    .as_str()
                    .and_then(|s| s.parse().ok())
            })
        })
        .filter(|time| time.is_finite() && *time >= 0.0)
        .collect();
    times.sort_by(f64::total_cmp);
    times.dedup();
    if times.is_empty() {
        return Err(err("Không đọc được timestamp khung hình thực tế của video"));
    }
    Ok(times)
}
fn window_frames(v: &Value) -> Result<Value> {
    let duration = number(v, "duration")?;
    let (start, end) = range(&v["window"], duration, "start", "end")?;
    let index = frame_index(v)?;
    // Container/audio duration may extend past the final video frame. Select
    // actual presentation timestamps, including for previously cached windows.
    let first = index.partition_point(|time| *time < start);
    let last = index.partition_point(|time| *time < end);
    let available = &index[first..last];
    let mut window = v["window"].clone();
    if available.is_empty() {
        window["frame_times"] = json!([]);
        return Ok(
            json!({"window":window,"samples":[],"uncertainty":format!("Đoạn {start:.3}–{end:.3}s không có khung hình video; không suy diễn hình ảnh trong phần âm thanh còn lại.")}),
        );
    }
    let mut times = vec![available[0], *available.last().unwrap()];
    for requested in list(&window, "frame_times")? {
        let requested = requested
            .as_f64()
            .filter(|time| time.is_finite())
            .ok_or_else(|| err("Mốc lấy mẫu khung hình không hợp lệ"))?;
        let position = available.partition_point(|time| *time <= requested);
        times.push(available[position.saturating_sub(1)]);
    }
    times.sort_by(f64::total_cmp);
    times.dedup();
    if times.len() > 24 {
        let last = times.len() - 1;
        times = (0..24).map(|i| times[i * last / 23]).collect();
    }
    window["frame_times"] = json!(times);
    // Seek just before the known PTS so decimal/microsecond rounding cannot
    // discard the target frame at EOF. Evidence retains the actual frame time.
    let samples: Vec<_> = times
        .iter()
        .map(|time| json!({"time":time,"seek_time":(time-0.000001).max(0.0)}))
        .collect();
    Ok(json!({"window":window,"samples":samples}))
}
fn validate_events(v: &Value) -> Result<Value> {
    let duration = number(v, "duration")?;
    let (start, end) = range(&v["window"], duration, "start", "end")?;
    let times = list(&v["window"], "frame_times")?;
    let events = list(&v["result"], "events")?;
    if events.len() > 80 {
        return Err(err("Quá nhiều sự kiện trong một đoạn video"));
    }
    let mut output = vec![];
    for (i, e) in events.iter().enumerate() {
        let (a, b) = event_range(e, duration).map_err(|message| {
            format!(
                "Sự kiện {} của cửa sổ {}: {message}",
                i + 1,
                v["window"]["index"].as_u64().unwrap_or(0) + 1
            )
        })?;
        if a < start - 0.001 || b > end + 0.001 {
            return Err(err("Sự kiện nằm ngoài clip bằng chứng"));
        }
        text(e, "description")?;
        text(e, "event_type")?;
        if ![
            "challenge_setup",
            "build",
            "test",
            "failure",
            "improvement",
            "success",
            "result",
            "observation",
            "sound",
            "speech",
        ]
        .contains(&text(e, "event_type")?)
        {
            return Err(err("Loại sự kiện không hợp lệ"));
        }
        if !(0.0..=1.0).contains(&number(e, "confidence")?) {
            return Err(err("Độ tin cậy không hợp lệ"));
        }
        if !["low", "medium", "high"].contains(&text(e, "importance")?) {
            return Err(err("Mức quan trọng không hợp lệ"));
        }
        for object in list(e, "objects")? {
            if object.as_str().is_none() {
                return Err(err("Đối tượng không hợp lệ"));
            }
        }
        let source = text(e, "source")?;
        if !["video", "audio", "both"].contains(&source) {
            return Err(err("Nguồn bằng chứng không hợp lệ"));
        }
        if source != "video" && v["audio_available"] != true {
            return Err(err("Provider chưa nghe audio; không thể xác nhận âm thanh"));
        }
        let evidence = list(e, "evidence_times")?;
        if evidence.is_empty()
            || evidence.iter().any(|t| {
                t.as_f64().is_none_or(|t| {
                    !t.is_finite()
                        || t < a - 0.001
                        || t > b + 0.001
                        || (source == "video"
                            && v["video_available"] != true
                            && !times
                                .iter()
                                .any(|x| x.as_f64().is_some_and(|x| (t - x).abs() < 0.15)))
                })
            })
        {
            return Err(err("Sự kiện thiếu timestamp bằng chứng tương ứng"));
        }
        if source == "audio" && ["success", "failure", "result"].contains(&text(e, "event_type")?) {
            return Err(err("Không kết luận kết quả chỉ từ âm thanh"));
        }
        if !e["preserve_audio"].is_boolean() {
            return Err(err("Thiếu preserve_audio"));
        }
        if e["preserve_audio"] == true && source == "video" {
            return Err(err("Khoảng giữ âm cần bằng chứng audio"));
        }
        let mut e = e.clone();
        e["id"] = json!(format!("w{}_e{i}", v["window"]["index"]));
        e["instantaneous"] = json!(a == b);
        output.push(e);
    }
    output.sort_by(|a, b| {
        a["start"]
            .as_f64()
            .unwrap()
            .total_cmp(&b["start"].as_f64().unwrap())
    });
    let uncertainties = list(&v["result"], "uncertainties")?;
    if uncertainties.iter().any(|s| {
        s.as_str()
            .is_none_or(|s| s.trim().is_empty() || s.len() > 4000)
    }) {
        return Err(err("uncertainties phải là danh sách chuỗi văn bản"));
    }
    Ok(json!({"events":output,"uncertainties":uncertainties}))
}
fn validate_story(v: &Value) -> Result<Value> {
    let events = list(v, "events")?;
    let allowed = event_ids(events)?;
    let story = &v["story"];
    text(story, "title")?;
    text(story, "summary")?;
    let understanding = &story["understanding"];
    let claim_keys = [
        "main_character",
        "setting",
        "central_challenge",
        "goal",
        "stakes",
        "initial_situation",
        "obstacles",
        "attempts",
        "turning_point",
        "climax",
        "resolution",
        "final_outcome",
    ];
    if !understanding.is_object()
        || understanding
            .as_object()
            .unwrap()
            .keys()
            .any(|k| !claim_keys.contains(&k.as_str()))
    {
        return Err(err("Các trường hiểu biết câu chuyện không hợp lệ"));
    }
    for key in claim_keys {
        if understanding.get(key).is_none() {
            return Err(err("Thiếu trường hiểu biết; dùng null khi chưa rõ"));
        }
        let claim = &understanding[key];
        if claim.is_null() {
            continue;
        }
        text(claim, "text")?;
        ids(claim, "event_ids", &allowed, true)?;
    }
    if !understanding.is_object() {
        return Err(err("Thiếu hiểu biết câu chuyện tổng thể"));
    }
    let outcome = text(story, "outcome")?;
    if !["success", "failure", "partial", "unknown"].contains(&outcome) {
        return Err(err("Kết quả không hợp lệ"));
    }
    let outcome_ids = ids(story, "outcome_event_ids", &allowed, outcome != "unknown")?;
    if outcome != "unknown"
        && !events.iter().any(|e| {
            outcome_ids.contains(&e["id"].as_str().unwrap_or(""))
                && e["source"] != "audio"
                && e["confidence"].as_f64().unwrap_or(0.0) >= 0.7
                && match outcome {
                    "success" => e["event_type"] == "success",
                    "failure" => e["event_type"] == "failure",
                    _ => e["event_type"] == "result",
                }
        })
    {
        return Err(err(
            "Kết quả chưa có sự kiện hình ảnh xác nhận đủ tin cậy; dùng unknown",
        ));
    }
    if outcome != "unknown" {
        let result_time = events
            .iter()
            .filter(|e| outcome_ids.contains(&e["id"].as_str().unwrap_or("")))
            .map(|e| e["end"].as_f64().unwrap_or(0.0))
            .fold(0.0, f64::max);
        if events.iter().any(|e| {
            e["end"].as_f64().unwrap_or(0.0) > result_time + 0.05
                && [
                    "test",
                    "build",
                    "improvement",
                    "success",
                    "failure",
                    "result",
                ]
                .contains(&e["event_type"].as_str().unwrap_or(""))
        }) {
            return Err(err(
                "Kết quả được chọn xảy ra trước diễn biến tiếp theo; xác định lại kết quả cuối hoặc dùng unknown",
            ));
        }
    }
    if outcome == "unknown" && !understanding["final_outcome"].is_null() {
        return Err(err("Kết quả unknown phải để final_outcome trống"));
    }
    for link in list(story, "causal_links")? {
        ids(link, "event_ids", &allowed, true)?;
        text(link, "explanation")?;
        if link["observed"] != true {
            return Err(err("Quan hệ nhân quả chưa được quan sát"));
        }
    }
    for act in list(story, "outline")? {
        text(act, "role")?;
        text(act, "description")?;
        ids(act, "event_ids", &allowed, true)?;
    }
    let paragraphs = list(story, "paragraphs")?;
    if paragraphs.is_empty() || paragraphs.len() > 500 {
        return Err(err("Kịch bản trống hoặc quá nhiều đoạn"));
    }
    let mut seen = HashSet::new();
    for p in paragraphs {
        if !seen.insert(text(p, "id")?) {
            return Err(err("ID đoạn kịch bản trùng"));
        }
        text(p, "text")?;
        text(p, "role")?;
        ids(p, "event_ids", &allowed, true)?;
    }
    let mut story = story.clone();
    story["full_script"] = json!(
        paragraphs
            .iter()
            .map(|p| p["text"].as_str().unwrap())
            .collect::<Vec<_>>()
            .join("\n\n")
    );
    Ok(story)
}
fn validate_segments(v: &Value) -> Result<Value> {
    let duration = number(v, "duration")?;
    let events = list(v, "events")?;
    let allowed = event_ids(events)?;
    let paragraphs = list(&v["story"], "paragraphs")?;
    let segments = list(v, "segments")?;
    if segments.len() != paragraphs.len() {
        return Err(err(
            "Mỗi đoạn phải lấy từ kịch bản tổng thể theo đúng thứ tự",
        ));
    }
    let mut previous_end = 0.0;
    let mut seen = HashSet::new();
    let mut output = segments.clone();
    for (index, s) in output.iter_mut().enumerate() {
        let (a, b) = range(s, duration, "start_time", "end_time")?;
        if a < previous_end - 0.001 {
            return Err(err("Các đoạn thuyết minh bị chồng thời gian"));
        }
        previous_end = b;
        if !seen.insert(text(s, "segment_id")?.to_owned()) {
            return Err(err("ID segment bị trùng"));
        }
        let paragraph = &paragraphs[index];
        if s["paragraph_id"] != paragraph["id"]
            || text(s, "narration_text")?.trim() != text(paragraph, "text")?.trim()
        {
            return Err(err(
                "Lời đọc khác kịch bản tổng thể; hãy cập nhật đoạn kịch bản trước",
            ));
        }
        text(s, "story_role")?;
        text(s, "emotion")?;
        let refs = ids(s, "associated_event_ids", &allowed, true)?;
        if refs.iter().any(|id| {
            !paragraph["event_ids"]
                .as_array()
                .unwrap()
                .iter()
                .any(|e| e.as_str() == Some(id))
        }) {
            return Err(err("Segment tham chiếu ngoài bằng chứng của đoạn kịch bản"));
        }
        let referenced: Vec<_> = events
            .iter()
            .filter(|e| refs.contains(&e["id"].as_str().unwrap_or("")))
            .collect();
        let first = referenced
            .iter()
            .map(|e| number(e, "start").unwrap_or(duration))
            .fold(duration, f64::min);
        let last = referenced
            .iter()
            .map(|e| number(e, "end").unwrap_or(0.0))
            .fold(0.0, f64::max);
        if (a < first - 0.05 && s["intentional_lead_in"] != true) || a > last + 0.05 || b < first {
            return Err(err(
                "Lời đọc chưa khớp hình ảnh; câu dẫn trước phải được đánh dấu rõ",
            ));
        }
        let (before, after, rate) = (
            number(s, "pause_before")?,
            number(s, "pause_after")?,
            number(s, "speaking_rate")?,
        );
        if before < 0.0 || after < 0.0 || before + after >= b - a || !(0.8..=1.2).contains(&rate) {
            return Err(err("Khoảng nghỉ hoặc tốc độ đọc không hợp lệ"));
        }
        let words = text(s, "narration_text")?.split_whitespace().count();
        s["estimated_duration"] = json!(words as f64 / (3.2 * rate));
        if s["locked"].is_null() {
            s["locked"] = json!(false);
        }
        if !s["locked"].is_boolean() {
            return Err(err("locked phải là boolean"));
        }
        if s["intentional_lead_in"].is_null() {
            s["intentional_lead_in"] = json!(false);
        }
        if !s["intentional_lead_in"].is_boolean() {
            return Err(err("intentional_lead_in phải là boolean"));
        }
    }
    Ok(json!(output))
}
fn review(v: &Value) -> Result<Value> {
    let mut issues = vec![];
    if let Err(message) = validate_story(v) {
        issues.push(json!({"severity":"error","code":"grounding","message":message}));
    }
    if let Err(message) = validate_segments(v) {
        issues.push(json!({"severity":"error","code":"timeline","message":message}));
    }
    if let Some(segments) = v["segments"].as_array() {
        let mut texts = HashSet::new();
        for s in segments {
            let id = &s["segment_id"];
            let start = s["start_time"].as_f64().unwrap_or(0.0);
            let end = s["end_time"].as_f64().unwrap_or(0.0);
            if s["estimated_duration"].as_f64().unwrap_or(0.0)
                > end
                    - start
                    - s["pause_before"].as_f64().unwrap_or(0.0)
                    - s["pause_after"].as_f64().unwrap_or(0.0)
            {
                issues.push(json!({"severity":"warning","code":"estimated_overflow","segment_id":id,"message":"Lời đọc dự kiến dài hơn slot; sẽ đo và rút gọn sau TTS."}));
            }
            let content = s["narration_text"].as_str().unwrap_or("");
            if !texts.insert(content.trim().to_lowercase()) {
                issues.push(json!({"severity":"warning","code":"repetition","segment_id":id,"message":"Lời đọc lặp lại đoạn trước."}));
            }
            for event in v["events"].as_array().into_iter().flatten() {
                let sound_start = event["start"].as_f64().unwrap_or(0.0);
                let sound_end = event["end"].as_f64().unwrap_or(0.0);
                let overlaps_sound = if sound_start == sound_end {
                    start <= sound_start && end > sound_start
                } else {
                    start < sound_end && end > sound_start
                };
                if event["preserve_audio"] == true
                    && event["confidence"].as_f64().unwrap_or(0.0) >= 0.7
                    && overlaps_sound
                {
                    issues.push(json!({"severity":"error","code":"protected_audio","segment_id":id,"message":"Lời đọc chồng âm thanh/lời nói quan trọng; dời segment hoặc tạo khoảng lặng."}));
                }
            }
        }
    }
    if v["story"]["outcome"] == "unknown" {
        issues.push(json!({"severity":"warning","code":"unknown_outcome","message":"Video chưa đủ bằng chứng để xác định kết quả."}));
    }
    Ok(json!({"issues":issues,"can_synthesize":!issues.iter().any(|i|i["severity"]=="error")}))
}
fn edit(v: &Value) -> Result<Value> {
    let mut project = v["project"].clone();
    let old = project["segments"]
        .as_array()
        .ok_or_else(|| err("Chưa có timeline"))?;
    let index = old
        .iter()
        .position(|s| s["segment_id"] == v["segment_id"])
        .ok_or_else(|| err("Không tìm thấy segment"))?;
    let patch = v["patch"]
        .as_object()
        .ok_or_else(|| err("Thiếu thay đổi"))?;
    if old[index]["locked"] == true && patch.keys().any(|k| k != "locked") {
        return Err(err("Mở khóa segment trước khi sửa"));
    }
    let mut segment = old[index].clone();
    for (k, value) in patch {
        if ![
            "narration_text",
            "start_time",
            "end_time",
            "emotion",
            "speaking_rate",
            "pause_before",
            "pause_after",
            "locked",
        ]
        .contains(&k.as_str())
        {
            return Err(err("Trường sửa không được hỗ trợ"));
        }
        if k == "locked" && !value.is_boolean() {
            return Err(err("locked phải là boolean"));
        }
        segment[k] = value.clone();
    }
    if patch.keys().any(|k| k != "locked") {
        segment.as_object_mut().unwrap().remove("audio");
    }
    project["segments"][index] = segment.clone();
    if patch.contains_key("narration_text") {
        for p in project["story"]["paragraphs"].as_array_mut().unwrap() {
            if p["id"] == segment["paragraph_id"] {
                p["text"] = segment["narration_text"].clone();
            }
        }
        project["story"] = validate_story(&project)?;
    }
    project["segments"] = validate_segments(&project)?;
    project["review"] = review(&project)?;
    for key in ["render", "ai_review"] {
        project.as_object_mut().unwrap().remove(key);
    }
    project["revision"] = json!(project["revision"].as_u64().unwrap_or(0) + 1);
    let edits = project["user_edits"]
        .as_array_mut()
        .ok_or_else(|| err("Thiếu lịch sử chỉnh sửa"))?;
    edits.push(json!({"segment_id":v["segment_id"],"patch":v["patch"]}));
    Ok(project)
}
fn fit(v: &Value) -> Result<Value> {
    let actual = number(v, "actual_duration")?;
    let slot = number(v, "slot_duration")?;
    if actual <= 0.0 || slot <= 0.0 {
        return Err(err("Thời lượng âm thanh không hợp lệ"));
    }
    let tempo = (actual / slot).max(1.0);
    let rate = v["speaking_rate"].as_f64().unwrap_or(1.0);
    if !(0.8..=1.2).contains(&rate) {
        return Err(err("Tốc độ đọc không hợp lệ"));
    }
    let action = if tempo <= 1.0 {
        "ready"
    } else if v["locked"] != true && v["attempt"].as_u64().unwrap_or(0) == 0 {
        "shorten"
    } else if tempo * rate <= 1.2 + 1e-9 {
        "tempo"
    } else {
        "overflow"
    };
    Ok(json!({"action":action,"tempo":tempo,"actual_duration":actual,"slot_duration":slot}))
}
fn extend_slot(v: &Value) -> Result<Value> {
    let p = &v["project"];
    let segments = list(p, "segments")?;
    let index = segments
        .iter()
        .position(|s| s["segment_id"] == v["segment_id"])
        .ok_or_else(|| err("Không tìm thấy segment"))?;
    let s = &segments[index];
    if s["locked"] == true {
        return Ok(p.clone());
    }
    let actual = number(v, "actual_duration")?;
    let end = number(s, "end_time")?;
    let rate = number(s, "speaking_rate")?;
    let required = number(s, "start_time")?
        + number(s, "pause_before")?
        + number(s, "pause_after")?
        + actual * rate / 1.2
        + 0.01;
    let mut boundary = number(p, "duration")?.min(
        segments
            .get(index + 1)
            .and_then(|s| s["start_time"].as_f64())
            .unwrap_or(f64::INFINITY),
    );
    let refs = list(s, "associated_event_ids")?;
    let events = list(p, "events")?;
    let evidence_end = events
        .iter()
        .filter(|e| refs.contains(&e["id"]))
        .map(|e| e["end"].as_f64().unwrap_or(0.0))
        .fold(0.0, f64::max);
    boundary = boundary.min(evidence_end);
    for e in events {
        if !refs.contains(&e["id"])
            && (e["preserve_audio"] == true || e["importance"] == "high")
            && e["end"].as_f64().unwrap_or(0.0) > end
        {
            boundary = boundary.min(e["start"].as_f64().unwrap_or(end));
        }
    }
    if required > end && required <= boundary {
        edit(&json!({"project":p,"segment_id":v["segment_id"],"patch":{"end_time":required}}))
    } else {
        Ok(p.clone())
    }
}
fn prepare(v: &Value) -> Result<Value> {
    let s = settings(&v["settings"])?;
    let mut p = v["project"].clone();
    if !p.is_object()
        || p["source_signature"] != v["source_signature"]
        || p["analysis_key"] != v["analysis_key"]
    {
        p = json!({"schema_version":1,"project_id":v["project_id"],"revision":0,"video_path":v["video_path"],"original_path":v["original_path"],
            "source_signature":v["source_signature"],"timeline_start":v["timeline_start"],"source_element_id":v["source_element_id"],
            "metadata":v["metadata"],"duration":v["metadata"]["duration"],"settings":s,"voice":v["voice"],"mix":defaults()["mix"],
            "scenes":[],"windows":[],"events":[],"uncertainties":[],"analyzed_windows":0,"segments":[],"user_edits":[],"warnings":[],"analysis_key":v["analysis_key"]});
    } else if p["settings"] != s {
        if list(&p, "segments")?.iter().any(|x| x["locked"] == true) {
            return Err(err("Mở khóa các đoạn trước khi đổi phong cách"));
        }
        p["settings"] = s;
        for key in ["story", "review", "ai_review", "render"] {
            p.as_object_mut().unwrap().remove(key);
        }
        p["segments"] = json!([]);
    }
    Ok(p)
}
fn voice(v: &Value) -> Result<Value> {
    let mut p = v["project"].clone();
    text(v, "voice")?;
    if p["voice"] != v["voice"] {
        p["voice"] = v["voice"].clone();
        for s in p["segments"]
            .as_array_mut()
            .ok_or_else(|| err("Thiếu timeline"))?
        {
            s.as_object_mut().unwrap().remove("audio");
        }
        p.as_object_mut().unwrap().remove("render");
        p["revision"] = json!(p["revision"].as_u64().unwrap_or(0) + 1);
    }
    Ok(p)
}
fn save_story(v: &Value) -> Result<Value> {
    let mut p = v["project"].clone();
    let old = p["story"].clone();
    p["story"] = v["story"].clone();
    p["story"] = validate_story(&p)?;
    let mut segments = list(&p, "segments")?.clone();
    let paragraphs = list(&p["story"], "paragraphs")?;
    if segments.len() != paragraphs.len() {
        return Err(err("Sửa số đoạn cần tạo lại timeline"));
    }
    for (i, s) in segments.iter_mut().enumerate() {
        if s["paragraph_id"] != paragraphs[i]["id"] {
            return Err(err("Không đổi ID hoặc thứ tự đoạn đã đồng bộ"));
        }
        if paragraphs[i] != old["paragraphs"][i] {
            if s["locked"] == true {
                return Err(err("Không thể sửa đoạn đã khóa"));
            }
            s["narration_text"] = paragraphs[i]["text"].clone();
            s["associated_event_ids"] = paragraphs[i]["event_ids"].clone();
            s.as_object_mut().unwrap().remove("audio");
        }
    }
    p["segments"] = json!(segments);
    p["segments"] = validate_segments(&p)?;
    p["review"] = review(&p)?;
    for key in ["ai_review", "render"] {
        p.as_object_mut().unwrap().remove(key);
    }
    p["revision"] = json!(p["revision"].as_u64().unwrap_or(0) + 1);
    let saved_story = p["story"].clone();
    p["user_edits"]
        .as_array_mut()
        .unwrap()
        .push(json!({"story":saved_story}));
    Ok(p)
}
fn render_plan(v: &Value) -> Result<Value> {
    let report = review(v)?;
    if report["can_synthesize"] != true {
        return Err(err("Sửa lỗi kịch bản trước khi xuất"));
    }
    let mix = &v["mix"];
    let original = number(mix, "original_volume")?;
    let voice = number(mix, "voice_volume")?;
    if !(0.0..=2.0).contains(&original) || !(0.0..=2.0).contains(&voice) {
        return Err(err("Âm lượng phải từ 0 đến 2"));
    }
    let (crf, preset) = match text(mix, "quality")? {
        "preview" => (28, "ultrafast"),
        "standard" => (20, "fast"),
        "high" => (16, "slow"),
        _ => return Err(err("Chất lượng xuất không hợp lệ")),
    };
    let segments = list(v, "segments")?;
    let duration = number(v, "duration")?;
    let mut filters = vec![];
    let mut labels = String::new();
    for (index, s) in segments.iter().enumerate() {
        let a = &s["audio"];
        text(a, "path")?;
        if a["text"] != s["narration_text"]
            || a["voice"] != v["voice"]
            || a["speaking_rate"] != s["speaking_rate"]
        {
            return Err(err("Giọng đọc đã cũ; tạo lại segment có thay đổi"));
        }
        let slot = number(s, "end_time")?
            - number(s, "start_time")?
            - number(s, "pause_before")?
            - number(s, "pause_after")?;
        let measured = number(a, "duration")?;
        if measured > slot + 0.015 || measured <= 0.0 {
            return Err(err("TTS chưa khớp slot timeline"));
        }
        let delay = ((number(s, "start_time")? + number(s, "pause_before")?) * 1000.0).round();
        let fade = 0.015_f64.min(measured / 4.0);
        let fade_out = (measured - fade).max(0.0);
        filters.push(format!("[{}:a]aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS,afade=t=in:d={fade},afade=t=out:st={fade_out}:d={fade},adelay={delay}:all=1[n{index}]",index+1));
        labels.push_str(&format!("[n{index}]"));
    }
    if segments.is_empty() {
        return Err(err("Chưa có lời đọc"));
    }
    filters.push(format!("{labels}amix=inputs={}:normalize=0,apad,atrim=duration={duration},volume={voice},asplit=2[narration][side]",segments.len()));
    if v["metadata"]["hasAudio"] == true {
        filters.push(format!("[0:a]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration={duration},asetpts=PTS-STARTPTS,volume={original}[background]"));
        if mix["ducking"] == true {
            filters.push("[background][side]sidechaincompress=threshold=0.025:ratio=6:attack=30:release=300[ducked]".into());
        } else {
            filters.push("[side]anullsink;[background]anull[ducked]".into());
        }
        filters.push("[ducked][narration]amix=inputs=2:normalize=0,alimiter=limit=0.95:level=0:latency=1[mixed]".into());
    } else {
        filters
            .push("[side]anullsink;[narration]alimiter=limit=0.95:level=0:latency=1[mixed]".into());
    }
    Ok(json!({"filter_complex":filters.join(";"),"crf":crf,"preset":preset,"duration":duration}))
}
pub fn run(v: Value) -> Result<Value> {
    match v["operation"].as_str().unwrap_or("") {
        "defaults" => Ok(defaults()),
        "settings" => settings(&v["settings"]),
        "plan" => plan(&v),
        "frame_index" => Ok(json!(frame_index(&v)?)),
        "window_frames" => window_frames(&v),
        "validate_events" => validate_events(&v),
        "validate_story" => validate_story(&v),
        "validate_segments" => validate_segments(&v),
        "review" => review(&v),
        "edit" => edit(&v),
        "fit" => fit(&v),
        "extend_slot" => extend_slot(&v),
        "render_plan" => render_plan(&v),
        "prepare" => prepare(&v),
        "voice" => voice(&v),
        "save_story" => save_story(&v),
        "rewrite_text" => Ok(json!(text(&v["result"], "text")?)),
        "captions" => {
            let clock = |seconds: f64| {
                let ms = (seconds * 1000.0).round() as u64;
                format!(
                    "{:02}:{:02}:{:02}.{:03}",
                    ms / 3600000,
                    (ms / 60000) % 60,
                    (ms / 1000) % 60,
                    ms % 1000
                )
            };
            let mut output = String::from("WEBVTT\n\n");
            for s in list(&v, "segments")? {
                let start = number(s, "start_time")? + number(s, "pause_before")?;
                let end = if let Some(duration) = s["audio"]["duration"].as_f64() {
                    start + duration
                } else {
                    number(s, "end_time")? - number(s, "pause_after")?
                };
                let content = text(s, "narration_text")?
                    .replace('&', "&amp;")
                    .replace('<', "&lt;")
                    .replace('>', "&gt;");
                output.push_str(&format!(
                    "{} --> {}\n{}\n\n",
                    clock(start),
                    clock(end),
                    content
                ));
            }
            Ok(json!(output))
        }
        "validate_review" => {
            let allowed: HashSet<_> = list(&v, "segments")?
                .iter()
                .filter_map(|s| s["segment_id"].as_str())
                .collect();
            for issue in list(&v["result"], "issues")? {
                text(issue, "message")?;
                text(issue, "code")?;
                if !["error", "warning"].contains(&text(issue, "severity")?) {
                    return Err(err("Mức lỗi review không hợp lệ"));
                }
                if let Some(id) = issue["segment_id"].as_str() {
                    if !allowed.contains(id) {
                        return Err(err("Review tham chiếu segment không tồn tại"));
                    }
                }
            }
            Ok(v["result"].clone())
        }
        "prompt" => prompts::build(&v),
        _ => Err(err("Thao tác story không được hỗ trợ")),
    }
}

// One instance per request: no shared mutable result state across jobs.
static mut OUTPUT_LEN: usize = 0;
#[unsafe(no_mangle)]
pub extern "C" fn story_alloc(len: usize) -> *mut u8 {
    Box::into_raw(vec![0u8; len].into_boxed_slice()) as *mut u8
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn story_free(ptr: *mut u8, len: usize) {
    unsafe {
        drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)));
    }
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn story_run(ptr: *const u8, len: usize) -> *mut u8 {
    let input = unsafe { std::slice::from_raw_parts(ptr, len) };
    let result = serde_json::from_slice(input)
        .map_err(|e| e.to_string())
        .and_then(run);
    let output = match result {
        Ok(value) => json!({"ok":true,"value":value}),
        Err(message) => json!({"ok":false,"error":message}),
    }
    .to_string()
    .into_bytes()
    .into_boxed_slice();
    unsafe {
        OUTPUT_LEN = output.len();
    }
    Box::into_raw(output) as *mut u8
}
#[unsafe(no_mangle)]
pub extern "C" fn story_output_len() -> usize {
    unsafe { OUTPUT_LEN }
}
