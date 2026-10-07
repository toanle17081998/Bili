//! Shared removal policy. FFmpeg delogo reconstructs pixels from the surrounding border.

pub const MAX_REGIONS: usize = 16;

#[derive(Clone, Copy)]
pub struct VideoInfo {
    pub width: f64,
    pub height: f64,
    pub duration: f64,
}

#[derive(Clone, Copy)]
pub struct Region {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub start: f64,
    pub end: f64,
}

#[derive(Debug, PartialEq)]
#[repr(i32)]
pub enum PlanError {
    InvalidVideo = 1,
    InvalidCoordinates = 2,
    OutsideFrame = 3,
    InvalidTimeRange = 4,
    InvalidRegionCount = 5,
}

pub fn validate_region_count(count: usize) -> Result<(), PlanError> {
    if (1..=MAX_REGIONS).contains(&count) {
        Ok(())
    } else {
        Err(PlanError::InvalidRegionCount)
    }
}

pub fn plan_region(video: VideoInfo, region: Region) -> Result<String, PlanError> {
    if ![video.width, video.height, video.duration].iter().all(|v| v.is_finite())
        || video.width < 8.0 || video.height < 8.0 || video.duration <= 0.0
        || video.width.fract() != 0.0 || video.height.fract() != 0.0
    {
        return Err(PlanError::InvalidVideo);
    }
    if ![region.x, region.y, region.width, region.height].iter()
        .all(|v| v.is_finite() && v.fract() == 0.0)
        || region.width < 4.0 || region.height < 4.0
    {
        return Err(PlanError::InvalidCoordinates);
    }
    // The one-pixel border supplies the samples used to reconstruct the region.
    if region.x < 1.0 || region.y < 1.0
        || region.x + region.width >= video.width
        || region.y + region.height >= video.height
    {
        return Err(PlanError::OutsideFrame);
    }
    if !region.start.is_finite() || !region.end.is_finite()
        || region.start < 0.0 || region.end <= region.start
        || region.end > video.duration + 0.000001
    {
        return Err(PlanError::InvalidTimeRange);
    }
    Ok(format!(
        "delogo=x={}:y={}:w={}:h={}:enable='gte(t,{:.6})*lt(t,{:.6})'",
        region.x, region.y, region.width, region.height,
        region.start, region.end.min(video.duration),
    ))
}

#[cfg(target_arch = "wasm32")]
mod wasm {
    use super::*;

    static mut OUTPUT: [u8; 512] = [0; 512];
    static mut OUTPUT_LEN: usize = 0;

    #[unsafe(no_mangle)]
    pub extern "C" fn watermark_region_count(count: u32) -> i32 {
        validate_region_count(count as usize).err().map_or(0, |error| error as i32)
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn watermark_plan_region(
        video_width: f64, video_height: f64, duration: f64,
        x: f64, y: f64, width: f64, height: f64, start: f64, end: f64,
    ) -> i32 {
        let video = VideoInfo { width: video_width, height: video_height, duration };
        let region = Region { x, y, width, height, start, end };
        match plan_region(video, region) {
            Ok(filter) => {
                if filter.len() > 512 {
                    return PlanError::InvalidTimeRange as i32;
                }
                unsafe {
                    std::ptr::copy_nonoverlapping(
                        filter.as_ptr(), std::ptr::addr_of_mut!(OUTPUT).cast::<u8>(), filter.len(),
                    );
                    OUTPUT_LEN = filter.len();
                }
                0
            }
            Err(error) => {
                unsafe { OUTPUT_LEN = 0; }
                error as i32
            }
        }
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn watermark_output_ptr() -> *const u8 {
        std::ptr::addr_of!(OUTPUT).cast::<u8>()
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn watermark_output_len() -> usize {
        unsafe { OUTPUT_LEN }
    }
}
