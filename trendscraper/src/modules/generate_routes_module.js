function createGenerateRoutes({
	getRuntimeSettings,
	generateVideoScript,
}) {
	function registerRoutes(app) {
		app.post("/generate", async (req, res) => {
			try {
				const runtimeSettings = getRuntimeSettings();

				const requestPrompt =
					typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";

				const fallbackPrompt = String(
					runtimeSettings.defaultPromptIdea || "",
				).trim();

				const userPrompt = requestPrompt || fallbackPrompt;

				if (!userPrompt) {
					return res.status(400).json({
						error:
							"Missing prompt. Provide 'prompt' or configure default prompt in settings.",
					});
				}

				const generatedJson = await generateVideoScript(userPrompt);

				return res.json(generatedJson);
			} catch (err) {
				console.error("/generate failed:", err);

				return res.status(500).json({
					error: "Unexpected error in /generate",
					details: String(err?.message || err),
				});
			}
		});
	}

	return {
		registerRoutes,
	};
}

export {
	createGenerateRoutes,
};