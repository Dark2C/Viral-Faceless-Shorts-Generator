import fs from "fs";
import path from "path";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import {
	VIDEO_EXTENSIONS,
	ensureDirectoryExists,
	sanitizeRenameTarget,
	sanitizeUploadedFileName,
	verifyUploadedFile,
} from "./video_files_module.js";

function createVideoRoutes({
	db,
	getRuntimeSettings,
	videoFilesService,
}) {
	const uploadStorage = multer.diskStorage({
		destination: (_req, _file, cb) => {
			try {
				const runtimeSettings = getRuntimeSettings();

				ensureDirectoryExists(runtimeSettings.inputVideosDir);
				cb(null, runtimeSettings.inputVideosDir);
			} catch (err) {
				cb(err);
			}
		},
		filename: (_req, file, cb) => {
			cb(null, sanitizeUploadedFileName(file.originalname));
		},
	});

	const uploadVideosMiddleware = multer({
		storage: uploadStorage,
		limits: { fileSize: 1024 * 1024 * 1024, files: 10 },
		fileFilter: (_req, file, cb) => {
			const ext = path.extname(file.originalname || "").toLowerCase();

			if (VIDEO_EXTENSIONS.has(ext)) {
				cb(null, true);
				return;
			}

			cb(new Error("Only video files (.mp4, .mov, .mkv, .webm) are allowed"));
		},
	});

	function registerRoutes(app) {
		app.post("/videos/upload", (req, res) => {
			uploadVideosMiddleware.array("videos", 10)(req, res, async (err) => {
				const runtimeSettings = getRuntimeSettings();

				if (err) {
					const message =
						typeof err?.message === "string"
							? err.message
							: "Video upload failed";

					return res.status(400).json({ error: message });
				}

				const uploadedFiles = Array.isArray(req.files) ? req.files : [];

				if (uploadedFiles.length === 0) {
					return res.status(400).json({ error: "No video files uploaded" });
				}

				const jobs = [];

				for (const file of uploadedFiles) {
					const jobId = uuidv4();

					try {
						const filePath = path.join(
							runtimeSettings.inputVideosDir,
							file.filename,
						);

						const checksum = await verifyUploadedFile(filePath, file.size);

						const stmt = db.prepare(`
							INSERT INTO upload_jobs (id, filename, size, status, checksum, created_at)
							VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
						`);

						stmt.run(jobId, file.filename, file.size, "completed", checksum);

						jobs.push({
							id: jobId,
							filename: file.filename,
							size: file.size,
							checksum,
							status: "completed",
						});
					} catch (verifyErr) {
						const stmt = db.prepare(`
							INSERT INTO upload_jobs (id, filename, size, status, error_message)
							VALUES (?, ?, ?, ?, ?)
						`);

						stmt.run(
							jobId,
							file.filename,
							file.size,
							"corrupted",
							String(verifyErr),
						);

						console.error(
							`Upload verification failed for ${file.filename}:`,
							verifyErr,
						);

						jobs.push({
							id: jobId,
							filename: file.filename,
							size: file.size,
							status: "corrupted",
							error: String(verifyErr),
						});
					}
				}

				return res.json({
					success: true,
					upload_dir: runtimeSettings.inputVideosDir,
					jobs,
				});
			});
		});

		app.get("/videos/list", (_req, res) => {
			try {
				const runtimeSettings = getRuntimeSettings();

				ensureDirectoryExists(runtimeSettings.inputVideosDir);

				const files = fs.readdirSync(runtimeSettings.inputVideosDir);

				const videos = files
					.filter((f) => /\.(mp4|mov|mkv|webm)$/i.test(f))
					.map((filename) => {
						const filePath = path.join(runtimeSettings.inputVideosDir, filename);
						const stats = fs.statSync(filePath);

						return {
							filename,
							previewUrl: `/api/videos/file/${encodeURIComponent(filename)}`,
							size: stats.size,
							createdAt: stats.birthtime.toISOString(),
							modifiedAt: stats.mtime.toISOString(),
						};
					})
					.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

				return res.json({
					videos,
					totalCount: videos.length,
					uploadDir: runtimeSettings.inputVideosDir,
				});
			} catch (err) {
				console.error("Failed to list videos:", err);
				return res.status(500).json({ error: String(err) });
			}
		});

		app.get("/videos/generated/list", (_req, res) => {
			try {
				const runtimeSettings = getRuntimeSettings();

				ensureDirectoryExists(runtimeSettings.outputVideosDir);

				const files = fs.readdirSync(runtimeSettings.outputVideosDir);

				const videos = files
					.filter((f) => /\.(mp4|mov|mkv|webm)$/i.test(f))
					.map((filename) => {
						const filePath = path.join(runtimeSettings.outputVideosDir, filename);
						const stats = fs.statSync(filePath);

						return {
							filename,
							previewUrl: `/api/videos/generated/file/${encodeURIComponent(filename)}`,
							size: stats.size,
							createdAt: stats.birthtime.toISOString(),
							modifiedAt: stats.mtime.toISOString(),
						};
					})
					.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

				return res.json({
					videos,
					totalCount: videos.length,
					outputDir: runtimeSettings.outputVideosDir,
				});
			} catch (err) {
				console.error("Failed to list generated videos:", err);
				return res.status(500).json({ error: String(err) });
			}
		});

		app.get("/videos/file/:filename", (req, res) => {
			try {
				const { filename } = req.params;

				const filePath = videoFilesService.resolveInputVideoPath(filename, {
					mustExist: true,
				});

				return res.sendFile(filePath);
			} catch (err) {
				const status = Number.isFinite(err?.status) ? err.status : 500;

				if (status >= 500) {
					console.error("Failed to stream video file:", err);
				}

				return res.status(status).json({ error: String(err?.message || err) });
			}
		});

		app.get("/videos/generated/file/:filename", (req, res) => {
			try {
				const { filename } = req.params;

				const filePath = videoFilesService.resolveOutputVideoPath(filename, {
					mustExist: true,
				});

				return res.sendFile(filePath);
			} catch (err) {
				const status = Number.isFinite(err?.status) ? err.status : 500;

				if (status >= 500) {
					console.error("Failed to stream generated video file:", err);
				}

				return res.status(status).json({ error: String(err?.message || err) });
			}
		});

		app.put("/videos/:filename/rename", (req, res) => {
			try {
				const { filename } = req.params;

				const oldPath = videoFilesService.resolveInputVideoPath(filename, {
					mustExist: true,
				});

				const oldExt = path.extname(filename).toLowerCase();
				const newFilename = sanitizeRenameTarget(req.body?.newFilename, oldExt);

				if (newFilename === filename) {
					return res.status(400).json({
						error: "New filename is identical to the current filename",
					});
				}

				const newPath = videoFilesService.resolveInputVideoPath(newFilename);

				if (fs.existsSync(newPath)) {
					return res.status(409).json({
						error: "A video with this filename already exists",
					});
				}

				fs.renameSync(oldPath, newPath);

				db.prepare("UPDATE upload_jobs SET filename = ? WHERE filename = ?")
					.run(newFilename, filename);

				return res.json({
					success: true,
					oldFilename: filename,
					newFilename,
				});
			} catch (err) {
				const status = Number.isFinite(err?.status) ? err.status : 500;

				if (status >= 500) {
					console.error("Failed to rename video:", err);
				}

				return res.status(status).json({ error: String(err?.message || err) });
			}
		});

		app.put("/videos/generated/:filename/rename", (req, res) => {
			try {
				const { filename } = req.params;

				const oldPath = videoFilesService.resolveOutputVideoPath(filename, {
					mustExist: true,
				});

				const oldExt = path.extname(filename).toLowerCase();
				const newFilename = sanitizeRenameTarget(req.body?.newFilename, oldExt);

				if (newFilename === filename) {
					return res.status(400).json({
						error: "New filename is identical to the current filename",
					});
				}

				const newPath = videoFilesService.resolveOutputVideoPath(newFilename);

				if (fs.existsSync(newPath)) {
					return res.status(409).json({
						error: "A generated video with this filename already exists",
					});
				}

				fs.renameSync(oldPath, newPath);

				return res.json({
					success: true,
					oldFilename: filename,
					newFilename,
				});
			} catch (err) {
				const status = Number.isFinite(err?.status) ? err.status : 500;

				if (status >= 500) {
					console.error("Failed to rename generated video:", err);
				}

				return res.status(status).json({ error: String(err?.message || err) });
			}
		});

		app.delete("/videos/:filename", (req, res) => {
			try {
				const { filename } = req.params;

				const filePath = videoFilesService.resolveInputVideoPath(filename, {
					mustExist: true,
				});

				fs.unlinkSync(filePath);

				db.prepare("DELETE FROM upload_jobs WHERE filename = ?").run(filename);

				return res.json({
					success: true,
					message: `Deleted ${filename}`,
				});
			} catch (err) {
				const status = Number.isFinite(err?.status) ? err.status : 500;

				if (status >= 500) {
					console.error("Failed to delete video:", err);
				}

				return res.status(status).json({ error: String(err?.message || err) });
			}
		});

		app.delete("/videos/generated/:filename", (req, res) => {
			try {
				const { filename } = req.params;

				const filePath = videoFilesService.resolveOutputVideoPath(filename, {
					mustExist: true,
				});

				fs.unlinkSync(filePath);

				return res.json({
					success: true,
					message: `Deleted generated video ${filename}`,
				});
			} catch (err) {
				const status = Number.isFinite(err?.status) ? err.status : 500;

				if (status >= 500) {
					console.error("Failed to delete generated video:", err);
				}

				return res.status(status).json({ error: String(err?.message || err) });
			}
		});
	}

	return {
		registerRoutes,
	};
}

export {
	createVideoRoutes,
};