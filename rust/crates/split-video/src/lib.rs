//! Shared cut-point validation and segment planning for video-to-project splitting.

const MAX_PARTS: usize = 100;
const MIN_SOURCE_DURATION: f64 = 10.0;
const MIN_SEGMENT_DURATION: f64 = 0.05;

#[derive(Debug, PartialEq)]
pub struct Segment {
    pub start: f64,
    pub end: f64,
}

/// Error codes: 1 invalid duration, 2 too many cuts, 3 invalid/outside cut,
/// 4 duplicate/too-close boundaries. Input order does not affect the plan.
pub fn plan_segments(duration: f64, cuts: &[f64]) -> Result<Vec<Segment>, u32> {
    if !duration.is_finite() || duration < MIN_SOURCE_DURATION {
        return Err(1);
    }
    if cuts.len() >= MAX_PARTS {
        return Err(2);
    }
    if cuts.iter().any(|cut| !cut.is_finite() || *cut <= 0.0 || *cut >= duration) {
        return Err(3);
    }
    let mut boundaries = cuts.to_vec();
    boundaries.sort_by(f64::total_cmp);
    boundaries.push(duration);
    let mut start = 0.0;
    let mut segments = Vec::with_capacity(boundaries.len());
    for end in boundaries {
        if end - start < MIN_SEGMENT_DURATION - 1e-9 {
            return Err(4);
        }
        segments.push(Segment { start, end });
        start = end;
    }
    Ok(segments)
}

#[unsafe(no_mangle)]
pub extern "C" fn split_min_source_duration() -> f64 { MIN_SOURCE_DURATION }
#[unsafe(no_mangle)]
pub extern "C" fn split_max_parts() -> u32 { MAX_PARTS as u32 }

#[unsafe(no_mangle)]
pub extern "C" fn split_valid_video(duration: f64, width: f64, height: f64, fps: f64, frames: f64) -> u32 {
    u32::from([duration, width, height, fps, frames].iter().all(|value| value.is_finite() && *value > 0.0))
}

#[unsafe(no_mangle)]
pub extern "C" fn split_alloc(count: usize) -> *mut f64 {
    Box::into_raw(vec![0.0; count].into_boxed_slice()) as *mut f64
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn split_free(pointer: *mut f64, count: usize) {
    unsafe { drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(pointer, count))); }
}

static mut OUTPUT: [f64; MAX_PARTS * 2] = [0.0; MAX_PARTS * 2];
static mut OUTPUT_COUNT: usize = 0;

#[unsafe(no_mangle)]
pub unsafe extern "C" fn split_plan(duration: f64, pointer: *const f64, count: usize) -> u32 {
    unsafe { OUTPUT_COUNT = 0; }
    if count >= MAX_PARTS { return 2; }
    let cuts = unsafe { std::slice::from_raw_parts(pointer, count) };
    match plan_segments(duration, cuts) {
        Ok(segments) => {
            for (index, segment) in segments.iter().enumerate() {
                unsafe {
                    OUTPUT[index * 2] = segment.start;
                    OUTPUT[index * 2 + 1] = segment.end;
                }
            }
            unsafe { OUTPUT_COUNT = segments.len(); }
            0
        }
        Err(code) => code,
    }
}
#[unsafe(no_mangle)]
pub extern "C" fn split_output_ptr() -> *const f64 { (&raw const OUTPUT).cast::<f64>() }
#[unsafe(no_mangle)]
pub extern "C" fn split_output_count() -> usize { unsafe { OUTPUT_COUNT } }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unordered_cuts_cover_source_without_gaps_or_overlap() {
        assert_eq!(plan_segments(1200.0, &[900.0, 300.0, 600.0]), Ok(vec![
            Segment { start: 0.0, end: 300.0 }, Segment { start: 300.0, end: 600.0 },
            Segment { start: 600.0, end: 900.0 }, Segment { start: 900.0, end: 1200.0 },
        ]));
        assert_eq!(plan_segments(10.0, &[]), Ok(vec![Segment { start: 0.0, end: 10.0 }]));
    }

    #[test]
    fn rejects_invalid_short_and_duplicate_boundaries() {
        for duration in [0.0, 9.9, f64::NAN, f64::INFINITY] {
            assert_eq!(plan_segments(duration, &[1.0]), Err(1));
        }
        for cut in [-1.0, 0.0, 10.0, 11.0, f64::NAN, f64::INFINITY] {
            assert_eq!(plan_segments(10.0, &[cut]), Err(3));
        }
        for cuts in [vec![5.0, 5.0], vec![0.01], vec![9.99], vec![5.0, 5.01]] {
            assert_eq!(plan_segments(10.0, &cuts), Err(4));
        }
    }

    #[test]
    fn bounds_projects_and_keeps_fractional_cuts() {
        assert_eq!(plan_segments(1000.0, &vec![5.0; 100]), Err(2));
        let segments = plan_segments(12.0, &[4.25, 8.5]).unwrap();
        assert_eq!(segments[1], Segment { start: 4.25, end: 8.5 });
        assert_eq!(segments.iter().map(|s| s.end - s.start).sum::<f64>(), 12.0);
        assert_eq!(split_valid_video(4.25, 640.0, 360.0, 30_000.0 / 1001.0, 128.0), 1);
        assert_eq!(split_valid_video(4.25, 640.0, 360.0, 30.0, 0.0), 0);
        assert_eq!(split_valid_video(f64::NAN, 640.0, 360.0, 30.0, 128.0), 0);
    }
}
