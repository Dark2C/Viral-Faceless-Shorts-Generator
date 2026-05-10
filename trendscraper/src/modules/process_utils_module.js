import fs from "fs";
import { exec, execFile } from "child_process";

function execPromise(cmd) {
	return new Promise((resolve, reject) => {
		exec(cmd, (error, stdout, stderr) =>
			error ? reject(stderr) : resolve(stdout),
		);
	});
}

function execFilePromise(file, args, options = {}) {
	return new Promise((resolve, reject) => {
		execFile(file, args, options, (error, stdout, stderr) => {
			if (error) {
				const err = new Error(
					String(stderr || stdout || error.message || "Command failed").trim(),
				);
				err.stdout = stdout;
				err.stderr = stderr;
				err.cause = error;
				reject(err);
				return;
			}

			resolve({ stdout, stderr });
		});
	});
}

async function getDuration(filePath) {
	const stdout = await execPromise(
		`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
	);

	return parseFloat(stdout.trim());
}

function cleanup(folder) {
	fs.rmSync(folder, { recursive: true, force: true });
}

export {
	execPromise,
	execFilePromise,
	getDuration,
	cleanup,
};