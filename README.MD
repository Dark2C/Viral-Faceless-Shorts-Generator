# Viral Faceless Shorts Generator

An automated pipeline to generate faceless YouTube Shorts based on **Google Trends** or **custom topic**. This system leverages AI-generated scripts, manual script approval, TTS voice, subtitle alignment, and FFmpeg video composition, all wrapped in a fully containerized architecture.

## ❤️ Support This Project

Maintaining and improving this open-source project takes significant time and effort.
If you find it useful, please consider **supporting my work via GitHub Sponsors**:

👉 [GitHub Sponsors](https://github.com/sponsors/Dark2C)

Your support helps keep this project alive and free for the community. Thank you! 🙌

## Features

- Trending Topic Detection via Google Trends
- Prompt-based script generation with Google Gemini
- Manual script approval and editing before rendering
- Voice synthesis with Piper TTS
- Forced alignment of subtitles with Aeneas
- Video composition with FFmpeg
- Selectable output orientation (portrait, landscape, square, original, custom)
- Persistent SQLite-backed app settings (`/api/settings`)
- Configurable generated video save folder (server-side)
- One-click web interface

## Pipeline Overview

1. **Write Prompt/Choose a topic**
   Choose a category to filter for trending topics from Google Trends, or choose a custom topic or enter a custom prompt in the web UI to describe the video idea.

2. **Generate Script (Gemini)**
   The `trendscraper` service uses Gemini to generate a `title`, `description`, and `body`.

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
├── videos/            # Background video clips (e.g., gameplay, press machine)
├── docker-compose.yml
```

> **Note:** Background clips must be placed in `/videos` and named like `default_something.mp4`.

## Usage

Rename `example.env` in `.env` and replace the placeholder Gemini API key with the one you generated from Google AI Studio, then start the pipeline with:

```bash
docker-compose up --build
```

Access the web interface at [http://localhost](http://localhost) to generate your first viral Short.

## Requirements

- Docker + Docker Compose
- Google Gemini API Key
- At least one video clip in `/videos/`
