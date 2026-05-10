# Viral Faceless Shorts Generator

An automated pipeline to generate faceless YouTube Shorts from a custom Gemini prompt. This system leverages AI-generated scripts, manual script approval, TTS voice, subtitle alignment, and FFmpeg video composition, all wrapped in a fully containerized architecture.

## ❤️ Support This Project

Maintaining and improving this open-source project takes significant time and effort.  
If you find it useful, please consider **supporting my work via GitHub Sponsors**:

👉 [GitHub Sponsors](https://github.com/sponsors/Dark2C)

Your support helps keep this project alive and free for the community. Thank you! 🙌

## Features

- Prompt-based script generation with Google Gemini
- Manual script approval and editing before rendering
- Voice synthesis with Piper TTS
- Forced alignment with Aeneas
- Video composition with FFmpeg
- Selectable output orientation (portrait, landscape, square, original, custom)
- Persistent SQLite-backed app settings (`/api/settings`)
- Configurable generated video save folder (server-side)
- One-click web interface

## Pipeline Overview

1. **Write Prompt**  
   Enter a custom prompt in the web UI to describe the video idea.

2. **Generate Script (Gemini)**  
   The `trendscraper` service asks Gemini to produce `title`, `description`, and `body`.

3. **Approve Script**  
   Review and optionally edit the script. Rendering starts only after approval.

4. **Text-to-Speech (Piper)**  
   The approved script is converted to speech using Piper TTS.

5. **Subtitle Alignment (Aeneas)**  
   `speechalign` aligns the generated audio with the script to produce timed subtitles.

6. **Video Assembly (FFmpeg)**  
   The system merges:
   - A background video from `/videos` (named `default_*.mp4`)
   - The voiceover audio
   - Subtitles  
     to create the final faceless short.

7. **Web Trigger Interface**  
   Access a minimal frontend on port `80` to trigger everything with one click.

## Folder Structure

```
viral_faceless/
├── trendscraper/      # Gemini + FFmpeg composition API
├── piper/             # Piper TTS container
├── speechalign/       # Forced alignment via Aeneas
├── nginx/             # Web interface + reverse proxy
├── /videos/           # Background video clips (e.g., gameplay, press machine)
├── docker-compose.yml
```

> **Note:** Background clips must be placed in `/videos` and named like `default_something.mp4`.

## Usage

Rename the file `example.env` in `.env` and replace the placeholder Gemini API key with the one you generated from Google AI Studio, then start the pipeline with:

```bash
docker-compose up --build
```

Access the web interface at [http://localhost](http://localhost) to generate your first viral Short.

## Runtime Settings (SQLite)

The `trendscraper` service now persists configuration in SQLite at `/app/data/settings.db` (mounted from `./data`).

Use the API to inspect/update settings at runtime:

```bash
curl -s http://localhost:8080/api/settings
```

```bash
curl -X PUT http://localhost:8080/api/settings \
   -H "Content-Type: application/json" \
   -d '{
      "output_videos_dir": "/mnt/videos/generated",
      "input_videos_dir": "/mnt/videos",
      "default_video_orientation": "portrait",
      "subtitles_enabled_by_default": true
   }'
```

Important notes:

- Generated videos are still streamed back to the browser for immediate download.
- A server-side copy is now also saved into `output_videos_dir`.
- Existing env vars remain as first-boot fallbacks.

## Upload Background Videos

You can upload background clips from the web UI:

- Open `Settings`
- Set `Input Videos Folder` to `/mnt/videos`
- Use `Upload Background Videos To Current Input Folder`

API endpoint used by UI:

```bash
curl -X POST http://localhost:8080/api/videos/upload \
   -F "videos=@/absolute/path/to/video1.mp4" \
   -F "videos=@/absolute/path/to/video2.mov"
```

## Requirements

- Docker + Docker Compose
- Google Gemini API Key
- At least one video clip in `/videos/`
