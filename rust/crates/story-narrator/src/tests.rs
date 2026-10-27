use super::*;

fn fixture(outcome: &str) -> Value {
    let event_type = match outcome {
        "success" => "success",
        "failure" => "failure",
        _ => "observation",
    };
    let story = json!({"title":"Thử xe LEGO","summary":"Lắp xe và thử chạy.","outcome":outcome,
        "outcome_event_ids":if outcome=="unknown" {json!([])} else {json!(["e1"])},
        "understanding":{"main_character":null,"setting":null,"central_challenge":null,"goal":{"text":"Thử xe","event_ids":["e1"]},"stakes":null,"initial_situation":null,"obstacles":null,"attempts":null,"turning_point":null,"climax":null,"resolution":null,"final_outcome":null},
        "outline":[{"role":"development","description":"Thử xe","event_ids":["e1"]}],"causal_links":[],
        "paragraphs":[{"id":"p1","role":"development","text":"Xe LEGO bắt đầu chạy.","event_ids":["e1"]}]});
    json!({"schema_version":1,"revision":0,"duration":12,"voice":"maianh","metadata":{"hasAudio":true},"user_edits":[],
        "settings":defaults()["settings"],"mix":defaults()["mix"],"story":story,
        "events":[{"id":"e1","start":1,"end":9,"event_type":event_type,"confidence":0.95,"source":"video","preserve_audio":false}],
        "segments":[{"segment_id":"s1","paragraph_id":"p1","start_time":1,"end_time":8,"narration_text":"Xe LEGO bắt đầu chạy.","story_role":"development","emotion":"curious","speaking_rate":1,"estimated_duration":1.6,"associated_event_ids":["e1"],"pause_before":0,"pause_after":0.2,"locked":false,"intentional_lead_in":false}]})
}
#[test]
fn outcomes_require_observed_support_and_unknown_does_not_invent_a_climax() {
    for outcome in ["success", "failure", "unknown"] {
        let p = fixture(outcome);
        assert!(validate_story(&p).is_ok());
        assert!(review(&p).unwrap()["can_synthesize"] == true);
    }
    let mut p = fixture("success");
    p["events"][0]["event_type"] = json!("build");
    assert!(validate_story(&p).is_err());
    p = fixture("unknown");
    assert!(validate_story(&p).unwrap()["understanding"]["climax"].is_null());
    p["story"]["understanding"]["final_outcome"] = json!({"text":"Thành công","event_ids":["e1"]});
    assert!(validate_story(&p).is_err());
}
#[test]
fn continuous_shot_and_long_videos_have_dense_chronological_windows() {
    for duration in [0.1, 12.0, 60.0, 3600.0] {
        let p = plan(&json!({"duration":duration})).unwrap();
        assert_eq!(p["scenes"].as_array().unwrap().len(), 1);
        let w = p["windows"].as_array().unwrap();
        assert_eq!(w.last().unwrap()["end"], json!(duration));
        assert!(
            w.iter()
                .all(|w| w["frame_times"].as_array().unwrap().len() <= 24)
        );
        if duration >= 12.0 {
            assert!(w[0]["frame_times"].as_array().unwrap().len() > 3);
        }
    }
    assert!(plan(&json!({"duration":3601})).is_err());
    let p =
        plan(&json!({"duration":12,"scene_log":"pts_time:3.5 blah\npts_time:8.0 blah"})).unwrap();
    assert_eq!(p["scenes"].as_array().unwrap().len(), 3);
}
#[test]
fn decoded_frame_index_normalizes_ffprobe_timestamps() {
    let times = frame_index(&json!({"frames":[
        {"best_effort_timestamp_time":"176.500000"},
        {"best_effort_timestamp_time":"176.375000"},
        {"best_effort_timestamp_time":"N/A"},
        {"best_effort_timestamp_time":"-0.1"},
        {"best_effort_timestamp_time":"176.500000"}
    ]}))
    .unwrap();
    assert_eq!(times, vec![176.375, 176.5]);
    assert!(frame_index(&json!({"frames":[]})).is_err());
}
#[test]
fn cached_windows_sample_actual_video_pts_instead_of_longer_audio_duration() {
    let input = json!({"duration":176.703667,"window":{"index":5,"start":150,"end":176.703667,
        "frame_times":[150,152,174,176,176.1,176.568667]},"frames":[150,152,174,176,176.125,176.25,176.375,176.5]});
    let result = window_frames(&input).unwrap();
    let times = result["window"]["frame_times"].as_array().unwrap();
    assert_eq!(times.last().unwrap(), 176.5);
    assert!(!times.contains(&json!(176.568667)));
    assert_eq!(
        input["window"]["frame_times"][5], 176.568667,
        "the cached input is not mutated"
    );
    for sample in result["samples"].as_array().unwrap() {
        let time = sample["time"].as_f64().unwrap();
        assert!(
            input["frames"]
                .as_array()
                .unwrap()
                .iter()
                .any(|value| value.as_f64() == Some(time))
        );
        assert!(sample["seek_time"].as_f64().unwrap() <= time);
    }
    let vfr = window_frames(
        &json!({"duration":6,"window":{"index":0,"start":0,"end":6,"frame_times":[0,1,4,5.9]},
        "frames":[0,0.04,0.7,2.15,5]}),
    )
    .unwrap();
    assert_eq!(vfr["window"]["frame_times"], json!([0.0, 0.7, 2.15, 5.0]));
    let tiny=window_frames(&json!({"duration":0.1,"window":{"index":0,"start":0,"end":0.1,"frame_times":[0]},"frames":[0]})).unwrap();
    assert_eq!(tiny["samples"][0]["seek_time"], 0.0);
}
#[test]
fn audio_only_tail_does_not_fabricate_video_frames_or_fail_the_job() {
    let result = window_frames(
        &json!({"duration":10,"window":{"index":1,"start":6,"end":10,"frame_times":[6,8,9.8]},
        "frames":[0,1,2,3,4,5]}),
    )
    .unwrap();
    assert_eq!(result["samples"], json!([]));
    assert_eq!(result["window"]["frame_times"], json!([]));
    assert!(
        result["uncertainty"]
            .as_str()
            .unwrap()
            .contains("không có khung hình")
    );
}
#[test]
fn evidence_must_exist_in_the_supplied_window_and_audio_is_not_inferred() {
    let mut p = json!({"duration":12,"window":{"index":0,"start":0,"end":12,"frame_times":[1,3]},"audio_available":false,
        "result":{"events":[{"start":0,"end":4,"event_type":"test","description":"Xe chạy","objects":["car"],"confidence":0.9,"source":"video","importance":"high","evidence_times":[1,3],"preserve_audio":false}],"uncertainties":[]}});
    assert!(validate_events(&p).is_ok());
    p["result"]["events"][0]["evidence_times"] = json!([2]);
    assert!(validate_events(&p).is_err());
    p["result"]["events"][0]["source"] = json!("audio");
    assert!(validate_events(&p).is_err());
    p["audio_available"] = json!(true);
    p["result"]["events"][0]["event_type"] = json!("success");
    assert!(validate_events(&p).is_err());
}
#[test]
fn instantaneous_events_in_the_second_window_keep_exact_frame_evidence() {
    // Regression from window 2/6 of a 176.703667s source: two valid single-frame
    // observations were rejected because start == end was treated as an invalid slot.
    let mut input = json!({"duration":176.703667,"window":{"index":1,"start":30,"end":60,"frame_times":[30,32,34,36,38,45.475,54,59.85]},
        "audio_available":false,"video_available":false,"result":{"events":[
            {"start":30,"end":38,"event_type":"test","description":"Quan sát quá trình thử.","objects":[],"confidence":0.9,"source":"video","importance":"high","evidence_times":[30,32,38],"preserve_audio":false},
            {"start":45.475,"end":45.475,"event_type":"observation","description":"Quan sát tại một khung hình.","objects":[],"confidence":0.9,"source":"video","importance":"medium","evidence_times":[45.475],"preserve_audio":false},
            {"start":54,"end":54,"event_type":"observation","description":"Quan sát tại khung hình khác.","objects":[],"confidence":0.9,"source":"video","importance":"medium","evidence_times":[54],"preserve_audio":false}
        ],"uncertainties":[]}});
    let result = validate_events(&input).unwrap();
    assert_eq!(result["events"][1]["start"], 45.475);
    assert_eq!(result["events"][1]["end"], 45.475);
    assert_eq!(result["events"][1]["instantaneous"], true);
    assert_eq!(result["events"][1]["id"], "w1_e1");
    assert_eq!(result["events"][0]["instantaneous"], false);
    for (start, end, evidence) in [
        (45.5, 45.5, 46.0),
        (45.5, 45.0, 45.5),
        (-1.0, -1.0, -1.0),
        (61.0, 61.0, 61.0),
    ] {
        input["result"]["events"][1]["start"] = json!(start);
        input["result"]["events"][1]["end"] = json!(end);
        input["result"]["events"][1]["evidence_times"] = json!([evidence]);
        assert!(validate_events(&input).is_err());
    }
    let mut project = fixture("unknown");
    project["segments"][0]["end_time"] = project["segments"][0]["start_time"].clone();
    assert!(
        validate_segments(&project).is_err(),
        "narration slots must still have positive duration"
    );
}
#[test]
fn protected_instantaneous_audio_is_not_masked_by_narration_starting_at_that_time() {
    let mut project = fixture("unknown");
    project["events"].as_array_mut().unwrap().push(json!({"id":"impact","start":1,"end":1,"source":"audio","confidence":0.9,"preserve_audio":true}));
    assert_eq!(review(&project).unwrap()["can_synthesize"], false);
    project["segments"][0]["start_time"] = json!(1.1);
    assert_eq!(review(&project).unwrap()["can_synthesize"], true);
}
#[test]
fn protected_sound_and_dialogue_block_overlapping_narration() {
    let mut p = fixture("unknown");
    p["events"].as_array_mut().unwrap().push(json!({"id":"sound","start":5,"end":6,"confidence":0.9,"preserve_audio":true,"source":"audio"}));
    let report = review(&p).unwrap();
    assert_eq!(report["can_synthesize"], false);
    assert!(
        report["issues"]
            .as_array()
            .unwrap()
            .iter()
            .any(|x| x["code"] == "protected_audio")
    );
}
#[test]
fn segments_cannot_be_independent_rewrites_or_precede_evidence() {
    let mut p = fixture("success");
    assert!(validate_segments(&p).is_ok());
    p["segments"][0]["narration_text"] = json!("Tự bịa một đoạn khác");
    assert!(validate_segments(&p).is_err());
    p = fixture("success");
    p["segments"][0]["start_time"] = json!(0);
    assert!(validate_segments(&p).is_err());
    p["segments"][0]["intentional_lead_in"] = json!(true);
    assert!(validate_segments(&p).is_ok());
    p["segments"][0]["associated_event_ids"] = json!(["missing"]);
    assert!(validate_segments(&p).is_err());
}
#[test]
fn tts_overflow_shortens_first_and_never_speeds_past_natural_limit() {
    let input = |actual, attempt, locked| json!({"actual_duration":actual,"slot_duration":5,"attempt":attempt,"locked":locked});
    assert_eq!(fit(&input(4.0, 0, false)).unwrap()["action"], "ready");
    assert_eq!(fit(&input(5.5, 0, false)).unwrap()["action"], "shorten");
    assert_eq!(fit(&input(5.5, 1, false)).unwrap()["action"], "tempo");
    assert_eq!(fit(&input(6.5, 1, false)).unwrap()["action"], "overflow");
    assert_eq!(fit(&input(5.5, 0, true)).unwrap()["action"], "tempo");
}
#[test]
fn extending_a_slot_uses_only_free_evidenced_time_and_keeps_total_speed_natural() {
    let p = fixture("unknown");
    let changed = extend_slot(&json!({"project":p,"segment_id":"s1","actual_duration":9})).unwrap();
    assert!(changed["segments"][0]["end_time"].as_f64().unwrap() > 8.0);
    let mut protected = p.clone();
    protected["events"]
        .as_array_mut()
        .unwrap()
        .push(json!({"id":"impact","start":8.1,"end":9,"preserve_audio":true}));
    let unchanged =
        extend_slot(&json!({"project":protected,"segment_id":"s1","actual_duration":9})).unwrap();
    assert_eq!(unchanged["segments"][0]["end_time"], 8);
    assert_eq!(
        fit(&json!({"actual_duration":5.5,"slot_duration":5,"attempt":1,"speaking_rate":1.2}))
            .unwrap()["action"],
        "overflow"
    );
}
#[test]
fn intermediate_failures_cannot_override_later_attempts() {
    let mut p = fixture("failure");
    p["events"]
        .as_array_mut()
        .unwrap()
        .push(json!({"id":"e2","start":9,"end":12,"event_type":"improvement"}));
    assert!(validate_story(&p).is_err());
    p["story"]["outcome"] = json!("unknown");
    p["story"]["outcome_event_ids"] = json!([]);
    assert!(validate_story(&p).is_ok());
}
#[test]
fn single_segment_edits_preserve_analysis_and_invalidate_only_changed_audio() {
    let mut p = fixture("unknown");
    p["segments"][0]["audio"] = json!({"path":"old.wav"});
    let original_events = p["events"].clone();
    let result = edit(
        &json!({"project":p,"segment_id":"s1","patch":{"narration_text":"Xe LEGO chạy thử."}}),
    )
    .unwrap();
    assert_eq!(result["events"], original_events);
    assert!(result["segments"][0]["audio"].is_null());
    assert_eq!(
        result["story"]["paragraphs"][0]["text"],
        "Xe LEGO chạy thử."
    );
    assert_eq!(result["revision"], 1);
    let locked =
        edit(&json!({"project":result,"segment_id":"s1","patch":{"locked":true}})).unwrap();
    assert!(edit(&json!({"project":locked,"segment_id":"s1","patch":{"start_time":2}})).is_err());
}
#[test]
fn changing_voice_keeps_story_and_analysis_but_invalidates_audio() {
    let mut p = fixture("unknown");
    p["segments"][0]["audio"] = json!({"path":"old.wav"});
    let changed = voice(&json!({"project":p,"voice":"ha dang"})).unwrap();
    assert_eq!(changed["story"], p["story"]);
    assert_eq!(changed["events"], p["events"]);
    assert!(changed["segments"][0]["audio"].is_null());
}
#[test]
fn style_changes_reuse_events_and_respect_locks() {
    let mut p = fixture("unknown");
    p["source_signature"] = json!("source");
    p["analysis_key"] = json!("key");
    let mut s = defaults()["settings"].clone();
    s["style"] = json!("documentary");
    let changed = prepare(
        &json!({"project":p,"source_signature":"source","analysis_key":"key","settings":s}),
    )
    .unwrap();
    assert_eq!(changed["events"], p["events"]);
    assert!(changed["story"].is_null());
    p["segments"][0]["locked"] = json!(true);
    assert!(
        prepare(
            &json!({"project":p,"source_signature":"source","analysis_key":"key","settings":s})
        )
        .is_err()
    );
}
#[test]
fn export_plan_ducks_without_discarding_original_or_clipping_voice() {
    let mut p = fixture("unknown");
    p["segments"][0]["audio"] = json!({"path":"voice.wav","text":"Xe LEGO bắt đầu chạy.","voice":"maianh","speaking_rate":1,"duration":2});
    let plan = render_plan(&p).unwrap();
    let filters = plan["filter_complex"].as_str().unwrap();
    assert!(filters.contains("sidechaincompress"));
    assert!(filters.contains("alimiter"));
    assert!(!filters.contains("atrim=duration=2"));
    p["metadata"]["hasAudio"] = json!(false);
    assert!(render_plan(&p).is_ok());
    p["segments"][0]["audio"]["duration"] = json!(9);
    assert!(render_plan(&p).is_err());
}
