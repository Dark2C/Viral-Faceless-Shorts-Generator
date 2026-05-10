import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

const SETTINGS_SCHEMA = {
	input_videos_dir: "string",
	output_videos_dir: "string",
	default_video_orientation: "string",
	default_video_width: "int",
	default_video_height: "int",
	speaker_id: "string",
	speaker_language: "string",
	tts_quality: "string",
	locale: "string",
	subtitles_enabled_by_default: "bool",
	default_prompt_idea: "string",
	prompt_presets: "prompt_presets",
};

const VALID_ORIENTATIONS = [
	"portrait",
	"landscape",
	"square",
	"custom",
	"original",
];

function initSettingsDatabase(dbPath) {
	const dbDir = path.dirname(dbPath);

	if (!fs.existsSync(dbDir)) {
		fs.mkdirSync(dbDir, { recursive: true });
	}

	const database = new DatabaseSync(dbPath);

	database.exec(`
		CREATE TABLE IF NOT EXISTS app_settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
		
		CREATE TABLE IF NOT EXISTS upload_jobs (
			id TEXT PRIMARY KEY,
			filename TEXT NOT NULL,
			size INTEGER NOT NULL,
			status TEXT NOT NULL CHECK(status IN ('pending', 'completed', 'failed', 'corrupted')),
			error_message TEXT,
			checksum TEXT,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			completed_at TEXT
		);
		
		CREATE INDEX IF NOT EXISTS idx_upload_jobs_status ON upload_jobs(status);
		CREATE INDEX IF NOT EXISTS idx_upload_jobs_created_at ON upload_jobs(created_at);

		CREATE TABLE IF NOT EXISTS youtube_import_jobs (
			id TEXT PRIMARY KEY,
			source_url TEXT NOT NULL,
			status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed')),
			message TEXT,
			downloaded_filename TEXT,
			clips_created INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			started_at TEXT,
			completed_at TEXT
		);

		CREATE INDEX IF NOT EXISTS idx_youtube_import_jobs_status ON youtube_import_jobs(status);
		CREATE INDEX IF NOT EXISTS idx_youtube_import_jobs_created_at ON youtube_import_jobs(created_at);
	`);

	return database;
}

