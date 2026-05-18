"""Pre-download the WD Tagger v3 model so the first /tag call is fast.

Run once after creating the venv:

    sidecar/.venv/bin/python sidecar/download_models.py

Honors WD_MODEL and (via HF_HOME) the model cache directory.
"""

import os

from huggingface_hub import hf_hub_download

repo = "SmilingWolf/" + os.environ.get("WD_MODEL", "wd-vit-tagger-v3")

for filename in ("model.onnx", "selected_tags.csv"):
    print(f"downloading {repo}/{filename} ...")
    path = hf_hub_download(repo, filename)
    print(f"  -> {path}")

print("done")
