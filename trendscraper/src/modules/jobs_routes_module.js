function createJobsRoutes({ db }) {
	function registerRoutes(app) {
		app.get("/jobs/uploads/:jobId", (req, res) => {
			try {
				const { jobId } = req.params;

				const job = db
					.prepare("SELECT * FROM upload_jobs WHERE id = ?")
					.get(jobId);

				if (!job) {
					return res.status(404).json({ error: "Job not found" });
				}

				return res.json({
					id: job.id,
					filename: job.filename,
					size: job.size,
					status: job.status,
					checksum: job.checksum,
					errorMessage: job.error_message,
					createdAt: job.created_at,
					completedAt: job.completed_at,
				});
			} catch (err) {
				console.error("Failed to get job status:", err);
				return res.status(500).json({ error: String(err) });
			}
		});

		app.get("/jobs/uploads", (req, res) => {
			try {
				const limit = Math.min(
					Number.parseInt(req.query.limit || "50", 10),
					200,
				);
				const status = req.query.status;

				let sql = "SELECT * FROM upload_jobs ORDER BY created_at DESC LIMIT ?";
				const params = [limit];

				if (status) {
					sql =
						"SELECT * FROM upload_jobs WHERE status = ? ORDER BY created_at DESC LIMIT ?";
					params.unshift(status);
				}

				const jobs = db.prepare(sql).all(...params);

				return res.json({
					jobs: jobs.map((job) => ({
						id: job.id,
						filename: job.filename,
						size: job.size,
						status: job.status,
						errorMessage: job.error_message,
						createdAt: job.created_at,
						completedAt: job.completed_at,
					})),
					count: jobs.length,
				});
			} catch (err) {
				console.error("Failed to list jobs:", err);
				return res.status(500).json({ error: String(err) });
			}
		});

		app.get("/jobs/youtube-imports/:jobId", (req, res) => {
			try {
				const job = db
					.prepare("SELECT * FROM youtube_import_jobs WHERE id = ?")
					.get(req.params.jobId);

				if (!job) {
					return res.status(404).json({ error: "Job not found" });
				}

				return res.json({
					id: job.id,
					sourceUrl: job.source_url,
					status: job.status,
					message: job.message,
					downloadedFilename: job.downloaded_filename,
					clipsCreated: job.clips_created,
					createdAt: job.created_at,
					startedAt: job.started_at,
					completedAt: job.completed_at,
				});
			} catch (err) {
				console.error("Failed to get YouTube import job:", err);
				return res.status(500).json({ error: String(err) });
			}
		});

		app.get("/jobs/youtube-imports", (req, res) => {
			try {
				const limit = Math.min(
					Number.parseInt(req.query.limit || "20", 10),
					100,
				);

				const jobs = db
					.prepare(
						"SELECT * FROM youtube_import_jobs ORDER BY created_at DESC LIMIT ?",
					)
					.all(limit);

				return res.json({
					jobs: jobs.map((job) => ({
						id: job.id,
						sourceUrl: job.source_url,
						status: job.status,
						message: job.message,
						downloadedFilename: job.downloaded_filename,
						clipsCreated: job.clips_created,
						createdAt: job.created_at,
						startedAt: job.started_at,
						completedAt: job.completed_at,
					})),
					count: jobs.length,
				});
			} catch (err) {
				console.error("Failed to list YouTube import jobs:", err);
				return res.status(500).json({ error: String(err) });
			}
		});
	}

	return {
		registerRoutes,
	};
}

export {
	createJobsRoutes,
};