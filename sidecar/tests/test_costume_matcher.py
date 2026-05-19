import costume_matcher
from costume_matcher import _score


def test_score_canonical_full_and_partial():
    assert _score({"blue hair"}, ["blue_hair"], []) == 1.0
    assert _score({"blue hair"}, ["blue_hair", "skirt"], []) == 0.5


def test_score_empty_costume_is_zero():
    assert _score(set(), [], []) == 0.0


def test_score_color_weighted_higher():
    # canonical weight 1.0, color weight 1.5.
    assert _score({"red"}, [], ["red"]) == 1.0
    # got = 1.5 (color) / total = 1.0 + 1.5 = 2.5 -> 0.6
    assert _score({"red"}, ["unmatched"], ["red"]) == 0.6


def test_score_normalized_match():
    # user-typed underscores still match spaced WD detections.
    assert _score({"school uniform"}, ["school_uniform"], []) == 1.0


def test_match_picks_best(monkeypatch):
    monkeypatch.setattr(
        costume_matcher.tagger,
        "tag_image",
        lambda *a, **k: [{"tag": "armor"}, {"tag": "red cape"}],
    )
    costumes = [
        {"id": "a", "tags": ["school_uniform"], "color_tags": []},
        {"id": "b", "tags": ["armor"], "color_tags": ["red_cape"]},
    ]
    res = costume_matcher.match("x.png", costumes)
    assert res["best_costume_id"] == "b"
    assert res["scores"]["b"] > res["scores"]["a"]
    assert res["method"] == "wd_tagger"


def test_match_no_costumes(monkeypatch):
    monkeypatch.setattr(
        costume_matcher.tagger, "tag_image", lambda *a, **k: []
    )
    res = costume_matcher.match("x.png", [])
    assert res["best_costume_id"] is None
    assert res["scores"] == {}