function createSettingsService({
	dbPath,
	defaults,
	normalizeOrientation,
	parsePositiveInt,
}) {
	const db = initSettingsDatabase(dbPath);

	function getSetting(key, fallbackValue) {
		const row = db
			.prepare("SELECT value FROM app_settings WHERE key = ?")
			.get(key);

		if (!row || typeof row.value !== "string") {
			return fallbackValue;
		}

		return row.value;
	}

	function setSetting(key, value) {
		const statement = db.prepare(`
			INSERT INTO app_settings (key, value, updated_at)
			VALUES (?, ?, CURRENT_TIMESTAMP)
			ON CONFLICT(key) DO UPDATE SET
				value = excluded.value,
				updated_at = CURRENT_TIMESTAMP
		`);

		statement.run(key, String(value));
	}

	function parseBoolean(value, fallback = false) {
		if (typeof value === "boolean") return value;

		if (typeof value === "string") {
			const normalized = value.trim().toLowerCase();

			if (["1", "true", "yes", "on"].includes(normalized)) return true;
			if (["0", "false", "no", "off"].includes(normalized)) return false;
		}

		return fallback;
	}

	function loadRuntimeSettings() {
		const defaultOrientation = normalizeOrientation(
			getSetting(
				"default_video_orientation",
				defaults.defaultVideoOrientation,
			),
		);

		const defaultWidth = parsePositiveInt(
			getSetting(
				"default_video_width",
				String(defaults.defaultVideoWidth || 0),
			),
		);

		const defaultHeight = parsePositiveInt(
			getSetting(
				"default_video_height",
				String(defaults.defaultVideoHeight || 0),
			),
		);

		return {
			inputVideosDir: getSetting(
				"input_videos_dir",
				defaults.inputVideosDir,
			),
			outputVideosDir: getSetting(
				"output_videos_dir",
				defaults.outputVideosDir,
			),
			defaultVideoOrientation: defaultOrientation,
			defaultVideoWidth: defaultWidth || null,
			defaultVideoHeight: defaultHeight || null,
			speakerId: getSetting("speaker_id", defaults.speakerId || ""),
			speakerLanguage: getSetting(
				"speaker_language",
				defaults.speakerLanguage || "",
			),
			ttsQuality: getSetting("tts_quality", defaults.ttsQuality),
			locale: getSetting("locale", defaults.locale),
			subtitlesEnabledByDefault: parseBoolean(
				getSetting("subtitles_enabled_by_default", "true"),
				true,
			),
			defaultPromptIdea: getSetting("default_prompt_idea", ""),
			promptPresets: parsePromptPresets(
				getSetting("prompt_presets", "[]"),
			),
		};
	}

	function serializeRuntimeSettings(settings) {
		return {
			input_videos_dir: settings.inputVideosDir,
			output_videos_dir: settings.outputVideosDir,
			default_video_orientation: settings.defaultVideoOrientation,
			default_video_width: settings.defaultVideoWidth,
			default_video_height: settings.defaultVideoHeight,
			speaker_id: settings.speakerId || null,
			speaker_language: settings.speakerLanguage || null,
			tts_quality: settings.ttsQuality || null,
			locale: settings.locale,
			subtitles_enabled_by_default: settings.subtitlesEnabledByDefault,
			default_prompt_idea: settings.defaultPromptIdea,
			prompt_presets: Array.isArray(settings.promptPresets)
				? settings.promptPresets
				: [],
		};
	}

	function parsePromptPresets(value) {
		if (!value) return [];

		try {
			const parsed = JSON.parse(value);
			return sanitizePromptPresets(parsed);
		} catch (err) {
			console.warn("Failed to parse saved prompt presets:", err);
			return [];
		}
	}

	function sanitizePromptPresets(value) {
		if (!Array.isArray(value)) {
			throw new Error("Prompt presets must be an array");
		}

		return value
			.map((preset, index) => {
				if (
					!preset ||
					typeof preset !== "object" ||
					Array.isArray(preset)
				) {
					return null;
				}

				const rawName =
					typeof preset.name === "string" ? preset.name.trim() : "";

				const rawPrompt =
					typeof preset.prompt === "string"
						? preset.prompt.trim()
						: "";

				if (!rawName || !rawPrompt) {
					return null;
				}

				const rawId =
					typeof preset.id === "string" && preset.id.trim()
						? preset.id.trim()
						: `preset_${index + 1}`;

				return {
					id: rawId.slice(0, 120),
					name: rawName.slice(0, 120),
					prompt: rawPrompt.slice(0, 5000),
				};
			})
			.filter(Boolean)
			.slice(0, 50);
	}

	function validateAndNormalizeSettingValue(key, value) {
		if (!(key in SETTINGS_SCHEMA)) {
			throw new Error(`Unsupported setting: ${key}`);
		}

		const expectedType = SETTINGS_SCHEMA[key];

		if (expectedType === "string") {
			if (value === null || value === undefined) {
				return "";
			}

			if (typeof value !== "string") {
				throw new Error(`Setting '${key}' must be a string`);
			}

			const trimmed = value.trim();

			if (
				(key === "input_videos_dir" ||
					key === "output_videos_dir") &&
				!trimmed
			) {
				throw new Error(`Setting '${key}' cannot be empty`);
			}

			return trimmed;
		}

		if (expectedType === "int") {
			const parsed = parsePositiveInt(value);

			if (!parsed) {
				throw new Error(
					`Setting '${key}' must be a positive integer`,
				);
			}

			return String(parsed);
		}

		if (expectedType === "bool") {
			if (typeof value !== "boolean") {
				throw new Error(`Setting '${key}' must be a boolean`);
			}

			return value ? "true" : "false";
		}

		if (expectedType === "prompt_presets") {
			const normalized =
				typeof value === "string" ? JSON.parse(value) : value;

			return JSON.stringify(sanitizePromptPresets(normalized));
		}

		throw new Error(`Unsupported schema type for '${key}'`);
	}

	function saveSettingsPayload(payload) {
		if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
			throw new Error("Request body must be a JSON object");
		}

		for (const [rawKey, value] of Object.entries(payload)) {
			const key =
				rawKey === "ai_prompt_template"
					? "default_prompt_idea"
					: rawKey;

			const normalized = validateAndNormalizeSettingValue(key, value);

			if (key === "default_video_orientation") {
				const orientation = normalizeOrientation(normalized);

				if (
					orientation !== normalized ||
					!VALID_ORIENTATIONS.includes(orientation)
				) {
					throw new Error(
						"Setting 'default_video_orientation' must be one of portrait, landscape, square, custom, original",
					);
				}
			}

			setSetting(key, normalized);
		}

		return loadRuntimeSettings();
	}

	return {
		db,
		getSetting,
		setSetting,
		loadRuntimeSettings,
		serializeRuntimeSettings,
		validateAndNormalizeSettingValue,
		saveSettingsPayload,
	};
}

export {
	createSettingsService,
	initSettingsDatabase,
};