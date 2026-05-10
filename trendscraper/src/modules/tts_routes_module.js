function createTTSRoutes({ ttsService }) {
	function registerRoutes(app) {
		app.post("/tts", ttsService.proxyTTSRequest);

		app.get("/speakers", async (req, res) => {
			try {
				const speakers = await ttsService.getSpeakers({
					languageId: req.query?.speaker_language,
					qualityId: req.query?.quality_id,
				});

				return res.json({ speakers });
			} catch (err) {
				console.error("Failed to fetch TTS speakers:", err);

				return res.status(500).json({
					error: "Failed to fetch speakers",
					details: String(err),
				});
			}
		});

		app.get("/voices", async (_req, res) => {
			try {
				const voices = await ttsService.getTTSVoices();

				return res.json({
					voices,
					total: voices.length,
				});
			} catch (err) {
				console.error("Failed to fetch TTS voices:", err);

				return res.status(500).json({
					error: "Failed to fetch voices",
					details: String(err),
				});
			}
		});

		app.get("/languages", async (_req, res) => {
			try {
				const languages = await ttsService.getTTSLanguages();

				return res.json({ languages });
			} catch (err) {
				console.error("Failed to fetch TTS languages:", err);

				return res.status(500).json({
					error: "Failed to fetch languages",
					details: String(err),
				});
			}
		});

		app.get("/qualities", async (req, res) => {
			try {
				const qualities = await ttsService.getTTSQualities({
					languageId: req.query?.speaker_language,
				});

				return res.json({ qualities });
			} catch (err) {
				console.error("Failed to fetch TTS qualities:", err);

				return res.status(500).json({
					error: "Failed to fetch qualities",
					details: String(err),
				});
			}
		});

		app.get("/speakerId", (_req, res) => {
			res.json(ttsService.getSpeakerConfig());
		});
	}

	return {
		registerRoutes,
	};
}

export {
	createTTSRoutes,
};