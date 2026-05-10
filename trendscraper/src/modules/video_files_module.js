import fs from "fs";
import path from "path";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm"]);

function ensureDirectoryExists(folderPath) {
	if (!fs.existsSync(folderPath)) {
		fs.mkdirSync(folderPath, { recursive: true });
	}
}

function isValidVideoFilename(filename) {
	if (typeof filename !== "string") return false;

	if (!filename || filename.includes("/") || filename.includes("\\")) {
		return false;
	}

	if (filename.includes("..")) return false;

	return VIDEO_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function resolveVideoPathInDirectory(
	rootDirectory,
	filename,
	{ mustExist = false } = {},
) {
	if (!isValidVideoFilename(filename)) {
		const err = new Error("Invalid filename");
		err.status = 400;
		throw err;
	}

	ensureDirectoryExists(rootDirectory);

	const rootDir = path.resolve(rootDirectory);
	const resolved = path.resolve(rootDir, filename);

	if (!resolved.startsWith(`${rootDir}${path.sep}`)) {
		const err = new Error("Invalid filename");
		err.status = 400;
		throw err;
	}

	if (mustExist && !fs.existsSync(resolved)) {
		const err = new Error("Video file not found");
		err.status = 404;
		throw err;
	}

	return resolved;
}

function createVideoFilesService({ getRuntimeSettings }) {
	function resolveInputVideoPath(filename, { mustExist = false } = {}) {
		const runtimeSettings = getRuntimeSettings();

		return resolveVideoPathInDirectory(
			runtimeSettings.inputVideosDir,
			filename,
			{ mustExist },
		);
	}

	function resolveOutputVideoPath(filename, { mustExist = false } = {}) {
		const runtimeSettings = getRuntimeSettings();

		return resolveVideoPathInDirectory(
			runtimeSettings.outputVideosDir,
			filename,
			{ mustExist },
		);
	}

	return {
		resolveInputVideoPath,
		resolveOutputVideoPath,
	};
}

function sanitizeRenameTarget(rawName, fallbackExt) {
	if (typeof rawName !== "string") {
		const err = new Error("newFilename must be a string");
		err.status = 400;
		throw err;
	}

	const trimmed = rawName.trim();

	if (!trimmed) {
		const err = new Error("newFilename cannot be empty");
		err.status = 400;
		throw err;
	}

	const parsed = path.parse(trimmed);

	let safeBase = (parsed.name || "video")
		.replace(/[^a-zA-Z0-9._-]/g, "_")
		.replace(/_+/g, "_")
		.slice(0, 80)
		.replace(/^_+|_+$/g, "");

	if (!safeBase) safeBase = "video";

	let ext = String(parsed.ext || "").toLowerCase();

	if (!ext) {
		ext = String(fallbackExt || "").toLowerCase();
	}

	if (!VIDEO_EXTENSIONS.has(ext)) {
		const err = new Error("Filename must use a supported video extension");
		err.status = 400;
		throw err;
	}

	return `${safeBase}${ext}`;
}

function sanitizeUploadedFileName(originalName) {
	const parsed = path.parse(originalName || "video");

	const safeBase = (parsed.name || "video")
		.replace(/[^a-zA-Z0-9._-]/g, "_")
		.slice(0, 80);

	const ext = String(parsed.ext || "").toLowerCase();

	return `${safeBase || "video"}_${Date.now()}_${uuidv4().slice(0, 8)}${ext}`;
}

function sanitizeYoutubeDownloadBaseName(originalName) {
	const parsed = path.parse(originalName || "youtube_video");

	const safeBase = (parsed.name || "youtube_video")
		.replace(/[^a-zA-Z0-9._-]/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 80);

	return safeBase || "youtube_video";
}

function calculateFileChecksum(filePath) {
	return new Promise((resolve, reject) => {
		const hash = crypto.createHash("sha256");
		const stream = fs.createReadStream(filePath);

		stream.on("error", reject);
		stream.on("data", (data) => hash.update(data));
		stream.on("end", () => resolve(hash.digest("hex")));
	});
}

async function verifyUploadedFile(filePath, expectedSize) {
	const stats = fs.statSync(filePath);

	if (stats.size !== expectedSize) {
		throw new Error(
			`File size mismatch: expected ${expectedSize}, got ${stats.size}`,
		);
	}

	return calculateFileChecksum(filePath);
}

export {
	VIDEO_EXTENSIONS,
	createVideoFilesService,
	ensureDirectoryExists,
	isValidVideoFilename,
	resolveVideoPathInDirectory,
	sanitizeRenameTarget,
	sanitizeUploadedFileName,
	sanitizeYoutubeDownloadBaseName,
	verifyUploadedFile,
};