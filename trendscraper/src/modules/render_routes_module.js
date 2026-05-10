import fs from "fs";

function createRenderRoutes({
	videoRenderService,
	cleanup,
}) {
	function registerRoutes(app) {
		app.post("/burn", async (req, res) => {
			try {
				const { tmp, outputPath } = await videoRenderService.renderVideo(req.body);

				res.setHeader("Content-Type", "video/mp4");

				const readStream = fs.createReadStream(outputPath);

				readStream.pipe(res);
				readStream.on("close", () => cleanup(tmp));
			} catch (err) {
				console.error(err);

				const status = Number.isFinite(err?.status) ? err.status : 500;

				if (status === 400 || status === 404) {
					return res.status(status).send(String(err?.message || err));
				}

				return res.status(500).send("Internal server error");
			}
		});
	}

	return {
		registerRoutes,
	};
}

export {
	createRenderRoutes,
};