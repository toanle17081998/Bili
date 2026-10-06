//! Platform-independent timing policy for dubbing. NaN denotes an invalid plan.
//! C exports also allow a dependency-free server WASM build with rustc.

#[unsafe(no_mangle)]
pub extern "C" fn dubbing_slot_end(start: f64, end: f64, next_start: f64, video_end: f64) -> f64 {
    if ![start, end, next_start, video_end].iter().all(|v| v.is_finite())
        || start < 0.0 || end <= start || video_end <= start || next_start <= start {
        return f64::NAN;
    }
    end.min(next_start).min(video_end)
}

#[unsafe(no_mangle)]
pub extern "C" fn dubbing_tempo(audio_duration: f64, slot_duration: f64) -> f64 {
    if !audio_duration.is_finite() || !slot_duration.is_finite()
        || audio_duration <= 0.0 || slot_duration < 0.05 {
        return f64::NAN;
    }
    let tempo = (audio_duration / slot_duration).max(1.0);
    // Reject a translation that would become unintelligibly fast. Never truncate words.
    if tempo > 2.5 + 1e-9 { f64::NAN } else { tempo }
}

#[unsafe(no_mangle)]
pub extern "C" fn dubbing_merge(start: f64, end: f64, next_start: f64, next_end: f64) -> i32 {
    i32::from(next_start >= end && next_start - end <= 0.6
        && (end - start < 1.3 || next_end - next_start < 1.3)
        && next_end - start <= 12.0)
}

#[unsafe(no_mangle)]
pub extern "C" fn dubbing_split_word(previous_end: f64, next_start: f64) -> i32 {
    i32::from(next_start - previous_end > 0.8)
}

/// Caption boundaries are presentation details, not speech boundaries. Group nearby
/// phrases into bounded paragraphs; preserve longer pauses as separate TTS requests.
#[unsafe(no_mangle)]
pub extern "C" fn dubbing_join_speech(start: f64, end: f64, next_start: f64, next_end: f64) -> i32 {
    i32::from([start, end, next_start, next_end].iter().all(|v| v.is_finite())
        && start >= 0.0 && end > start && next_end > next_start
        && next_start >= end - 0.011 && next_start - end <= 0.35
        && next_end - start <= 15.0)
}

#[unsafe(no_mangle)]
pub extern "C" fn dubbing_silence(previous_end: f64, next_start: f64) -> f64 {
    if !previous_end.is_finite() || !next_start.is_finite()
        || previous_end < 0.0 || next_start < previous_end - 0.0001 {
        f64::NAN
    } else { (((next_start - previous_end) * 48000.0).round() / 48000.0).max(0.0) }
}
