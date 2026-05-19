from tag_format import format_tag, normalize_tag


def test_format_tag_underscores_to_spaces():
    assert format_tag("blue_hair") == "blue hair"
    assert format_tag("long_hair") == "long hair"


def test_format_tag_keeps_kaomoji():
    assert format_tag("^_^") == "^_^"
    assert format_tag(">_<") == ">_<"
    assert format_tag("0_0") == "0_0"


def test_normalize_tag_trims_lowercases_spaces():
    assert normalize_tag("  Blue_Hair ") == "blue hair"
    assert normalize_tag("school uniform") == "school uniform"
    assert normalize_tag("School_Uniform") == "school uniform"


def test_normalize_tag_kaomoji_lowercased_but_kept():
    assert normalize_tag("^_^") == "^_^"
    assert normalize_tag("0_0") == "0_0"
