import express from "express";
import { createTTSService } from "./modules/TTS_module.js";
import { createSettingsService } from "./modules/settings_module.js";
import { execPromise, execFilePromise, getDuration, cleanup } from "./modules/process_utils_module.js";
import { translatePrompt, generateVideoScript } from "./modules/LLM_module.js";
import { createVideoFilesService } from "./modules/video_files_module.js";
import { createYoutubeImportService } from "./modules/youtube_import_module.js";
import { createVideoRenderService, normalizeOrientation, parsePositiveInt } from "./modules/video_render_module.js";
import { createGoogleTrendsScraperService } from "./modules/google_trends_scraper_module.js";

import { createVideoRoutes } from "./modules/video_routes_module.js";
import { createJobsRoutes } from "./modules/jobs_routes_module.js";
import { createTTSRoutes } from "./modules/tts_routes_module.js";
import { createSettingsRoutes } from "./modules/settings_routes_module.js";
import { createGenerateRoutes } from "./modules/generate_routes_module.js";
import { createYoutubeRoutes } from "./modules/youtube_routes_module.js";
import { createRenderRoutes } from "./modules/render_routes_module.js";
import { createGoogleTrendsRoutes } from "./modules/google_trends_routes_module.js";

const app = express();
const PORT = 3000;

const TTS_BASE_URL = process.env.PIPER_BASE_URL || "http://piper:5002/api/tts";
const TTS_SERVER_URL = process.env.PIPER_SERVER_URL || "http://piper:5002";
const TTS_UPSTREAM_TIMEOUT_MS = Number.parseInt(process.env.TTS_UPSTREAM_TIMEOUT_MS || "", 10) || 86400000;

const DEFAULT_TTS_QUALITY = process.env.PIPER_QUALITY || "medium";

const settingsService = createSettingsService({
	dbPath: process.env.APP_DB_PATH || "/app/data/settings.db",
	defaults: {
		inputVideosDir: process.env.INPUT_VIDEOS_DIR || "/mnt/videos",
		outputVideosDir: process.env.OUTPUT_VIDEOS_DIR || "/mnt/videos/generated",
		defaultVideoOrientation: String(process.env.DEFAULT_VIDEO_ORIENTATION || "portrait").toLowerCase(),
		defaultVideoWidth: Number.parseInt(process.env.DEFAULT_VIDEO_WIDTH || "0", 10),
		defaultVideoHeight: Number.parseInt(process.env.DEFAULT_VIDEO_HEIGHT || "0", 10),
		speakerId: process.env.PIPER_VOICE || "",
		speakerLanguage: process.env.PIPER_LANGUAGE || "",
		ttsQuality: DEFAULT_TTS_QUALITY,
		locale: process.env.LOCALE || "english",
	},
	normalizeOrientation,
	parsePositiveInt,
});

const db = settingsService.db;

let runtimeSettings = settingsService.loadRuntimeSettings();

const ttsService = createTTSService({
	getRuntimeSettings: () => runtimeSettings,
	baseUrl: TTS_BASE_URL,
	serverUrl: TTS_SERVER_URL,
	upstreamTimeoutMs: TTS_UPSTREAM_TIMEOUT_MS,
	defaultQuality: DEFAULT_TTS_QUALITY,
});

const videoFilesService = createVideoFilesService({
	getRuntimeSettings: () => runtimeSettings,
});

const youtubeImportService = createYoutubeImportService({
	db,
	getRuntimeSettings: () => runtimeSettings,
	execFilePromise,
	getDuration,
	cleanup,
});

const videoRenderService = createVideoRenderService({
	getRuntimeSettings: () => runtimeSettings,
	execPromise,
	getDuration,
	cleanup,
});

const googleTrendsScraperService = createGoogleTrendsScraperService({
	cleanup,
});

app.use(express.json({ limit: "10mb" })); // JSON + base64 handling

const routes = [
	createSettingsRoutes({
		getRuntimeSettings: () => runtimeSettings,
		setRuntimeSettings: (nextSettings) => {
			runtimeSettings = nextSettings;
		},
		settingsService,
		translatePrompt,
	}),
	createVideoRoutes({
		db,
		getRuntimeSettings: () => runtimeSettings,
		videoFilesService,
	}),
	createJobsRoutes({ db }),
	createTTSRoutes({ ttsService }),
	createGenerateRoutes({
		getRuntimeSettings: () => runtimeSettings,
		generateVideoScript,
	}),
	createYoutubeRoutes({ youtubeImportService }),
	createRenderRoutes({ videoRenderService, cleanup }),
	createGoogleTrendsRoutes({ googleTrendsScraperService }),
];

for (const route of routes) {
	route.registerRoutes(app);
}

(async () => {
	await translatePrompt(runtimeSettings.locale);

	app.listen(PORT, () =>
		console.log(`API running on http://localhost:${PORT}`),
	);
})();
