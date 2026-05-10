import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import {
	VIDEO_EXTENSIONS,
	ensureDirectoryExists,
	sanitizeYoutubeDownloadBaseName,
} from "./video_files_module.js";

const YOUTUBE_CLIP_DURATION_SECONDS = 56;
const YOUTUBE_TAIL_DELETE_THRESHOLD_SECONDS = 55.5;

function createYoutubeImportService({
	db,
	getRuntimeSettings,
	execFilePromise,
	getDuration,
	cleanup,
}) {
	function validateYoutubeUrl(rawValue) {
		if (typeof rawValue !== "string" || !rawValue.trim()) {
			const err = new Error("YouTube URL is required");
			err.status = 400;
			throw err;
		}

		let parsed;

		try {
			parsed = new URL(rawValue.trim());
		} catch (_err) {
			const err = new Error("Invalid YouTube URL");
			err.status = 400;
			throw err;
		}

		const hostname = parsed.hostname.toLowerCase();

		const isYoutubeHost =
			hostname === "youtube.com" ||
			hostname === "www.youtube.com" ||
			hostname === "m.youtube.com" ||
			hostname === "youtu.be" ||
			hostname.endsWith(".youtube.com");

		if (!isYoutubeHost) {
			const err = new Error("Only YouTube links are supported");
			err.status = 400;
			throw err;
		}

		return parsed.toString();
	}

	function createYoutubeImportJob(sourceUrl) {
		const id = uuidv4();

		db.prepare(
			`INSERT INTO youtube_import_jobs (id, source_url, status, message)
			 VALUES (?, ?, 'pending', 'Queued')`,
		).run(id, sourceUrl);

		return id;
	}

	function updateYoutubeImportJob(jobId, fields = {}) {
		const allowedFields = {
			status: "status",
			message: "message",
			downloadedFilename: "downloaded_filename",
			clipsCreated: "clips_created",
			startedAt: "started_at",
			completedAt: "completed_at",
		};

		const entries = Object.entries(fields).filter(
			([key, value]) => key in allowedFields && value !== undefined,
		);

		if (entries.length === 0) return;

		const sets = entries.map(([key]) => `${allowedFields[key]} = ?`);
		const values = entries.map(([, value]) => value);

		values.push(jobId);

		db.prepare(
			`UPDATE youtube_import_jobs SET ${sets.join(", ")} WHERE id = ?`,
		).run(...values);
	}

	function recordImportedClip(filename, fileSize) {
		db.prepare(
			`INSERT INTO upload_jobs (id, filename, size, status, checksum, created_at, completed_at)
			 VALUES (?, ?, ?, 'completed', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
		).run(uuidv4(), filename, fileSize);
	}

	async function downloadYoutubeVideo(url, workingDir) {
		const outputTemplate = path.join(workingDir, "source.%(ext)s");

		await execFilePromise(
			"yt-dlp",
			[
				"--js-runtimes",
				"deno",
				"--no-playlist",
				"--merge-output-format",
				"mp4",
				"-o",
				outputTemplate,
				url,
			],
			{ maxBuffer: 1024 * 1024 * 20 },
		);

		const files = fs
			.readdirSync(workingDir)
			.filter((filename) => {
				if (!/^source\./i.test(filename)) return false;

				return VIDEO_EXTENSIONS.has(path.extname(filename).toLowerCase());
			})
			.sort();

		if (files.length === 0) {
			throw new Error("Download finished but no video file was created");
		}

		return path.join(workingDir, files[0]);
	}

	async function splitYoutubeVideoIntoClips(sourcePath, destinationDir) {
		const sourceExt = path.extname(sourcePath).toLowerCase() || ".mp4";

		const safeBase = `${sanitizeYoutubeDownloadBaseName(
			path.basename(sourcePath),
		)}_${Date.now()}_${uuidv4().slice(0, 8)}`;

		const segmentPattern = path.join(
			destinationDir,
			`${safeBase}_part_%03d${sourceExt}`,
		);

		await execFilePromise(
			"ffmpeg",
			[
				"-y",
				"-i",
				sourcePath,
				"-map",
				"0",
				"-c:v",
				"libx264",
				"-c:a",
				"aac",
				"-force_key_frames",
				`expr:gte(t,n_forced*${YOUTUBE_CLIP_DURATION_SECONDS})`,
				"-f",
				"segment",
				"-segment_time",
				String(YOUTUBE_CLIP_DURATION_SECONDS),
				"-reset_timestamps",
				"1",
				segmentPattern,
			],
			{ maxBuffer: 1024 * 1024 * 20 },
		);

		const createdFiles = fs
			.readdirSync(destinationDir)
			.filter((filename) => {
				if (!filename.startsWith(`${safeBase}_part_`)) return false;

				return path.extname(filename).toLowerCase() === sourceExt;
			})
			.sort();

		if (createdFiles.length === 0) {
			throw new Error("Video split finished but no clips were created");
		}

		const keptFiles = [];

		for (const filename of createdFiles) {
			const clipPath = path.join(destinationDir, filename);
			const duration = await getDuration(clipPath);

			if (
				!Number.isFinite(duration) ||
				duration < YOUTUBE_TAIL_DELETE_THRESHOLD_SECONDS
			) {
				fs.unlinkSync(clipPath);
				continue;
			}

			const stats = fs.statSync(clipPath);

			recordImportedClip(filename, stats.size);

			keptFiles.push({
				filename,
				duration,
				size: stats.size,
			});
		}

		return keptFiles;
	}

	async function runYoutubeImportJob(jobId, sourceUrl) {
		const runtimeSettings = getRuntimeSettings();
		const workingDir = `/tmp/youtube_import_${jobId}`;

		let downloadedFilePath = null;

		try {
			ensureDirectoryExists(runtimeSettings.inputVideosDir);
			fs.mkdirSync(workingDir, { recursive: true });

			updateYoutubeImportJob(jobId, {
				status: "running",
				message: "Downloading YouTube video...",
				startedAt: new Date().toISOString(),
			});

			downloadedFilePath = await downloadYoutubeVideo(sourceUrl, workingDir);

			updateYoutubeImportJob(jobId, {
				message: "Splitting video into 56 second clips...",
				downloadedFilename: path.basename(downloadedFilePath),
			});

			const clips = await splitYoutubeVideoIntoClips(
				downloadedFilePath,
				runtimeSettings.inputVideosDir,
			);

			fs.unlinkSync(downloadedFilePath);

			updateYoutubeImportJob(jobId, {
				status: "completed",
				message:
					clips.length > 0
						? `Imported ${clips.length} clip(s) to ${runtimeSettings.inputVideosDir}`
						: "No full 56 second clips were created",
				clipsCreated: clips.length,
				completedAt: new Date().toISOString(),
			});
		} catch (err) {
			console.error("YouTube import job failed:", err);

			updateYoutubeImportJob(jobId, {
				status: "failed",
				message: String(err?.message || err),
				completedAt: new Date().toISOString(),
			});
		} finally {
			if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
				fs.unlinkSync(downloadedFilePath);
			}

			cleanup(workingDir);
		}
	}

	function startYoutubeImport(rawUrl) {
		const sourceUrl = validateYoutubeUrl(rawUrl);
		const jobId = createYoutubeImportJob(sourceUrl);

		runYoutubeImportJob(jobId, sourceUrl);

		return {
			jobId,
			sourceUrl,
		};
	}

	return {
		validateYoutubeUrl,
		createYoutubeImportJob,
		updateYoutubeImportJob,
		runYoutubeImportJob,
		startYoutubeImport,
	};
}

export {
	createYoutubeImportService,
};