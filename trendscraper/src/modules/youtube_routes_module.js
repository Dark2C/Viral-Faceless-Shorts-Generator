function createYoutubeRoutes({
	youtubeImportService,
}) {
	function registerRoutes(app) {
		app.post("/videos/import-youtube", (req, res) => {
			try {
				const { jobId } = youtubeImportService.startYoutubeImport(req.body?.url);

				return res.status(202).json({
					success: true,
					jobId,
					status: "pending",
					message: "YouTube import started",
				});
			} catch (err) {
				const status = Number.isFinite(err?.status) ? err.status : 500;

				if (status >= 500) {
					console.error("Failed to start YouTube import:", err);
				}

				return res.status(status).json({
					error: String(err?.message || err),
				});
			}
		});
	}

	return {
		registerRoutes,
	};
}

export {
	createYoutubeRoutes,
};