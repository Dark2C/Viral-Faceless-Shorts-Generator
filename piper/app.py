import html
import json
import os
import re
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.request import urlopen

from flask import Flask, Response, jsonify, request

app = Flask(__name__)

MODEL_DIR = Path(os.environ.get("PIPER_MODEL_DIR", "/models"))
VOICES_CATALOG_URL = os.environ.get(
    "PIPER_VOICES_CATALOG_URL",
    "https://huggingface.co/rhasspy/piper-voices/raw/main/voices.json",
)
VOICES_FILES_BASE_URL = os.environ.get(
    "PIPER_VOICES_FILES_BASE_URL",
    "https://huggingface.co/rhasspy/piper-voices/resolve/main",
).rstrip("/")
DEFAULT_VOICE_KEY = os.environ.get("PIPER_VOICE", "")
DEFAULT_LANGUAGE = os.environ.get("PIPER_LANGUAGE", "")
DEFAULT_QUALITY = os.environ.get("PIPER_QUALITY", "")
CATALOG_CACHE_TTL_SECONDS = max(
    60, int(os.environ.get("PIPER_CATALOG_CACHE_TTL_SECONDS", "3600"))
)

_catalog_cache = {
    "loaded_at": 0.0,
    "voices": [],
}


def _download_if_missing(url: str, target: Path) -> None:
    if target.exists() and target.stat().st_size > 0:
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    with urlopen(url, timeout=60) as response:
        with target.open("wb") as output:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                output.write(chunk)


def _load_catalog(force_refresh: bool = False) -> list[dict]:
    now = time.time()
    if (
        not force_refresh
        and _catalog_cache["voices"]
        and now - _catalog_cache["loaded_at"] < CATALOG_CACHE_TTL_SECONDS
    ):
        return _catalog_cache["voices"]

    with urlopen(VOICES_CATALOG_URL, timeout=60) as response:
        raw = json.load(response)

    voices: list[dict] = []
    for key, meta in raw.items():
        if not isinstance(meta, dict):
            continue

        files = meta.get("files") or {}
        model_rel_path = ""
        config_rel_path = ""
        if isinstance(files, dict):
            for file_path in files.keys():
                if file_path.endswith(".onnx") and not model_rel_path:
                    model_rel_path = file_path
                if file_path.endswith(".onnx.json") and not config_rel_path:
                    config_rel_path = file_path

        if not model_rel_path or not config_rel_path:
            continue

        language = meta.get("language") or {}
        language_code = str(language.get("code") or "").strip()
        quality = str(meta.get("quality") or "").strip()
        name = str(meta.get("name") or key).strip()
        if not language_code or not quality:
            continue

        voices.append(
            {
                "key": str(meta.get("key") or key),
                "name": name,
                "languageCode": language_code,
                "languageNameEnglish": str(language.get("name_english") or ""),
                "languageNameNative": str(language.get("name_native") or ""),
                "quality": quality,
                "modelRelPath": model_rel_path,
                "configRelPath": config_rel_path,
            }
        )

    voices.sort(key=lambda v: (v["languageCode"], v["name"], v["quality"]))
    _catalog_cache["voices"] = voices
    _catalog_cache["loaded_at"] = now
    return voices


def _resolve_voice(
    voice_key: str, speaker_id: str, language_id: str, quality_id: str
) -> dict:
    voices = _load_catalog()
    if not voices:
        raise ValueError("No Piper voices available")

    requested_voice_key = str(voice_key or "").strip()
    requested_speaker = str(speaker_id or "").strip()
    requested_language = str(language_id or "").strip()
    requested_quality = str(quality_id or "").strip()

    if requested_voice_key:
        for voice in voices:
            if voice["key"] == requested_voice_key:
                return voice

    selected = voices
    if requested_speaker:
        by_key = [v for v in selected if v["key"] == requested_speaker]
        if by_key:
            selected = by_key
        else:
            speaker_lower = requested_speaker.lower()
            selected = [v for v in selected if v["name"].lower() == speaker_lower]

    if requested_language:
        selected = [
            v
            for v in selected
            if v["languageCode"] == requested_language
            or v["languageCode"].startswith(f"{requested_language}_")
        ]

    if requested_quality:
        selected = [v for v in selected if v["quality"] == requested_quality]

    if not selected and DEFAULT_VOICE_KEY:
        for voice in voices:
            if voice["key"] == DEFAULT_VOICE_KEY:
                return voice

    if not selected and DEFAULT_LANGUAGE:
        selected = [
            v
            for v in voices
            if v["languageCode"] == DEFAULT_LANGUAGE
            or v["languageCode"].startswith(f"{DEFAULT_LANGUAGE}_")
        ]

    if not selected and requested_speaker:
        selected = voices

    if not selected:
        raise ValueError("No matching Piper voice for selected language/quality")

    return selected[0]


