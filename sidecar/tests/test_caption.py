from caption import build_caption


def test_full_order():
    out = build_caption(
        trigger="miyuki",
        auto_tags=["pose", "blue eyes"],
        constant_tags=["blue eyes"],
        costume_tags=["school uniform", "ribbon"],
        costume_trigger="outfit1",
        prepend_tags=["masterpiece"],
        append_tags=["best quality"],
    )
    # constant "blue eyes" dropped from the contextual auto tags.
    assert out == (
        "miyuki, outfit1, school uniform, ribbon, masterpiece, "
        "pose, best quality"
    )


def test_constant_excluded_from_auto():
    out = build_caption(
        trigger="trig",
        auto_tags=["silver_hair", "ahoge"],
        constant_tags=["silver_hair"],
    )
    assert out == "trig, ahoge"


def test_costume_tag_forced_over_constant():
    # A forced costume tag is kept even when it collides with a constant.
    out = build_caption(
        trigger="trig",
        auto_tags=[],
        constant_tags=["blue hair"],
        costume_tags=["blue_hair"],
    )
    assert out == "trig, blue_hair"


def test_dedupe_on_normalized_form():
    out = build_caption(
        trigger="trig",
        auto_tags=["blue hair"],
        constant_tags=[],
        costume_tags=["blue_hair"],
    )
    # "blue hair" (auto) is a normalized dup of forced "blue_hair".
    assert out == "trig, blue_hair"


def test_empty_trigger_omitted():
    out = build_caption(trigger="   ", auto_tags=["tag"], constant_tags=[])
    assert out == "tag"
