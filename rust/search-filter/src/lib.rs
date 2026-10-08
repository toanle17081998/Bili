//! Video search filtering shared across UI shells. Bounds are inclusive minutes.
fn matches(duration: f64, minimum: f64, maximum: f64, uploader: &str, channel: &str) -> bool {
    duration.is_finite() && duration >= 0.0
        && (minimum < 0.0 || duration >= minimum * 60.0)
        && (maximum < 0.0 || duration <= maximum * 60.0)
        && uploader.to_lowercase().contains(&channel.trim().to_lowercase())
}

#[unsafe(no_mangle)]
pub extern "C" fn filter_alloc(len: usize) -> *mut u8 {
    Box::into_raw(vec![0u8; len].into_boxed_slice()) as *mut u8
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn filter_free(ptr: *mut u8, len: usize) {
    unsafe { drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len))); }
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn filter_match(duration: f64, minimum: f64, maximum: f64, ptr: *const u8, len: usize) -> u32 {
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    let Ok(text) = std::str::from_utf8(bytes) else { return 0; };
    let Some((uploader, channel)) = text.split_once('\0') else { return 0; };
    matches(duration, minimum, maximum, uploader, channel) as u32
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn inclusive_minutes_and_unicode_channel() {
        assert!(matches(120.0, 2.0, 5.0, "Ẩm Thực", "  ẨM  "));
        assert!(matches(300.0, 2.0, 5.0, "Creator", "creator"));
        assert!(!matches(301.0, 2.0, 5.0, "Creator", ""));
        assert!(!matches(119.0, 2.0, -1.0, "Creator", ""));
        assert!(!matches(180.0, -1.0, -1.0, "Other", "creator"));
        assert!(matches(0.0, -1.0, -1.0, "Other", ""));
        assert!(!matches(f64::NAN, -1.0, -1.0, "", ""));
    }
}
