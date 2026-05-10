import express from "express";

export function createGoogleTrendsRoutes({ googleTrendsScraperService }) {
	function registerRoutes(app) {
		app.post("/scrape", async (req, res) => {
			try {
				const trends = await googleTrendsScraperService.scrape(req.body || {});
				return res.json(trends);
			} catch (err) {
				console.error("[google-trends] scrape failed:", err);

				const statusCode = err.statusCode || 500;

				return res.status(statusCode).json({
					error: err.message || "Internal Server Error",
				});
			}
		});
	}

	return {
		registerRoutes,
	};
}