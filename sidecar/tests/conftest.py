"""Stub the heavy `tagger` module (ONNX / onnxruntime) before any test
imports `costume_matcher`, which does `import tagger` at module load.
Tests that need detected tags monkeypatch `costume_matcher.tagger.tag_image`.
"""

import sys
import types

if "tagger" not in sys.modules:
    _fake = types.ModuleType("tagger")

    def tag_image(path, threshold=None, max_tags=None, blacklist=None):
        return []

    _fake.tag_image = tag_image
    sys.modules["tagger"] = _fake
