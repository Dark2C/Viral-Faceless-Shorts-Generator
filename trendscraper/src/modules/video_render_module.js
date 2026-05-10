import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { ensureDirectoryExists } from "./video_files_module.js";

const ORIENTATION_PRESETS = {
	portrait: { width: 1080, height: 1920 },
	landscape: { width: 1920, height: 1080 },
	square: { width: 1080, height: 1080 },
};

function normalizeOrientation(value) {
	const orientation = String(value || "").toLowerCase();

	if (
		["portrait", "landscape", "square", "custom", "original"].includes(
			orientation,
		)
	) {
		return orientation;
	}

	return "portrait";
}

function parsePositiveInt(value) {
	const parsed = Number.parseInt(String(value), 10);

	if (!Number.isFinite(parsed) || parsed <= 0) return null;

	return parsed;
}

function resolveVideoGeometry(orientation, width, height) {
	if (orientation === "original") {
		return null;
	}

	if (orientation === "custom") {
		const customWidth = parsePositiveInt(width);
		const customHeight = parsePositiveInt(height);

		if (!customWidth || !customHeight) {
			throw new Error(
				"Custom orientation requires valid positive width and height",
			);
		}

		return {
			width: customWidth,
			height: customHeight,
		};
	}

	return ORIENTATION_PRESETS[orientation] || ORIENTATION_PRESETS.portrait;
}

function buildVideoFilter(assPath, orientation, width, height) {
	const geometry = resolveVideoGeometry(orientation, width, height);

	const subtitlesFilter = assPath
		? `subtitles=${assPath}:fontsdir=/app/fonts`
		: "";

	if (!geometry) {
		return subtitlesFilter;
	}

	const { width: targetWidth, height: targetHeight } = geometry;

	const scaleCropFilter =
		`scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,` +
		`crop=${targetWidth}:${targetHeight}`;

	return subtitlesFilter
		? `${scaleCropFilter},${subtitlesFilter}`
		: scaleCropFilter;
}

function createVideoRenderService({
	getRuntimeSettings,
	execPromise,
	getDuration,
	cleanup,
}) {
	async function renderVideo({
		video,
		audio,
		subtitles,
		fontsize = 30,
		outline = 2,
		orientation,
		width,
		height,
	}) {
		const runtimeSettings = getRuntimeSettings();

		if (!audio || !subtitles) {
			const err = new Error("Missing parameters");
			err.status = 400;
			throw err;
		}

		orientation = normalizeOrientation(
			orientation || runtimeSettings.defaultVideoOrientation,
		);

		if (orientation === "custom") {
			width = parsePositiveInt(width) || runtimeSettings.defaultVideoWidth;
			height = parsePositiveInt(height) || runtimeSettings.defaultVideoHeight;
		}

		resolveVideoGeometry(orientation, width, height);

		console.log(
			`/burn orientation=${orientation}${orientation === "custom" ? ` ${width}x${height}` : ""}`,
		);

		const tmp = `/tmp/${uuidv4()}`;

		fs.mkdirSync(tmp);

		try {
			const audioPath = `${tmp}/audio.wav`;
			const subPath = `${tmp}/sub.srt`;
			const assPath = `${tmp}/sub.ass`;
			const outputPath = `${tmp}/output.mp4`;

			fs.writeFileSync(audioPath, Buffer.from(audio, "base64"));
			fs.writeFileSync(subPath, subtitles);

			let videoFilePath;
			let startOffset = 0;
			let shouldLoopVideo = false;

			if (!video) {
				const allFiles = fs.readdirSync(runtimeSettings.inputVideosDir);

				const videoFiles = allFiles.filter((filename) =>
					/\.(mp4|mov|mkv|webm)$/i.test(filename),
				);

				const defaultVideos = videoFiles.filter((filename) =>
					filename.startsWith("default_"),
				);

				const candidates =
					defaultVideos.length > 0 ? defaultVideos : videoFiles;

				if (candidates.length === 0) {
					throw new Error(
						`No video files found in ${runtimeSettings.inputVideosDir}`,
					);
				}

				video = candidates[Math.floor(Math.random() * candidates.length)];
				videoFilePath = path.join(runtimeSettings.inputVideosDir, video);
			} else {
				videoFilePath = path.join(runtimeSettings.inputVideosDir, video);

				if (!fs.existsSync(videoFilePath)) {
					const err = new Error("Video file not found");
					err.status = 404;
					throw err;
				}
			}

			const videoDuration = await getDuration(videoFilePath);
			const audioDuration = await getDuration(audioPath);

			if (
				Number.isFinite(videoDuration) &&
				videoDuration > 0 &&
				Number.isFinite(audioDuration) &&
				audioDuration > 0
			) {
				if (videoDuration < audioDuration) {
					shouldLoopVideo = true;
					startOffset = 0;
				} else {
					const delta = Math.max(videoDuration - audioDuration - 1, 0);
					startOffset = delta > 0 ? Math.random() * delta : 0;
				}
			}

			await execPromise(`ffmpeg -y -i "${subPath}" "${assPath}"`);

			await execPromise(
				`sed -i '/^Style:/c\\Style: Default,Montserrat ExtraBold,${fontsize},&H00FFFFFF,&H00000000,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,2,${outline},2,10,10,10,1' "${assPath}"`,
			);

			await execPromise(
				`grep -q "WrapStyle" "${assPath}" && sed -i 's/WrapStyle.*/WrapStyle: 0/' "${assPath}" || sed -i '/^\\[Script Info\\]/a WrapStyle: 0' "${assPath}"`,
			);

			const videoFilter = buildVideoFilter(
				assPath,
				orientation,
				width,
				height,
			);

			const loopVideoArg = shouldLoopVideo ? "-stream_loop -1" : "";

			await execPromise(
				`ffmpeg -y ${loopVideoArg} -ss ${startOffset.toFixed(2)} -i "${videoFilePath}" -i "${audioPath}" ${videoFilter ? `-vf "${videoFilter}"` : ""} -map 0:v:0 -map 1:a:0 -c:v libx264 -c:a aac -shortest "${outputPath}"`,
			);

			ensureDirectoryExists(runtimeSettings.outputVideosDir);

			const savedFileName = `generated_${Date.now()}_${uuidv4().slice(0, 8)}.mp4`;

			const savedOutputPath = path.join(
				runtimeSettings.outputVideosDir,
				savedFileName,
			);

			fs.copyFileSync(outputPath, savedOutputPath);

			console.log(`Saved rendered video to ${savedOutputPath}`);

			return {
				tmp,
				outputPath,
				savedFileName,
				savedOutputPath,
			};
		} catch (err) {
			cleanup(tmp);
			throw err;
		}
	}

	return {
		renderVideo,
		normalizeOrientation,
		parsePositiveInt,
		resolveVideoGeometry,
		buildVideoFilter,
	};
}

export {
	createVideoRenderService,
	normalizeOrientation,
	parsePositiveInt,
	resolveVideoGeometry,
	buildVideoFilter,
};