function createSettingsRoutes({
	getRuntimeSettings,
	setRuntimeSettings,
	settingsService,
	translatePrompt,
}) {
	function registerRoutes(app) {
		app.get("/settings", (_req, res) => {
			res.json(settingsService.serializeRuntimeSettings(getRuntimeSettings()));
		});

		app.put("/settings", async (req, res) => {
			try {
				const nextSettings = settingsService.saveSettingsPayload(req.body);

				setRuntimeSettings(nextSettings);

				await translatePrompt(nextSettings.locale);

				return res.json({
					success: true,
					settings: settingsService.serializeRuntimeSettings(nextSettings),
				});
			} catch (err) {
				return res.status(400).json({
					error: String(err?.message || err),
				});
			}
		});

		app.get("/video-config", (_req, res) => {
			const runtimeSettings = getRuntimeSettings();

			res.json({
				defaultOrientation: runtimeSettings.defaultVideoOrientation,
				defaultWidth: runtimeSettings.defaultVideoWidth,
				defaultHeight: runtimeSettings.defaultVideoHeight,
				subtitlesEnabledByDefault: runtimeSettings.subtitlesEnabledByDefault,
			});
		});
	}

	return {
		registerRoutes,
	};
}

export {
	createSettingsRoutes,
};