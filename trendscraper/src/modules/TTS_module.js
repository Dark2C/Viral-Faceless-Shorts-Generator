import { Agent, fetch } from "undici";

const LOCALE_LANGUAGE_MAP = {
	english: "en",
	espanol: "es",
	spanish: "es",
	french: "fr",
	german: "de",
	italian: "it",
	portuguese: "pt",
	polish: "pl",
	turkish: "tr",
	russian: "ru",
	dutch: "nl",
	czech: "cs",
	arabic: "ar",
	chinese: "zh-cn",
	japanese: "ja",
	hungarian: "hu",
	korean: "ko",
	hindi: "hi",
};

const TTS_VOICE_CACHE_TTL_MS = 5 * 60 * 1000;

function createTTSService({
	getRuntimeSettings,
	baseUrl,
	serverUrl,
	upstreamTimeoutMs,
	defaultQuality = "medium",
}) {
	const httpTimeoutMs = Math.max(60000, upstreamTimeoutMs + 5000);

	const fetchDispatcher = new Agent({
		headersTimeout: httpTimeoutMs,
		bodyTimeout: httpTimeoutMs,
	});

	let voicesCache = {
		expiresAt: 0,
		voices: [],
	};

	function normalizeVoiceOption(voice) {
		if (!voice || typeof voice !== "object") return null;

		const key = String(voice.key || "").trim();
		const name = String(voice.name || "").trim();
		const languageCode = String(voice.languageCode || "").trim();
		const quality = String(voice.quality || "").trim();

		if (!key || !name || !languageCode || !quality) return null;

		return {
			key,
			name,
			languageCode,
			languageNameEnglish: String(voice.languageNameEnglish || "").trim(),
			languageNameNative: String(voice.languageNameNative || "").trim(),
			quality,
		};
	}

	async function getTTSVoices({ forceRefresh = false } = {}) {
		const now = Date.now();

		if (
			!forceRefresh &&
			now < voicesCache.expiresAt &&
			Array.isArray(voicesCache.voices)
		) {
			return voicesCache.voices;
		}

		const response = await fetch(`${serverUrl}/api/voices`, {
			signal: AbortSignal.timeout(upstreamTimeoutMs),
			dispatcher: fetchDispatcher,
		});

		if (!response.ok) {
			throw new Error(`TTS voices endpoint returned HTTP ${response.status}`);
		}

		const payload = await response.json();
		const rawVoices = Array.isArray(payload?.voices) ? payload.voices : [];
		const voices = rawVoices.map(normalizeVoiceOption).filter(Boolean);

		voicesCache = {
			expiresAt: now + TTS_VOICE_CACHE_TTL_MS,
			voices,
		};

		return voices;
	}

	function filterTTSVoices(voices, { languageId, qualityId } = {}) {
		const normalizedLanguage = String(languageId || "").trim();
		const normalizedQuality = String(qualityId || "").trim();

		return voices.filter((voice) => {
			if (
				normalizedLanguage &&
				voice.languageCode !== normalizedLanguage &&
				!voice.languageCode.startsWith(`${normalizedLanguage}_`)
			) {
				return false;
			}

			if (normalizedQuality && voice.quality !== normalizedQuality) {
				return false;
			}

			return true;
		});
	}

	async function getSpeakers({ languageId, qualityId } = {}) {
		const voices = await getTTSVoices();
		const filtered = filterTTSVoices(voices, { languageId, qualityId });

		return filtered.map((voice) => voice.key);
	}

	async function getTTSLanguages() {
		const voices = await getTTSVoices();
		const languages = [...new Set(voices.map((voice) => voice.languageCode))];

		languages.sort((a, b) => a.localeCompare(b));

		return languages;
	}

	async function getTTSQualities({ languageId } = {}) {
		const voices = await getTTSVoices();
		const filtered = filterTTSVoices(voices, { languageId });
		const qualities = [...new Set(filtered.map((voice) => voice.quality))];

		qualities.sort((a, b) => a.localeCompare(b));

		return qualities;
	}

	async function proxyTTSRequest(req, res) {
		const runtimeSettings = getRuntimeSettings();

		const text = req.body?.text;

		let speakerId =
			req.body?.speaker_id ??
			runtimeSettings.speakerId ??
			process.env.PIPER_VOICE;

		const languageId =
			req.body?.speaker_language ??
			runtimeSettings.speakerLanguage ??
			process.env.PIPER_LANGUAGE ??
			LOCALE_LANGUAGE_MAP[String(runtimeSettings.locale || "").toLowerCase()] ??
			"en";

		const qualityId =
			req.body?.quality_id ??
			runtimeSettings.ttsQuality ??
			defaultQuality;

		if (!text || typeof text !== "string") {
			return res
				.status(400)
				.json({ error: "Missing required string field: text" });
		}

		try {
			if (!speakerId) {
				const speakers = await getSpeakers({ languageId, qualityId });
				speakerId = speakers[0];
			}

			const params = new URLSearchParams();

			params.set("text", text);

			if (speakerId) {
				params.set("speaker_id", String(speakerId));
				params.set("voice_key", String(speakerId));
			}

			if (languageId) {
				params.set("speaker_language", String(languageId));
			}

			if (qualityId) {
				params.set("quality_id", String(qualityId));
			}

			const response = await fetch(baseUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: params,
				signal: AbortSignal.timeout(upstreamTimeoutMs),
				dispatcher: fetchDispatcher,
			});

			if (!response.ok) {
				const errorText = await response.text();

				return res.status(response.status).json({
					error: "TTS request failed",
					details: errorText || `TTS upstream returned HTTP ${response.status}`,
				});
			}

			const contentType = response.headers.get("content-type") || "audio/wav";
			const audioBuffer = Buffer.from(await response.arrayBuffer());

			res.setHeader("Content-Type", contentType);

			return res.send(audioBuffer);
		} catch (err) {
			console.error("TTS proxy request failed:", err);

			return res.status(500).json({
				error: "Unexpected error in /tts",
				details: String(err),
			});
		}
	}

	function getSpeakerConfig() {
		const runtimeSettings = getRuntimeSettings();

		const speakerId = runtimeSettings.speakerId || process.env.PIPER_VOICE;

		const languageId =
			runtimeSettings.speakerLanguage ||
			process.env.PIPER_LANGUAGE ||
			LOCALE_LANGUAGE_MAP[String(runtimeSettings.locale || "").toLowerCase()] ||
			"en";

		const qualityId = runtimeSettings.ttsQuality || defaultQuality;

		return {
			speakerId: speakerId || null,
			languageId,
			qualityId,
		};
	}

	return {
		proxyTTSRequest,
		getTTSVoices,
		getSpeakers,
		getTTSLanguages,
		getTTSQualities,
		getSpeakerConfig,
	};
}

export {
	createTTSService,
};