def _ensure_voice_model(voice: dict) -> tuple[Path, Path]:
    model_path = MODEL_DIR / f"{voice['key']}.onnx"
    config_path = MODEL_DIR / f"{voice['key']}.onnx.json"
    model_url = f"{VOICES_FILES_BASE_URL}/{voice['modelRelPath']}"
    config_url = f"{VOICES_FILES_BASE_URL}/{voice['configRelPath']}"
    _download_if_missing(model_url, model_path)
    _download_if_missing(config_url, config_path)
    return model_path, config_path


@app.get("/")
def index() -> str:
    # Keep Coqui-compatible select IDs so existing parser logic still works.
    voices = _load_catalog()
    language_codes = sorted({v["languageCode"] for v in voices})
    quality_codes = sorted({v["quality"] for v in voices})

    speaker_options = "".join(
        f"<option value='{html.escape(v['key'])}'>{html.escape(v['key'])}</option>"
        for v in voices
    )
    language_options = "".join(
        f"<option value='{html.escape(code)}'>{html.escape(code)}</option>"
        for code in language_codes
    )
    quality_options = "".join(
        f"<option value='{html.escape(code)}'>{html.escape(code)}</option>"
        for code in quality_codes
    )

    return (
        "<html><body>"
        f"<select id='speaker_id'>{speaker_options}</select>"
        f"<select id='language_id'>{language_options}</select>"
        f"<select id='quality_id'>{quality_options}</select>"
        "</body></html>"
    )


@app.get("/api/voices")
def voices() -> Response:
    voices_catalog = _load_catalog()
    return jsonify({"voices": voices_catalog, "total": len(voices_catalog)})


@app.get("/api/tts")
@app.post("/api/tts")
def tts() -> Response:
    payload = request.get_json(silent=True) or {}
    text = request.values.get("text") or payload.get("text")
    if not isinstance(text, str) or not text.strip():
        return jsonify({"error": "Missing required string field: text"}), 400

    voice_key = request.values.get("voice_key") or payload.get("voice_key")
    speaker_id = request.values.get("speaker_id") or payload.get("speaker_id")
    language_id = request.values.get("language_id") or payload.get("language_id")
    quality_id = request.values.get("quality_id") or payload.get("quality_id")

    safe_text = re.sub(r"\s+", " ", text).strip()

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
        output_path = Path(tmp_file.name)

    try:
        selected_voice = _resolve_voice(
            str(voice_key or ""),
            str(speaker_id or ""),
            str(language_id or ""),
            str(quality_id or ""),
        )
        model_path, _config_path = _ensure_voice_model(selected_voice)

        proc = subprocess.run(
            [
                "piper",
                "--model",
                str(model_path),
                "--output_file",
                str(output_path),
            ],
            input=safe_text.encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        if proc.returncode != 0:
            return (
                jsonify(
                    {
                        "error": "Piper synthesis failed",
                        "voice": selected_voice["key"],
                        "details": proc.stderr.decode("utf-8", errors="replace"),
                    }
                ),
                500,
            )

        with output_path.open("rb") as audio_file:
            audio_data = audio_file.read()

        return Response(audio_data, mimetype="audio/wav")
    except ValueError as err:
        return jsonify({"error": str(err)}), 400
    finally:
        if output_path.exists():
            output_path.unlink()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002, threaded=True)
