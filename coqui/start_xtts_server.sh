#!/usr/bin/env bash
set -euo pipefail

MODEL_DIR="/root/.local/share/tts/xtts_v2_manual"
BASE_URL="https://huggingface.co/coqui/XTTS-v2/resolve/main"

mkdir -p "$MODEL_DIR"

python3 - <<'PY'
import os
import urllib.request

model_dir = os.environ.get("MODEL_DIR", "/root/.local/share/tts/xtts_v2_manual")
base_url = os.environ.get("BASE_URL", "https://huggingface.co/coqui/XTTS-v2/resolve/main")

files = [
    "config.json",
    "model.pth",
    "dvae.pth",
    "mel_stats.pth",
    "speakers_xtts.pth",
    "vocab.json",
]

for name in files:
    target = os.path.join(model_dir, name)
    if os.path.exists(target) and os.path.getsize(target) > 0:
        continue
    url = f"{base_url}/{name}"
    print(f"Downloading {name}...")
    with urllib.request.urlopen(url) as resp, open(target, "wb") as out:
        while True:
            chunk = resp.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)

print("XTTS files ready")
PY

# Run the TTS server with threading support for concurrent requests
python3 /wsgi.py \
    --model_path "$MODEL_DIR" \
  --config_path "$MODEL_DIR/config.json" \
  --speakers_file_path "$MODEL_DIR/speakers_xtts.pth"
