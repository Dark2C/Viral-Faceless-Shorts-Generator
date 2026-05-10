import { dom } from "./dom.js";
import {
	TREND_CATEGORIES,
	TREND_COUNTRIES,
	PREVIEW_TEXT_BY_LOCALE,
	DEFAULT_TOPIC_PLACEHOLDER,
	SETTINGS_LOCALES,
} from "./constants.js";

const {
	cardGrid,
	toastContainer,
	confirmModalEl,
	confirmModalMessage,
	confirmModalCancelBtn,
	confirmModalOkBtn,
	inputModalEl,
	inputModalLabel,
	inputModalMessage,
	inputModalField,
	inputModalHelp,
	inputModalCancelBtn,
	inputModalOkBtn,
	languageSelect,
	qualitySelect,
	voiceSelect,
	previewVoiceBtn,
	orientationSelect,
	includeSubtitlesInput,
	openSettingsBtn,
	saveSettingsBtn,
	settingsModalEl,
	settingsInputVideosDir,
	settingsOutputVideosDir,
	settingsDefaultOrientation,
	settingsDefaultWidth,
	settingsDefaultHeight,
	settingsSpeakerId,
	settingsLanguageId,
	settingsQualityId,
	settingsLocale,
	settingsDefaultPromptIdea,
	settingsUseCurrentVoiceBtn,
	settingsSubtitlesDefault,
	uploadVideosInput,
	uploadVideosBtn,
	uploadVideosStatus,
	youtubeImportUrlInput,
	youtubeImportBtn,
	youtubeImportStatus,
	youtubeImportJobs,
	customWidthInput,
	customHeightInput,
	customWidthGroup,
	customHeightGroup,
	scriptSourceSelect,
	scriptPromptInput,
	scriptPromptGroup,
	promptPresetSelect,
	promptPresetNameInput,
	loadPromptPresetBtn,
	savePromptPresetBtn,
	deletePromptPresetBtn,
	directScriptInput,
	directScriptGroup,
	trendsWorkflowGroup,
	trendGeoSelect,
	trendHoursSelect,
	trendCategorySelect,
	trendStatusSelect,
	trendSortSelect,
	trendMaxVideosInput,
	generateScriptBtn,
	uploadedVideosGrid,
	generatedVideosGrid,
	chooseUploadVideosBtn,
	uploadVideosFileLabel,
} = dom;

const confirmModal = confirmModalEl ? new bootstrap.Modal(confirmModalEl) : null;
const inputModal = inputModalEl ? new bootstrap.Modal(inputModalEl) : null;

let activeConfirmResolver = null;
let activeInputResolver = null;

let ttsQueue = [],
	alignQueue = [],
	burnQueue = [];
const cancelledJobIds = new Set();
let ttsLock = false,
	alignLock = false,
	burnLock = false;
let speaker_id = undefined;
let speaker_language = "";
let quality_id = "";
let defaultPromptIdeaValue = "";
let promptPresets = [];
let availableVoiceOptions = [];
let isPreviewPlaying = false;
let previewAudioUrl = null;
let youtubeImportPollTimer = null;
let activeYoutubeImportJobId = "";
const previewAudio = new Audio();

function getPreviewText(locale) {
	return (PREVIEW_TEXT_BY_LOCALE[locale.split("_")[0]] || PREVIEW_TEXT_BY_LOCALE.en);
}

function showToast(message) {
	const toast = document.createElement("div");
	toast.className =
		"toast align-items-center text-white bg-primary border-0 show";
	toast.role = "alert";
	toast.innerHTML = `
        <div class="d-flex">
          <div class="toast-body">${message}</div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>`;
	toastContainer.appendChild(toast);
	setTimeout(() => toast.remove(), 4000);
}

function showConfirmModal(message = "Are you sure?", options = {}) {
	return new Promise((resolve) => {
		if (!confirmModal || !confirmModalEl) {
			resolve(false);
			return;
		}

		if (activeConfirmResolver) {
			activeConfirmResolver(false);
			activeConfirmResolver = null;
		}

		activeConfirmResolver = resolve;
		confirmModalMessage.textContent = String(message || "Are you sure?");
		confirmModalOkBtn.textContent = options.confirmText || "Confirm";
		confirmModalCancelBtn.textContent = options.cancelText || "Cancel";
		confirmModalOkBtn.className = options.confirmClass || "btn btn-danger";
		confirmModal.show();
	});
}

function resolveConfirmModal(value) {
	if (!activeConfirmResolver) return;

	const resolve = activeConfirmResolver;
	activeConfirmResolver = null;
	confirmModal.hide();
	resolve(value);
}

confirmModalOkBtn?.addEventListener("click", () => {
	resolveConfirmModal(true);
});

confirmModalCancelBtn?.addEventListener("click", () => {
	resolveConfirmModal(false);
});

confirmModalEl?.addEventListener("hidden.bs.modal", () => {
	if (!activeConfirmResolver) return;

	const resolve = activeConfirmResolver;
	activeConfirmResolver = null;
	resolve(false);
});

function showInputModal(message = "Value", options = {}) {
	return new Promise((resolve) => {
		if (!inputModal || !inputModalEl) {
			resolve(null);
			return;
		}

		if (activeInputResolver) {
			activeInputResolver(null);
			activeInputResolver = null;
		}

		activeInputResolver = resolve;

		inputModalLabel.textContent = options.title || "Enter value";
		inputModalMessage.textContent = String(message || "Value");
		inputModalField.value = options.defaultValue || "";
		inputModalField.placeholder = options.placeholder || "";
		inputModalHelp.textContent = options.helpText || "";
		inputModalOkBtn.textContent = options.confirmText || "Save";
		inputModalCancelBtn.textContent = options.cancelText || "Cancel";
		inputModalOkBtn.className = options.confirmClass || "btn btn-primary";

		inputModal.show();

		inputModalEl?.addEventListener("shown.bs.modal", () => {
			inputModalField?.focus();
			inputModalField?.select();
		});
	});
}

function resolveInputModal(value) {
	if (!activeInputResolver) return;

	const resolve = activeInputResolver;
	activeInputResolver = null;

	inputModal.hide();
	resolve(value);
}

inputModalOkBtn?.addEventListener("click", () => {
	resolveInputModal(inputModalField.value);
});

inputModalCancelBtn?.addEventListener("click", () => {
	resolveInputModal(null);
});

inputModalField?.addEventListener("keydown", (event) => {
	if (event.key === "Enter") {
		event.preventDefault();
		resolveInputModal(inputModalField.value);
	}

	if (event.key === "Escape") {
		event.preventDefault();
		resolveInputModal(null);
	}
});

inputModalEl?.addEventListener("hidden.bs.modal", () => {
	if (!activeInputResolver) return;

	const resolve = activeInputResolver;
	activeInputResolver = null;
	resolve(null);
});

function isJobCancelled(id) {
	return cancelledJobIds.has(id);
}

function removeJobFromQueues(id) {
	ttsQueue = ttsQueue.filter((job) => job.id !== id);
	alignQueue = alignQueue.filter((job) => job.id !== id);
	burnQueue = burnQueue.filter((job) => job.id !== id);
}

async function requestCancelJob(id) {
	const confirmed = await showConfirmModal("Cancel this job?", {
		confirmText: "Cancel job",
		cancelText: "Keep job",
		confirmClass: "btn btn-danger",
	});

	if (!confirmed) return;
	cancelJob(id);
}

function cancelJob(id) {
	cancelledJobIds.add(id);
	removeJobFromQueues(id);

	const card = document.getElementById(id);
	if (!card) return;

	card.classList.add("cancelled");

	const closeBtn = card.querySelector(".job-close-btn");
	if (closeBtn) closeBtn.disabled = true;

	const approveBtn = card.querySelector(".approve-btn");
	if (approveBtn) approveBtn.disabled = true;

	const textarea = card.querySelector(".script-editor");
	if (textarea) textarea.disabled = true;

	clearRetryButton(id);
	updateCard(id, { progress: 0, label: "Cancelled", force: true });
	showToast("Job cancelled");

	setTimeout(() => {
		if (!card || !card.isConnected) return;

		card.classList.add("removing");

		setTimeout(() => {
			if (card && card.isConnected) {
				card.remove();
			}
		}, 400);
	}, 2000);
}

function updateCard(
	id,
	{ title, description, progress, label, downloadUrl, force = false },
) {
	const card = document.getElementById(id);
	if (!card) return;
	if (!force && isJobCancelled(id)) return;

	if (title) {
		const titleEl = card.querySelector("h6");
		titleEl.textContent = title;
		titleEl.onclick = () => copyToClipboard(title);
	}

	if (description !== undefined) {
		const descEl = card.querySelector("p");
		descEl.textContent = description;
		descEl.onclick = () => copyToClipboard(description);
	}

	if (progress !== undefined) {
		card.querySelector(".progress-bar").style.width = progress + "%";
	}

	if (label) {
		card.querySelector(".status-label").textContent = label;
	}

	if (downloadUrl) {
		if (card.querySelector(".download-btn")) return;
		const btn = document.createElement("a");
		btn.href = downloadUrl;
		btn.download = `${title || "video"}.mp4`;
		btn.className =
			"btn btn-sm btn-outline-primary mt-2 w-100 download-btn";
		btn.textContent = "Download Video";
		card.appendChild(btn);
	}
}

function createCard(id, inputText, source = "gemini") {
	const sourceLabel =
		source === "direct"
			? "Custom Script"
			: source === "trend"
				? "Google Trend"
				: "AI Topic";
	const previewLabel =
		source === "direct"
			? "Script"
			: source === "trend"
				? "Trend"
				: "Topic";
	const card = document.createElement("div");
	card.id = id;
	card.className = "card-tile";
	card.innerHTML = `
        <button type="button" class="job-close-btn" title="Cancel job" aria-label="Cancel job">×</button>
        <h6>${sourceLabel}</h6>
        <p></p>
		<div class="mb-2 text-muted" style="font-size: 0.8rem;">${previewLabel}: <span class="prompt-preview"></span></div>
				<div class="mb-2 text-muted orientation-preview" style="font-size: 0.8rem;"></div>
        <div class="script-container d-none">
          <label class="form-label mb-1" style="font-size: 0.82rem;">Script (editable before approval)</label>
          <textarea class="form-control script-editor mb-2"></textarea>
          <button class="btn btn-success btn-sm w-100 approve-btn">Approve Script</button>
        </div>
        <div class="progress" style="height: 8px;">
          <div class="progress-bar" style="width: 5%"></div>
        </div>
        <div class="status-label mt-1 text-muted" style="font-size: 0.8rem;">Queued...</div>
      `;

	card.querySelector(".prompt-preview").textContent = inputText;
	card.querySelector(".job-close-btn").onclick = () => requestCancelJob(id);
	cardGrid.appendChild(card);
}

function truncatePreviewText(value, maxLength = 120) {
	const text = String(value || "")
		.replace(/\s+/g, " ")
		.trim();
	if (!text) return "";
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength)}...`;
}

function sanitizePromptPresets(value) {
	if (!Array.isArray(value)) return [];

	return value
		.map((preset, index) => {
			if (!preset || typeof preset !== "object" || Array.isArray(preset)) {
				return null;
			}

			const name =
				typeof preset.name === "string" ? preset.name.trim() : "";
			const prompt =
				typeof preset.prompt === "string" ? preset.prompt.trim() : "";
			if (!name || !prompt) return null;

			const id =
				typeof preset.id === "string" && preset.id.trim()
					? preset.id.trim()
					: `preset_${index + 1}`;
			return {
				id,
				name: name.slice(0, 120),
				prompt: prompt.slice(0, 5000),
			};
		})
		.filter(Boolean)
		.slice(0, 50);
}

function populatePromptPresetSelect(selectedId = "") {
	const desiredId = String(selectedId || "");
	const previousValue = promptPresetSelect.value || "";
	const nextValue = desiredId || previousValue;

	promptPresetSelect.innerHTML =
		'<option value="">No preset selected</option>';
	promptPresets.forEach((preset) => {
		const option = document.createElement("option");
		option.value = preset.id;
		option.textContent = preset.name;
		promptPresetSelect.appendChild(option);
	});

	if (
		nextValue &&
		promptPresets.some((preset) => preset.id === nextValue)
	) {
		promptPresetSelect.value = nextValue;
	} else {
		promptPresetSelect.value = "";
	}

	syncPromptPresetName();
}

function applyPromptPresets(presets, selectedId = "") {
	promptPresets = sanitizePromptPresets(presets);
	populatePromptPresetSelect(selectedId);
}

function getSelectedPromptPreset() {
	const selectedId = promptPresetSelect.value || "";
	return promptPresets.find((preset) => preset.id === selectedId) || null;
}

function syncPromptPresetName() {
	const selectedPreset = getSelectedPromptPreset();
	promptPresetNameInput.value = selectedPreset?.name || "";
	deletePromptPresetBtn.disabled = !selectedPreset;
	loadPromptPresetBtn.disabled = !selectedPreset;
}

function buildPromptPresetId() {
	return `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function persistPromptPresets(
	nextPresets,
	{ selectedId = "", successMessage = "Prompt presets saved" } = {},
) {
	const res = await fetch("/api/settings", {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ prompt_presets: nextPresets }),
	});
	if (!res.ok) {
		throw await buildHttpError(res, "Failed to save prompt presets");
	}

	const data = await res.json();
	const settings = data?.settings || {};
	applyPromptPresets(settings.prompt_presets || nextPresets, selectedId);
	if (typeof settings.default_prompt_idea === "string") {
		applyDefaultPromptIdeaToInput(settings.default_prompt_idea);
	}
	showToast(successMessage);
}

function loadSelectedPromptPresetIntoInput() {
	const selectedPreset = getSelectedPromptPreset();
	if (!selectedPreset) {
		showToast("Select a preset first");
		return;
	}

	scriptPromptInput.value = selectedPreset.prompt;
	promptPresetNameInput.value = selectedPreset.name;
	showToast(`Loaded preset: ${selectedPreset.name}`);
}

async function saveCurrentPromptPreset() {
	try {
		const prompt = scriptPromptInput.value.trim();
		if (!prompt) {
			showToast("Write a prompt first");
			return;
		}

		const selectedPreset = getSelectedPromptPreset();
		const requestedName = promptPresetNameInput.value.trim();
		const targetName = requestedName || selectedPreset?.name || "";
		if (!targetName) {
			showToast("Add a preset name first");
			return;
		}

		const normalizedName = targetName.toLowerCase();
		const existingPreset =
			selectedPreset ||
			promptPresets.find(
				(preset) => preset.name.toLowerCase() === normalizedName,
			);
		const nextPreset = {
			id: existingPreset?.id || buildPromptPresetId(),
			name: targetName,
			prompt,
		};
		const nextPresets = existingPreset
			? promptPresets.map((preset) =>
				preset.id === existingPreset.id ? nextPreset : preset,
			)
			: [...promptPresets, nextPreset];

		await persistPromptPresets(nextPresets, {
			selectedId: nextPreset.id,
			successMessage: existingPreset
				? `Updated preset: ${nextPreset.name}`
				: `Saved preset: ${nextPreset.name}`,
		});
	} catch (err) {
		showToast(err?.message || "Failed to save preset");
	}
}

async function deleteCurrentPromptPreset() {
	try {
		const selectedPreset = getSelectedPromptPreset();
		if (!selectedPreset) {
			showToast("Select a preset first");
			return;
		}

		const confirmed = await showConfirmModal(
			`Delete preset "${selectedPreset.name}"?`,
			{
				confirmText: "Delete preset",
				cancelText: "Keep preset",
				confirmClass: "btn btn-danger",
			},
		);
		if (!confirmed) return;

		const nextPresets = promptPresets.filter(
			(preset) => preset.id !== selectedPreset.id,
		);
		await persistPromptPresets(nextPresets, {
			selectedId: "",
			successMessage: `Deleted preset: ${selectedPreset.name}`,
		});
	} catch (err) {
		showToast(err?.message || "Failed to delete preset");
	}
}

function getSelectedScriptSource() {
	const source = scriptSourceSelect?.value || "gemini";
	return ["gemini", "direct", "trends"].includes(source) ? source : "gemini";
}

function updateScriptSourceInputs() {
	const source = getSelectedScriptSource();
	const usingDirectScript = source === "direct";
	const usingTrends = source === "trends";

	scriptPromptGroup.classList.toggle("d-none", usingDirectScript || usingTrends);
	directScriptGroup.classList.toggle("d-none", !usingDirectScript);
	trendsWorkflowGroup.classList.toggle("d-none", !usingTrends);
	generateScriptBtn.textContent = usingDirectScript
		? "Use My Script"
		: usingTrends
			? "Fetch Trends & Generate Scripts"
			: "Generate Script";
}

function buildDirectScriptPayload(scriptText) {
	const lines = String(scriptText || "")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	const fallbackTitle = "Direct Script";
	const title = lines[0]
		? truncatePreviewText(lines[0], 80)
		: fallbackTitle;
	return {
		title,
		description: "Using direct script input",
		body: scriptText,
	};
}

function formatOrientationText(settings) {
	if (!settings || !settings.orientation) return "Orientation: portrait";
	if (settings.orientation === "custom") {
		return `Orientation: custom (${settings.width}x${settings.height})`;
	}
	return `Orientation: ${settings.orientation}`;
}

function formatSubtitlesText(settings) {
	if (!settings) return "Subtitles: on";
	return settings.includeSubtitles === false
		? "Subtitles: off"
		: "Subtitles: on";
}

function clearRetryButton(id) {
	const card = document.getElementById(id);
	if (!card) return;
	const btn = card.querySelector(".retry-btn");
	if (btn) btn.remove();
}

function setRetryButton(id, text, onRetry) {
	const card = document.getElementById(id);
	if (!card) return;
	clearRetryButton(id);

	const btn = document.createElement("button");
	btn.className = "btn btn-sm btn-outline-warning mt-2 w-100 retry-btn";
	btn.textContent = text;
	btn.onclick = async () => {
		btn.disabled = true;
		btn.textContent = "Retrying...";
		await onRetry();
	};
	card.appendChild(btn);
}

function isRetryableError(err) {
	if (!err || typeof err !== "object") return true;
	if (err.status === 429) return true;
	if (typeof err.status === "number") return err.status >= 500;
	return true;
}

async function withRetry(taskFn, onRetry, options = {}) {
	const maxRetries = options.maxRetries ?? 3;
	const baseDelayMs = options.baseDelayMs ?? 5000;
	let attempts = 0;

	while (true) {
		try {
			return await taskFn();
		} catch (err) {
			const retryable = isRetryableError(err);
			if (!retryable) {
				throw err;
			}

			if (attempts >= maxRetries) {
				throw err;
			}

			attempts += 1;
			const delayMs = err?.retryAfterMs || baseDelayMs * attempts;
			if (onRetry) onRetry(err, attempts, maxRetries, delayMs);

			if (err?.status === 429) {
				const seconds = Math.ceil(delayMs / 1000);
				showToast(
					`Rate limited by Gemini. Retrying in ${seconds}s... (${attempts}/${maxRetries})`,
				);
			} else {
				showToast(
					`Temporary error. Retrying... (${attempts}/${maxRetries})`,
				);
			}

			await new Promise((res) => setTimeout(res, delayMs));
		}
	}
}

function generateId() {
	const array = new Uint8Array(10);
	window.crypto.getRandomValues(array);
	return Array.from(array, (byte) =>
		("0" + byte.toString(16)).slice(-2),
	).join("");
}

function updateOrientationInputsVisibility() {
	const isCustom = orientationSelect.value === "custom";
	customWidthGroup.classList.toggle("d-none", !isCustom);
	customHeightGroup.classList.toggle("d-none", !isCustom);
}

function getSelectedOrientationSettings() {
	const orientation = orientationSelect.value || "portrait";
	if (orientation !== "custom") {
		return { orientation };
	}

	const width = Number.parseInt(customWidthInput.value, 10);
	const height = Number.parseInt(customHeightInput.value, 10);
	if (!Number.isFinite(width) || width <= 0) {
		throw new Error("Custom width must be a positive number");
	}
	if (!Number.isFinite(height) || height <= 0) {
		throw new Error("Custom height must be a positive number");
	}

	return { orientation, width, height };
}

async function runGenerationForCard(id, prompt, orientationSettings) {
	if (isJobCancelled(id)) return;

	clearRetryButton(id);
	updateCard(id, {
		progress: 15,
		label: "Generating script with Gemini...",
	});

	let generated;
	try {
		generated = await withRetry(
			() => generateContent(prompt),
			(err, attempt, maxRetries, delayMs) => {
				if (isJobCancelled(id)) return;

				if (err?.status === 429) {
					updateCard(id, {
						label: `Rate limited. Retrying in ${Math.ceil(delayMs / 1000)}s... (${attempt}/${maxRetries})`,
					});
				} else {
					updateCard(id, {
						label: `Retrying generation... (${attempt}/${maxRetries})`,
					});
				}
			},
			{ maxRetries: 4, baseDelayMs: 5000 },
		);
	} catch (err) {
		if (isJobCancelled(id)) return;

		const message = err?.message || "Failed to generate script";
		showToast(message);
		updateCard(id, { label: "Generation failed" });
		setRetryButton(id, "Retry Generation", async () => {
			await runGenerationForCard(id, prompt, orientationSettings);
		});
		return;
	}

	if (isJobCancelled(id)) return;

	if (!generated || !generated.body) {
		showToast("Generation failed: invalid response");
		updateCard(id, { label: "Generation failed" });
		setRetryButton(id, "Retry Generation", async () => {
			await runGenerationForCard(id, prompt, orientationSettings);
		});
		return;
	}

	clearRetryButton(id);
	updateCard(id, {
		title: generated.title || "Generated Script",
		description: generated.description || "",
		progress: 35,
		label: "Script ready. Review and tap Approve.",
	});

	renderApprovalUI(id, generated, orientationSettings);
}

function getCurrentWorkflowSettings() {
	const includeSubtitles = includeSubtitlesInput
		? Boolean(includeSubtitlesInput.checked)
		: true;

	const orientationSettings = getSelectedOrientationSettings();

	return {
		...orientationSettings,
		includeSubtitles,
	};
}

function buildTrendPrompt(trend) {
	const title = String(trend?.trend || "").trim();
	const volume = String(trend?.volume || "").trim();
	const breakdown = String(trend?.breakdown || "").trim();
	const started = String(trend?.started || "").trim();
	const ended = String(trend?.ended || "").trim();
	const context = [
		volume ? `Search volume: ${volume}` : "",
		breakdown ? `Trend breakdown: ${breakdown}` : "",
		started ? `Started: ${started}` : "",
		ended ? `Ended: ${ended}` : "",
	]
		.filter(Boolean)
		.join("\n");

	return context
		? `Create a viral faceless short video script about this Google trend: ${title}.\n${context}`
		: title;
}

async function fetchGoogleTrends() {
	const geo = trendGeoSelect.value;
	const hours = trendHoursSelect.value;
	const status = trendStatusSelect.value;
	const sort = trendSortSelect.value;
	const category = trendCategorySelect.value;

	if (!geo) {
		throw new Error("Select a country first");
	}
	if (!hours) {
		throw new Error("Select a time range first");
	}

	const res = await fetch("/api/scrape", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ geo, hours, status, sort, category }),
	});

	if (!res.ok) {
		throw await buildHttpError(res, "Failed to fetch Google Trends");
	}

	const trends = await res.json();
	if (!Array.isArray(trends)) {
		throw new Error("Invalid trends response");
	}

	return trends.filter((trend) => String(trend?.trend || "").trim());
}

async function startTrendsWorkflow(workflowSettings) {
	generateScriptBtn.disabled = true;
	generateScriptBtn.textContent = "Fetching trends...";

	try {
		let trends = await withRetry(
			() => fetchGoogleTrends(),
			(_, attempt, maxRetries) => {
				showToast(`Retrying trends fetch... (${attempt}/${maxRetries})`);
			},
			{ maxRetries: 2, baseDelayMs: 3000 },
		);

		const maxVideos = Number.parseInt(trendMaxVideosInput.value, 10);
		const limit = Number.isFinite(maxVideos) && maxVideos > 0 ? maxVideos : trends.length;
		trends = trends.slice(0, limit);

		if (!trends.length) {
			showToast("No trends found for these filters");
			return;
		}

		trends.forEach((trend) => {
			const id = generateId();
			const title = String(trend.trend || "Trend").trim();
			createCard(id, title, "trend");

			const card = document.getElementById(id);
			if (card) {
				const promptPreview = card.querySelector(".prompt-preview");
				if (promptPreview) {
					promptPreview.textContent = truncatePreviewText(buildTrendPrompt(trend));
				}

				const orientationPreview = card.querySelector(".orientation-preview");
				if (orientationPreview) {
					orientationPreview.textContent = `${formatOrientationText(workflowSettings)} | ${formatSubtitlesText(workflowSettings)}`;
				}
			}

			const metadata = [
				trend.volume ? `Volume: ${trend.volume}` : "",
				trend.breakdown ? `Breakdown: ${trend.breakdown}` : "",
				trend.started ? `Started: ${trend.started}` : "",
			]
				.filter(Boolean)
				.join(" | ");
			updateCard(id, {
				description: metadata,
				progress: 8,
				label: "Trend queued for script generation...",
			});
			runGenerationForCard(id, buildTrendPrompt(trend), workflowSettings);
		});

		showToast(`Queued ${trends.length} trend topic(s)`);
	} catch (err) {
		showToast(err?.message || "Failed to fetch trends");
	} finally {
		generateScriptBtn.disabled = false;
		updateScriptSourceInputs();
	}
}

async function startPromptWorkflow() {
	const source = getSelectedScriptSource();
	const prompt = scriptPromptInput.value.trim();
	const selectedPreset = getSelectedPromptPreset();
	const presetPrompt = selectedPreset?.prompt || "";
	const effectivePrompt = prompt || presetPrompt || defaultPromptIdeaValue;
	const directScript = directScriptInput.value.trim();

	if (source === "gemini" && !effectivePrompt) {
		showToast("Set a default prompt in Settings or type a topic first");
		return;
	}

	if (source === "direct" && !directScript) {
		showToast("Please paste your script first");
		return;
	}

	let workflowSettings;
	try {
		workflowSettings = getCurrentWorkflowSettings();
	} catch (err) {
		showToast(err?.message || "Invalid orientation settings");
		return;
	}

	if (source === "trends") {
		await startTrendsWorkflow(workflowSettings);
		return;
	}

	const id = generateId();
	const inputPreview = truncatePreviewText(
		source === "direct" ? directScript : effectivePrompt,
	);
	createCard(id, inputPreview, source);
	const card = document.getElementById(id);
	if (card) {
		const orientationPreview = card.querySelector(".orientation-preview");
		if (orientationPreview) {
			orientationPreview.textContent = `${formatOrientationText(workflowSettings)} | ${formatSubtitlesText(workflowSettings)}`;
		}
	}

	if (source === "direct") {
		const generated = buildDirectScriptPayload(directScript);
		updateCard(id, {
			title: generated.title,
			description: generated.description,
			progress: 35,
			label: "Script ready. Review and tap Approve.",
		});
		renderApprovalUI(id, generated, workflowSettings);
		directScriptInput.value = "";
		return;
	}

	await runGenerationForCard(id, effectivePrompt, workflowSettings);
	scriptPromptInput.value = "";
}

function renderApprovalUI(id, generated, orientationSettings) {
	if (isJobCancelled(id)) return;

	const card = document.getElementById(id);
	if (!card) return;

	const container = card.querySelector(".script-container");
	const textarea = card.querySelector(".script-editor");
	const approveBtn = card.querySelector(".approve-btn");

	container.classList.remove("d-none");
	textarea.value = generated.body;

	approveBtn.onclick = () => {
		if (isJobCancelled(id)) return;

		const approvedBody = textarea.value.trim();
		if (!approvedBody) {
			showToast("Script cannot be empty");
			return;
		}

		approveBtn.disabled = true;
		approveBtn.textContent = "Approved";
		textarea.disabled = true;

		const approved = {
			title: generated.title || "Generated Script",
			description: generated.description || "",
			body: approvedBody,
			...orientationSettings,
		};

		ttsQueue.push({ id, generated: approved });
		clearRetryButton(id);
		updateCard(id, {
			progress: 45,
			label: "Approved. Creating voice audio...",
		});

		processTTS();
		processAlign();
		processBurn();
	};
}

async function processTTS() {
	if (ttsLock || ttsQueue.length === 0) return;
	ttsLock = true;

	const { id, generated } = ttsQueue.shift();
	if (isJobCancelled(id)) {
		ttsLock = false;
		processTTS();
		return;
	}

	clearRetryButton(id);
	updateCard(id, { progress: 55, label: "Creating voice audio..." });

	let ttsAudio;
	try {
		ttsAudio = await withRetry(
			() => generateTTS(generated.body),
			(_, attempt, maxRetries) =>
				updateCard(id, {
					label: `Retrying TTS... (${attempt}/${maxRetries})`,
				}),
			{ maxRetries: 3, baseDelayMs: 5000 },
		);
	} catch (err) {
		showToast(err?.message || "TTS failed");
		updateCard(id, { label: "TTS failed" });
		setRetryButton(id, "Retry TTS", async () => {
			ttsQueue.unshift({ id, generated });
			updateCard(id, { progress: 50, label: "Retry queued for TTS..." });
			processTTS();
			processAlign();
			processBurn();
		});
		ttsLock = false;
		processTTS();
		return;
	}

	if (isJobCancelled(id)) {
		ttsLock = false;
		processTTS();
		return;
	}

	if (generated.includeSubtitles === false) {
		burnQueue.push({
			id,
			srt: null,
			ttsAudio,
			title: generated.title,
			orientation: generated.orientation,
			width: generated.width,
			height: generated.height,
		});
		updateCard(id, {
			progress: 85,
			label: "Voice ready. Rendering video...",
		});
	} else {
		alignQueue.push({ id, generated, ttsAudio });
		updateCard(id, { progress: 65, label: "Voice audio created" });
	}

	ttsLock = false;
	processTTS();
	processAlign();
	processBurn();
}

async function processAlign() {
	if (alignLock || alignQueue.length === 0) return;
	alignLock = true;

	const { id, generated, ttsAudio } = alignQueue.shift();
	if (isJobCancelled(id)) {
		alignLock = false;
		processAlign();
		return;
	}

	clearRetryButton(id);
	updateCard(id, { progress: 75, label: "Aligning subtitles..." });

	let srt;
	try {
		srt = await withRetry(
			() => alignSubtitles(generated.body, ttsAudio.base64),
			(_, attempt, maxRetries) =>
				updateCard(id, {
					label: `Retrying alignment... (${attempt}/${maxRetries})`,
				}),
			{ maxRetries: 3, baseDelayMs: 4000 },
		);
	} catch (err) {
		showToast(err?.message || "Subtitle alignment failed");
		updateCard(id, { label: "Alignment failed" });
		setRetryButton(id, "Retry Alignment", async () => {
			alignQueue.unshift({ id, generated, ttsAudio });
			updateCard(id, {
				progress: 70,
				label: "Retry queued for alignment...",
			});
			processAlign();
			processBurn();
		});
		alignLock = false;
		processAlign();
		return;
	}

	if (isJobCancelled(id)) {
		alignLock = false;
		processAlign();
		return;
	}

	burnQueue.push({
		id,
		srt,
		ttsAudio,
		title: generated.title,
		orientation: generated.orientation,
		width: generated.width,
		height: generated.height,
	});
	updateCard(id, { progress: 85, label: "Subtitles aligned" });

	alignLock = false;
	processAlign();
	processBurn();
}

async function processBurn() {
	if (burnLock || burnQueue.length === 0) return;
	burnLock = true;

	const { id, srt, ttsAudio, title, orientation, width, height } =
		burnQueue.shift();
	if (isJobCancelled(id)) {
		burnLock = false;
		processBurn();
		return;
	}

	clearRetryButton(id);
	updateCard(id, { progress: 92, label: "Rendering video..." });

	let video;
	try {
		video = await withRetry(
			() => burnVideo(ttsAudio.base64, srt, orientation, width, height),
			(_, attempt, maxRetries) =>
				updateCard(id, {
					label: `Retrying rendering... (${attempt}/${maxRetries})`,
				}),
			{ maxRetries: 2, baseDelayMs: 6000 },
		);
	} catch (err) {
		showToast(err?.message || "Video rendering failed");
		updateCard(id, { label: "Rendering failed" });
		setRetryButton(id, "Retry Rendering", async () => {
			burnQueue.unshift({
				id,
				srt,
				ttsAudio,
				title,
				orientation,
				width,
				height,
			});
			updateCard(id, {
				progress: 90,
				label: "Retry queued for rendering...",
			});
			processBurn();
		});
		burnLock = false;
		processBurn();
		return;
	}

	if (isJobCancelled(id)) {
		burnLock = false;
		processBurn();
		return;
	}

	updateCard(id, {
		progress: 100,
		label: "Video ready",
		downloadUrl: video.url,
		title,
	});
	clearRetryButton(id);
	refreshGeneratedVideosList();

	burnLock = false;
	processBurn();
}

function copyToClipboard(text) {
	navigator.clipboard.writeText(text).then(() => {
		showToast("Copied to clipboard");
	});
}

async function buildHttpError(res, fallbackMessage) {
	let message = fallbackMessage;
	const contentType = res.headers.get("content-type") || "";

	try {
		if (contentType.includes("application/json")) {
			const data = await res.json();
			message =
				data?.error || data?.details || data?.message || fallbackMessage;
		} else {
			const text = await res.text();
			if (text && text.trim()) {
				message = text.slice(0, 300);
			}
		}
	} catch (_) {
		// Keep fallback message if response body cannot be parsed.
	}

	const err = new Error(message);
	err.status = res.status;
	return err;
}

async function generateContent(prompt) {
	const res = await fetch("/api/generate", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ prompt }),
	});
	if (!res.ok) {
		const err = await buildHttpError(res, "Failed to generate script");
		const message = err.message;

		const retryAfterHeader = res.headers.get("retry-after");
		if (retryAfterHeader) {
			const retryAfterSeconds = Number.parseInt(retryAfterHeader, 10);
			if (!Number.isNaN(retryAfterSeconds) && retryAfterSeconds > 0) {
				err.retryAfterMs = retryAfterSeconds * 1000;
			}
		}

		if (!err.retryAfterMs && typeof message === "string") {
			const match = message.match(
				/(?:try again in|wait)\s*(\d+)\s*(second|seconds|sec|s|minute|minutes|min|m)/i,
			);
			if (match) {
				const amount = Number.parseInt(match[1], 10);
				const unit = match[2].toLowerCase();
				if (!Number.isNaN(amount) && amount > 0) {
					err.retryAfterMs = unit.startsWith("m")
						? amount * 60000
						: amount * 1000;
				}
			}
		}

		throw err;
	}

	const data = await res.json();

	return data;
}

function updatePreviewButtonState() {
	const hasSpeaker = Boolean(speaker_id);
	previewVoiceBtn.disabled = !hasSpeaker || isPreviewPlaying;
	previewVoiceBtn.textContent = isPreviewPlaying
		? "Generating Preview..."
		: "Preview Voice";
}

function languageLabelForVoice(voice) {
	const nativeName = String(voice?.languageNameNative || "").trim();
	const englishName = String(voice?.languageNameEnglish || "").trim();
	const code = String(voice?.languageCode || "").trim();
	if (nativeName && englishName && nativeName !== englishName) {
		return `${englishName} (${nativeName}) [${code}]`;
	}
	if (englishName) {
		return `${englishName} [${code}]`;
	}
	return code;
}

function getAvailableLanguages() {
	const byCode = new Map();
	for (const voice of availableVoiceOptions) {
		if (!voice?.languageCode) continue;
		if (!byCode.has(voice.languageCode)) {
			byCode.set(voice.languageCode, {
				code: voice.languageCode,
				label: languageLabelForVoice(voice),
			});
		}
	}
	return [...byCode.values()].sort((a, b) =>
		a.label.localeCompare(b.label),
	);
}

function getAvailableQualities(languageCode) {
	const options = availableVoiceOptions.filter((voice) => {
		if (!languageCode) return true;
		return voice.languageCode === languageCode;
	});
	const qualities = [...new Set(options.map((voice) => voice.quality))];
	return qualities.sort((a, b) => a.localeCompare(b));
}

function getAvailableVoices(languageCode, quality) {
	return availableVoiceOptions
		.filter((voice) => {
			if (languageCode && voice.languageCode !== languageCode) {
				return false;
			}
			if (quality && voice.quality !== quality) {
				return false;
			}
			return true;
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

function populateVoiceSelect(voices, selectedSpeakerKey) {
	voiceSelect.innerHTML = "";

	if (!Array.isArray(voices) || voices.length === 0) {
		voiceSelect.innerHTML = `<option value="">No voices found</option>`;
		voiceSelect.disabled = true;
		speaker_id = undefined;
		updatePreviewButtonState();
		return;
	}

	voices.forEach((voice) => {
		const option = document.createElement("option");
		option.value = voice.key;
		option.textContent = voice.name;
		if (voice.key === selectedSpeakerKey) {
			option.selected = true;
		}
		voiceSelect.appendChild(option);
	});

	voiceSelect.disabled = false;
	speaker_id = voiceSelect.value;
	updatePreviewButtonState();
}

function populateLanguageSelect(languages, selectedLanguage) {
	languageSelect.innerHTML = "";

	if (!Array.isArray(languages) || languages.length === 0) {
		languageSelect.innerHTML = `<option value="">No languages</option>`;
		languageSelect.disabled = true;
		speaker_language = "";
		return;
	}

	languages.forEach((lang) => {
		const option = document.createElement("option");
		option.value = lang.code;
		option.textContent = lang.label;
		if (lang.code === selectedLanguage) option.selected = true;
		languageSelect.appendChild(option);
	});

	if (!languages.some((lang) => lang.code === selectedLanguage)) {
		languageSelect.value = languages[0].code;
	}

	speaker_language = languageSelect.value;
	languageSelect.disabled = false;
}

function populateQualitySelect(qualities, selectedQuality) {
	qualitySelect.innerHTML = "";

	if (!Array.isArray(qualities) || qualities.length === 0) {
		qualitySelect.innerHTML = `<option value="">No quality</option>`;
		qualitySelect.disabled = true;
		quality_id = "";
		return;
	}

	qualities.forEach((quality) => {
		const option = document.createElement("option");
		option.value = quality;
		option.textContent = quality;
		if (quality === selectedQuality) option.selected = true;
		qualitySelect.appendChild(option);
	});

	if (!qualities.includes(selectedQuality)) {
		qualitySelect.value = qualities[0];
	}

	quality_id = qualitySelect.value;
	qualitySelect.disabled = false;
}

async function fetchVoiceOptions() {
	const res = await fetch("/api/voices");
	if (!res.ok) {
		throw await buildHttpError(res, "Failed to fetch voice catalog");
	}
	const data = await res.json();
	return Array.isArray(data?.voices) ? data.voices : [];
}

async function fetchDefaultSpeakerId() {
	const res = await fetch("/api/speakerId");
	if (!res.ok) {
		throw await buildHttpError(res, "Failed to get default speaker");
	}
	const data = await res.json();
	return {
		speakerId: data?.speakerId,
		languageId: data?.languageId,
		qualityId: data?.qualityId,
	};
}

async function fetchVideoConfig() {
	const res = await fetch("/api/video-config");
	if (!res.ok) {
		throw await buildHttpError(res, "Failed to fetch video config");
	}
	const data = await res.json();
	return {
		defaultOrientation: data?.defaultOrientation || "portrait",
		defaultWidth: data?.defaultWidth || null,
		defaultHeight: data?.defaultHeight || null,
		subtitlesEnabledByDefault: data?.subtitlesEnabledByDefault !== false,
	};
}

async function fetchRuntimeSettings() {
	const res = await fetch("/api/settings");
	if (!res.ok) {
		throw await buildHttpError(res, "Failed to fetch settings");
	}
	return res.json();
}

async function fetchYoutubeImportJob(jobId) {
	const res = await fetch(
		`/api/jobs/youtube-imports/${encodeURIComponent(jobId)}`,
	);
	if (!res.ok) {
		throw await buildHttpError(res, "Failed to fetch import job");
	}
	return res.json();
}

async function fetchYoutubeImportJobs() {
	const res = await fetch("/api/jobs/youtube-imports?limit=5");
	if (!res.ok) {
		throw await buildHttpError(res, "Failed to fetch import jobs");
	}
	const data = await res.json();
	return Array.isArray(data?.jobs) ? data.jobs : [];
}

function renderYoutubeImportJobs(jobs) {
	if (!Array.isArray(jobs) || jobs.length === 0) {
		youtubeImportJobs.textContent = "No YouTube import jobs yet.";
		return;
	}

	youtubeImportJobs.innerHTML = "";
	jobs.forEach((job) => {
		const row = document.createElement("div");
		const clipsText =
			Number(job?.clipsCreated) > 0 ? ` | clips: ${job.clipsCreated}` : "";
		row.textContent = `${job?.status || "unknown"} | ${job?.message || "No details"}${clipsText}`;
		youtubeImportJobs.appendChild(row);
	});
}

function stopYoutubeImportPolling() {
	if (youtubeImportPollTimer) {
		clearInterval(youtubeImportPollTimer);
		youtubeImportPollTimer = null;
	}
}

async function refreshYoutubeImportJobs(focusJobId = "") {
	const jobs = await fetchYoutubeImportJobs();
	if (focusJobId) {
		const focusedJob = await fetchYoutubeImportJob(focusJobId);
		const remainingJobs = jobs.filter((job) => job.id !== focusJobId);
		renderYoutubeImportJobs([focusedJob, ...remainingJobs]);
		youtubeImportStatus.textContent =
			focusedJob?.message || "Import job updated.";
		if (
			focusedJob?.status === "completed" ||
			focusedJob?.status === "failed"
		) {
			activeYoutubeImportJobId = "";
			stopYoutubeImportPolling();
			await refreshVideoLibraries();
		}
		return focusedJob;
	}

	renderYoutubeImportJobs(jobs);
	return jobs[0] || null;
}

function startYoutubeImportPolling(jobId) {
	activeYoutubeImportJobId = jobId || "";
	stopYoutubeImportPolling();
	if (!activeYoutubeImportJobId) return;

	youtubeImportPollTimer = window.setInterval(async () => {
		try {
			await refreshYoutubeImportJobs(activeYoutubeImportJobId);
		} catch (_err) {
			// Keep the existing status text if polling fails temporarily.
		}
	}, 4000);
}

function populateSettingsForm(settings) {
	settingsInputVideosDir.value = settings?.input_videos_dir || "";
	settingsOutputVideosDir.value = settings?.output_videos_dir || "";
	settingsDefaultOrientation.value =
		settings?.default_video_orientation || "portrait";
	settingsDefaultWidth.value = settings?.default_video_width || "";
	settingsDefaultHeight.value = settings?.default_video_height || "";
	populateSettingsLocaleSelect(settings?.locale || "english");
	syncSettingsVoiceDefaults({
		speakerId: settings?.speaker_id || "",
		languageId: settings?.speaker_language || "",
		qualityId: settings?.tts_quality || "",
	});
	settingsDefaultPromptIdea.value = settings?.default_prompt_idea || "";
	settingsSubtitlesDefault.checked =
		settings?.subtitles_enabled_by_default !== false;
	applyDefaultPromptIdeaToInput(settings?.default_prompt_idea || "");
	applyPromptPresets(settings?.prompt_presets || []);
}

function applyDefaultPromptIdeaToInput(defaultPromptIdea) {
	const normalized = String(defaultPromptIdea || "").trim();
	defaultPromptIdeaValue = normalized;
	if (settingsDefaultPromptIdea) {
		settingsDefaultPromptIdea.value = normalized;
	}
	scriptPromptInput.placeholder = normalized || DEFAULT_TOPIC_PLACEHOLDER;
}

function setSelectToFallbackValue(selectEl, value, fallbackLabel) {
	const normalized = String(value || "").trim();
	selectEl.innerHTML = "";
	const option = document.createElement("option");
	option.value = normalized;
	option.textContent = fallbackLabel;
	selectEl.appendChild(option);
	selectEl.value = normalized;
}

function populateSettingsLocaleSelect(selectedLocale) {
	const normalized = String(selectedLocale || "english")
		.trim()
		.toLowerCase();
	settingsLocale.innerHTML = "";

	SETTINGS_LOCALES.forEach((locale) => {
		const option = document.createElement("option");
		option.value = locale;
		option.textContent = locale;
		settingsLocale.appendChild(option);
	});

	if (!SETTINGS_LOCALES.includes(normalized)) {
		const option = document.createElement("option");
		option.value = normalized || "english";
		option.textContent = normalized || "english";
		settingsLocale.appendChild(option);
	}

	settingsLocale.value = normalized || "english";
}

function populateSettingsLanguageSelect(languages, selectedLanguage) {
	settingsLanguageId.innerHTML = "";
	if (!Array.isArray(languages) || languages.length === 0) {
		setSelectToFallbackValue(
			settingsLanguageId,
			selectedLanguage,
			"No languages",
		);
		return;
	}

	languages.forEach((lang) => {
		const option = document.createElement("option");
		option.value = lang.code;
		option.textContent = lang.label;
		settingsLanguageId.appendChild(option);
	});

	if (
		selectedLanguage &&
		!languages.some((l) => l.code === selectedLanguage)
	) {
		const option = document.createElement("option");
		option.value = selectedLanguage;
		option.textContent = `${selectedLanguage} (saved)`;
		settingsLanguageId.appendChild(option);
	}

	settingsLanguageId.value =
		selectedLanguage &&
			settingsLanguageId.querySelector(
				`option[value="${CSS.escape(selectedLanguage)}"]`,
			)
			? selectedLanguage
			: languages[0].code;
}

function populateSettingsQualitySelect(qualities, selectedQuality) {
	settingsQualityId.innerHTML = "";
	if (!Array.isArray(qualities) || qualities.length === 0) {
		setSelectToFallbackValue(
			settingsQualityId,
			selectedQuality,
			"No quality",
		);
		return;
	}

	qualities.forEach((quality) => {
		const option = document.createElement("option");
		option.value = quality;
		option.textContent = quality;
		settingsQualityId.appendChild(option);
	});

	if (selectedQuality && !qualities.includes(selectedQuality)) {
		const option = document.createElement("option");
		option.value = selectedQuality;
		option.textContent = `${selectedQuality} (saved)`;
		settingsQualityId.appendChild(option);
	}

	settingsQualityId.value =
		selectedQuality &&
			settingsQualityId.querySelector(
				`option[value="${CSS.escape(selectedQuality)}"]`,
			)
			? selectedQuality
			: qualities[0];
}

function populateSettingsVoiceSelect(voices, selectedSpeakerKey) {
	settingsSpeakerId.innerHTML = "";
	if (!Array.isArray(voices) || voices.length === 0) {
		setSelectToFallbackValue(
			settingsSpeakerId,
			selectedSpeakerKey,
			"No voices found",
		);
		return;
	}

	voices.forEach((voice) => {
		const option = document.createElement("option");
		option.value = voice.key;
		option.textContent = `${voice.name} (${voice.key})`;
		settingsSpeakerId.appendChild(option);
	});

	if (
		selectedSpeakerKey &&
		!voices.some((voice) => voice.key === selectedSpeakerKey)
	) {
		const option = document.createElement("option");
		option.value = selectedSpeakerKey;
		option.textContent = `${selectedSpeakerKey} (saved)`;
		settingsSpeakerId.appendChild(option);
	}

	settingsSpeakerId.value =
		selectedSpeakerKey &&
			settingsSpeakerId.querySelector(
				`option[value="${CSS.escape(selectedSpeakerKey)}"]`,
			)
			? selectedSpeakerKey
			: voices[0].key;
}

function syncSettingsVoiceDefaults({
	speakerId,
	languageId,
	qualityId,
} = {}) {
	if (
		!Array.isArray(availableVoiceOptions) ||
		availableVoiceOptions.length === 0
	) {
		setSelectToFallbackValue(
			settingsLanguageId,
			languageId,
			"No languages",
		);
		setSelectToFallbackValue(settingsQualityId, qualityId, "No quality");
		setSelectToFallbackValue(
			settingsSpeakerId,
			speakerId,
			"No voices found",
		);
		return;
	}

	const languages = getAvailableLanguages();
	const selectedLanguage =
		languageId || settingsLanguageId.value || speaker_language;
	populateSettingsLanguageSelect(languages, selectedLanguage);

	const activeLanguage = settingsLanguageId.value || "";
	const qualities = getAvailableQualities(activeLanguage);
	const selectedQuality =
		qualityId || settingsQualityId.value || quality_id;
	populateSettingsQualitySelect(qualities, selectedQuality);

	const activeQuality = settingsQualityId.value || "";
	const voices = getAvailableVoices(activeLanguage, activeQuality);
	populateSettingsVoiceSelect(
		voices,
		speakerId || settingsSpeakerId.value || speaker_id,
	);
}

function applyCurrentVoiceSelectionToSettings() {
	syncSettingsVoiceDefaults({
		speakerId: speaker_id || "",
		languageId: speaker_language || "",
		qualityId: quality_id || "",
	});
	showToast("Copied current voice selection into defaults");
}

function collectSettingsPayload() {
	return {
		input_videos_dir: settingsInputVideosDir.value.trim(),
		output_videos_dir: settingsOutputVideosDir.value.trim(),
		default_video_orientation:
			settingsDefaultOrientation.value || "portrait",
		default_video_width: Number.parseInt(settingsDefaultWidth.value, 10),
		default_video_height: Number.parseInt(
			settingsDefaultHeight.value,
			10,
		),
		speaker_id: settingsSpeakerId.value.trim(),
		speaker_language: settingsLanguageId.value.trim(),
		tts_quality: settingsQualityId.value.trim(),
		locale: settingsLocale.value || "english",
		default_prompt_idea: settingsDefaultPromptIdea.value.trim(),
		subtitles_enabled_by_default: Boolean(
			settingsSubtitlesDefault.checked,
		),
	};
}

async function loadSettingsIntoModal() {
	try {
		if (!availableVoiceOptions.length) {
			const voices = await fetchVoiceOptions();
			availableVoiceOptions = voices.filter(
				(v) => v?.key && v?.name && v?.languageCode && v?.quality,
			);
		}
		const settings = await fetchRuntimeSettings();
		populateSettingsForm(settings);
		const latestJob = await refreshYoutubeImportJobs();
		if (
			latestJob &&
			(latestJob.status === "pending" || latestJob.status === "running")
		) {
			startYoutubeImportPolling(latestJob.id);
		} else {
			stopYoutubeImportPolling();
		}
	} catch (err) {
		showToast(err?.message || "Failed to load settings");
	}
}

async function initPromptIdeaDefault() {
	try {
		const settings = await fetchRuntimeSettings();
		applyDefaultPromptIdeaToInput(settings?.default_prompt_idea || "");
		applyPromptPresets(settings?.prompt_presets || []);
	} catch (_err) {
		applyDefaultPromptIdeaToInput("");
		applyPromptPresets([]);
	}
}

async function saveSettingsFromModal() {
	const payload = collectSettingsPayload();

	if (!payload.input_videos_dir || !payload.output_videos_dir) {
		showToast("Input and output folders are required");
		return;
	}

	if (
		!Number.isFinite(payload.default_video_width) ||
		payload.default_video_width <= 0 ||
		!Number.isFinite(payload.default_video_height) ||
		payload.default_video_height <= 0
	) {
		showToast("Default width and height must be positive numbers");
		return;
	}

	saveSettingsBtn.disabled = true;
	saveSettingsBtn.textContent = "Saving...";
	try {
		const res = await fetch("/api/settings", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
		if (!res.ok) {
			throw await buildHttpError(res, "Failed to save settings");
		}

		const data = await res.json();
		const settings = data?.settings || payload;
		await initOrientationPicker();
		await initVoicePicker();
		applyDefaultPromptIdeaToInput(settings.default_prompt_idea || "");
		applyPromptPresets(settings.prompt_presets || promptPresets);
		await refreshVideoLibraries();
		showToast("Settings saved");

		const modal = bootstrap.Modal.getInstance(settingsModalEl);
		if (modal) modal.hide();
	} catch (err) {
		showToast(err?.message || "Failed to save settings");
	} finally {
		saveSettingsBtn.disabled = false;
		saveSettingsBtn.textContent = "Save Settings";
	}
}

async function initVoicePicker() {
	try {
		const [voices, defaults] = await Promise.all([
			fetchVoiceOptions(),
			fetchDefaultSpeakerId(),
		]);
		availableVoiceOptions = voices.filter(
			(v) => v?.key && v?.name && v?.languageCode && v?.quality,
		);

		const languages = getAvailableLanguages();
		if (languages.length === 0) {
			throw new Error("No Piper voices available");
		}

		const defaultLanguage =
			defaults?.languageId &&
				languages.some(
					(lang) =>
						lang.code === defaults.languageId ||
						lang.code.startsWith(`${defaults.languageId}_`),
				)
				? languages.find(
					(lang) =>
						lang.code === defaults.languageId ||
						lang.code.startsWith(`${defaults.languageId}_`),
				)?.code || languages[0].code
				: languages[0].code;
		populateLanguageSelect(languages, defaultLanguage);

		const qualities = getAvailableQualities(speaker_language);
		const defaultQuality =
			defaults?.qualityId && qualities.includes(defaults.qualityId)
				? defaults.qualityId
				: qualities[0] || "";
		populateQualitySelect(qualities, defaultQuality);

		const voicesForSelection = getAvailableVoices(
			speaker_language,
			quality_id,
		);
		let selected = defaults?.speakerId;
		if (!voicesForSelection.some((voice) => voice.key === selected)) {
			selected = voicesForSelection[0]?.key;
		}
		populateVoiceSelect(voicesForSelection, selected);
	} catch (err) {
		languageSelect.innerHTML = `<option value="">Languages unavailable</option>`;
		languageSelect.disabled = true;
		qualitySelect.innerHTML = `<option value="">Quality unavailable</option>`;
		qualitySelect.disabled = true;
		speaker_language = "";
		quality_id = "";
		voiceSelect.innerHTML = `<option value="">Voice loading failed</option>`;
		voiceSelect.disabled = true;
		speaker_id = undefined;
		updatePreviewButtonState();
		showToast(err?.message || "Failed to load voices");
	}
}

async function initOrientationPicker() {
	try {
		const config = await fetchVideoConfig();
		if (
			["portrait", "landscape", "square", "original", "custom"].includes(
				config.defaultOrientation,
			)
		) {
			orientationSelect.value = config.defaultOrientation;
		}
		if (config.defaultWidth) {
			customWidthInput.value = String(config.defaultWidth);
		}
		if (config.defaultHeight) {
			customHeightInput.value = String(config.defaultHeight);
		}
		if (includeSubtitlesInput) {
			includeSubtitlesInput.checked =
				config.subtitlesEnabledByDefault !== false;
		}
	} catch (_err) {
		orientationSelect.value = "portrait";
	}

	updateOrientationInputsVisibility();
}

async function previewSelectedVoice() {
	if (!speaker_id || isPreviewPlaying) return;
	isPreviewPlaying = true;
	updatePreviewButtonState();

	try {
		const res = await fetch("/api/tts", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				text: getPreviewText(speaker_language),
				speaker_id,
				speaker_language,
				quality_id,
			}),
		});

		if (!res.ok) {
			throw await buildHttpError(res, "Failed to generate voice preview");
		}

		const blob = await res.blob();
		if (previewAudioUrl) {
			URL.revokeObjectURL(previewAudioUrl);
		}
		previewAudioUrl = URL.createObjectURL(blob);
		previewAudio.src = previewAudioUrl;
		await previewAudio.play();
	} catch (err) {
		showToast(err?.message || "Voice preview failed");
	} finally {
		isPreviewPlaying = false;
		updatePreviewButtonState();
	}
}

voiceSelect.addEventListener("change", () => {
	speaker_id = voiceSelect.value || undefined;
	updatePreviewButtonState();
});

languageSelect.addEventListener("change", () => {
	speaker_language = languageSelect.value || "";
	const qualities = getAvailableQualities(speaker_language);
	populateQualitySelect(qualities, quality_id);
	const voices = getAvailableVoices(speaker_language, quality_id);
	populateVoiceSelect(voices, speaker_id);
});

qualitySelect.addEventListener("change", () => {
	quality_id = qualitySelect.value || "";
	const voices = getAvailableVoices(speaker_language, quality_id);
	populateVoiceSelect(voices, speaker_id);
});

settingsLanguageId.addEventListener("change", () => {
	syncSettingsVoiceDefaults({
		languageId: settingsLanguageId.value || "",
		qualityId: settingsQualityId.value || "",
		speakerId: settingsSpeakerId.value || "",
	});
});

settingsQualityId.addEventListener("change", () => {
	syncSettingsVoiceDefaults({
		languageId: settingsLanguageId.value || "",
		qualityId: settingsQualityId.value || "",
		speakerId: settingsSpeakerId.value || "",
	});
});

function populateTrendSelect(select, entries, { keepFirstOption = true } = {}) {
	if (!select) return;
	const firstOption = keepFirstOption ? select.querySelector("option")?.cloneNode(true) : null;
	select.innerHTML = "";
	if (firstOption) {
		select.appendChild(firstOption);
	}
	Object.entries(entries).forEach(([value, label]) => {
		const option = document.createElement("option");
		option.value = value;
		option.textContent = label;
		select.appendChild(option);
	});
}

function initTrendsWorkflowControls() {
	populateTrendSelect(trendGeoSelect, TREND_COUNTRIES);
	populateTrendSelect(trendCategorySelect, TREND_CATEGORIES);

	const storedFields = {
		trendGeo: trendGeoSelect,
		trendHours: trendHoursSelect,
		trendStatus: trendStatusSelect,
		trendSort: trendSortSelect,
		trendCategory: trendCategorySelect,
		trendMaxVideos: trendMaxVideosInput,
	};

	Object.entries(storedFields).forEach(([key, input]) => {
		if (!input) return;
		const storedValue = localStorage.getItem(key);
		if (storedValue !== null && storedValue !== "") {
			input.value = storedValue;
		}
		input.addEventListener("change", () => {
			localStorage.setItem(key, input.value || "");
		});
	});
}

previewVoiceBtn.addEventListener("click", previewSelectedVoice);
orientationSelect.addEventListener(
	"change",
	updateOrientationInputsVisibility,
);
scriptSourceSelect.addEventListener("change", updateScriptSourceInputs);
promptPresetSelect.addEventListener("change", syncPromptPresetName);
loadPromptPresetBtn.addEventListener(
	"click",
	loadSelectedPromptPresetIntoInput,
);
savePromptPresetBtn.addEventListener("click", saveCurrentPromptPreset);
deletePromptPresetBtn.addEventListener("click", deleteCurrentPromptPreset);
openSettingsBtn.addEventListener("click", loadSettingsIntoModal);
saveSettingsBtn.addEventListener("click", saveSettingsFromModal);
settingsUseCurrentVoiceBtn.addEventListener(
	"click",
	applyCurrentVoiceSelectionToSettings,
);
uploadVideosBtn.addEventListener("click", uploadBackgroundVideos);
youtubeImportBtn.addEventListener("click", startYoutubeImport);
settingsModalEl.addEventListener(
	"hidden.bs.modal",
	stopYoutubeImportPolling,
);

document.querySelectorAll(".copy-tag-btn").forEach((btn) => {
	btn.addEventListener("click", () => {
		copyToClipboard(btn.dataset.tags || "");
	});
});

async function generateTTS(text) {
	if (!speaker_id) {
		await initVoicePicker();
		if (!speaker_id) {
			throw new Error("No speaker selected");
		}
	}
	const res = await fetch("/api/tts", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ text, speaker_id, speaker_language, quality_id }),
	});
	if (!res.ok) {
		throw await buildHttpError(res, "Failed to generate TTS audio");
	}
	const blob = await res.blob();
	const base64 = await blobToBase64(blob);
	return { base64 };
}

async function alignSubtitles(text, audioBase64) {
	const res = await fetch("/api/align", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ text, audio: audioBase64 }),
	});
	if (!res.ok) {
		throw await buildHttpError(res, "Failed to align subtitles");
	}
	const result = await res.json();
	if (!result?.srt || typeof result.srt !== "string") {
		throw new Error("Invalid subtitle alignment response");
	}
	return result.srt;
}

async function burnVideo(audioBase64, srt, orientation, width, height) {
	const res = await fetch("/api/burn", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			audio: audioBase64,
			subtitles: srt,
			orientation,
			width,
			height,
		}),
	});
	if (!res.ok) {
		throw await buildHttpError(res, "Failed to render video");
	}

	const contentType = res.headers.get("content-type") || "";
	if (!contentType.startsWith("video/")) {
		throw new Error("Renderer did not return a video file");
	}

	const blob = await res.blob();
	if (!blob || blob.size === 0) {
		throw new Error("Renderer returned an empty video file");
	}
	return { url: URL.createObjectURL(blob) };
}

function blobToBase64(blob) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(reader.result.split(",")[1]);
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}

function escapeHtml(value) {
	return String(value || "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

async function fetchUploadedVideos() {
	try {
		const res = await fetch("/api/videos/list");
		if (!res.ok) {
			console.error("Failed to fetch uploaded videos");
			return [];
		}
		const data = await res.json();
		return Array.isArray(data?.videos) ? data.videos : [];
	} catch (err) {
		console.error("Error fetching uploaded videos:", err);
		return [];
	}
}

async function fetchGeneratedVideos() {
	try {
		const res = await fetch("/api/videos/generated/list");
		if (!res.ok) {
			console.error("Failed to fetch generated videos");
			return [];
		}
		const data = await res.json();
		return Array.isArray(data?.videos) ? data.videos : [];
	} catch (err) {
		console.error("Error fetching generated videos:", err);
		return [];
	}
}

function renderVideoCards(videos, options = {}) {
	const {
		allowRename = false,
		allowDelete = false,
		previewFallbackBase = "/api/videos/file/",
	} = options;

	return videos
		.map((video) => {
			const encodedFilename = encodeURIComponent(video.filename || "");
			const safeFilename = escapeHtml(video.filename || "");
			const sizeInMB = (video.size / 1024 / 1024).toFixed(2);
			const createdDate = new Date(video.createdAt).toLocaleDateString();
			const previewUrl =
				typeof video.previewUrl === "string" && video.previewUrl
					? video.previewUrl
					: `${previewFallbackBase}${encodedFilename}`;

			const actions = [];
			if (allowRename) {
				actions.push(
					`<button class="btn btn-sm btn-outline-dark rename-video-btn" data-filename="${encodedFilename}">Rename</button>`,
				);
			}
			if (allowDelete) {
				actions.push(
					`<button class="btn btn-sm btn-danger delete-video-btn" data-filename="${encodedFilename}">Delete</button>`,
				);
			}
			actions.push(
				`<a class="btn btn-sm btn-primary download-video-btn" href="${previewUrl}" download="${safeFilename}">Download</a>`,
			);

			return `
							<article class="preview-card">
								<div class="preview-frame">
									<video class="preview-video" src="${previewUrl}" preload="metadata" controls muted playsinline></video>
								</div>
								<div class="preview-meta">${safeFilename}</div>
								<div style="font-size: 0.8rem; color: #5c6b70; margin-top: 0.35rem;">
									${sizeInMB}MB • ${createdDate}
								</div>
								${actions.length > 0 ? `<div class="video-actions">${actions.join("")}</div>` : ""}
							</article>
						`;
		})
		.join("");
}

async function refreshUploadedVideosList() {
	const videos = await fetchUploadedVideos();

	if (videos.length === 0) {
		uploadedVideosGrid.innerHTML = `
						<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #5c6b70;">
							<p style="margin: 0; font-size: 0.92rem;">No uploaded videos yet. Upload videos in Settings.</p>
						</div>
					`;
		return;
	}

	uploadedVideosGrid.innerHTML = renderVideoCards(videos, {
		allowRename: true,
		allowDelete: true,
		previewFallbackBase: "/api/videos/file/",
	});

	uploadedVideosGrid.querySelectorAll(".delete-video-btn").forEach((btn) => {
		btn.addEventListener("click", () => {
			deleteUploadedVideo(decodeURIComponent(btn.dataset.filename || ""));
		});
	});

	uploadedVideosGrid.querySelectorAll(".rename-video-btn").forEach((btn) => {
		btn.addEventListener("click", () => {
			renameUploadedVideo(decodeURIComponent(btn.dataset.filename || ""));
		});
	});
}

async function refreshGeneratedVideosList() {
	const videos = await fetchGeneratedVideos();

	if (videos.length === 0) {
		generatedVideosGrid.innerHTML = `
						<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #5c6b70;">
							<p style="margin: 0; font-size: 0.92rem;">No generated videos yet. Render one from a job above.</p>
						</div>
					`;
		return;
	}

	generatedVideosGrid.innerHTML = renderVideoCards(videos, {
		allowRename: true,
		allowDelete: true,
		previewFallbackBase: "/api/videos/generated/file/",
	});

	generatedVideosGrid.querySelectorAll(".delete-video-btn").forEach((btn) => {
		btn.addEventListener("click", () => {
			deleteGeneratedVideo(
				decodeURIComponent(btn.dataset.filename || ""),
			);
		});
	});

	generatedVideosGrid.querySelectorAll(".rename-video-btn").forEach((btn) => {
		btn.addEventListener("click", () => {
			renameGeneratedVideo(
				decodeURIComponent(btn.dataset.filename || ""),
			);
		});
	});
}

async function refreshVideoLibraries() {
	await Promise.all([
		refreshUploadedVideosList(),
		refreshGeneratedVideosList(),
	]);
}

async function renameUploadedVideo(filename) {
	if (!filename) return;

	const suggested = filename.replace(/\.[^.]+$/, "");

	const userInput = await showInputModal("Rename uploaded video to:", {
		title: "Rename video",
		defaultValue: suggested,
		placeholder: "New filename",
		helpText: "You can omit the file extension.",
		confirmText: "Rename",
		cancelText: "Cancel",
		confirmClass: "btn btn-primary",
	});

	if (userInput === null) return;

	const newName = userInput.trim();

	if (!newName) {
		showToast("Filename cannot be empty");
		return;
	}

	try {
		const res = await fetch(
			`/api/videos/${encodeURIComponent(filename)}/rename`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ newFilename: newName }),
			},
		);

		if (!res.ok) {
			throw await buildHttpError(res, "Failed to rename video");
		}

		const data = await res.json();
		showToast(`Renamed to ${data?.newFilename || newName}`);
		await refreshUploadedVideosList();
	} catch (err) {
		showToast(err?.message || "Failed to rename video");
	}
}

async function deleteUploadedVideo(filename) {
	const confirmed = await showConfirmModal(
		`Delete uploaded video "${filename}"?`,
		{
			confirmText: "Delete video",
			cancelText: "Keep video",
			confirmClass: "btn btn-danger",
		},
	);
	if (!confirmed) return;

	try {
		const res = await fetch(
			`/api/videos/${encodeURIComponent(filename)}`,
			{
				method: "DELETE",
			},
		);
		if (!res.ok) {
			throw await buildHttpError(res, "Failed to delete video");
		}

		showToast(`Deleted ${filename}`);
		await refreshUploadedVideosList();
	} catch (err) {
		showToast(err?.message || "Failed to delete video");
	}
}

async function renameGeneratedVideo(filename) {
	if (!filename) return;

	const suggested = filename.replace(/\.[^.]+$/, "");

	const userInput = await showInputModal("Rename generated video to:", {
		title: "Rename video",
		defaultValue: suggested,
		placeholder: "New filename",
		helpText: "You can omit the file extension.",
		confirmText: "Rename",
		cancelText: "Cancel",
		confirmClass: "btn btn-primary",
	});

	if (userInput === null) return;

	const newName = userInput.trim();

	if (!newName) {
		showToast("Filename cannot be empty");
		return;
	}

	try {
		const res = await fetch(
			`/api/videos/generated/${encodeURIComponent(filename)}/rename`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ newFilename: newName }),
			},
		);

		if (!res.ok) {
			throw await buildHttpError(res, "Failed to rename generated video");
		}

		const data = await res.json();
		showToast(`Renamed to ${data?.newFilename || newName}`);
		await refreshGeneratedVideosList();
	} catch (err) {
		showToast(err?.message || "Failed to rename generated video");
	}
}

async function deleteGeneratedVideo(filename) {
	const confirmed = await showConfirmModal(
		`Delete generated video "${filename}"?`,
		{
			confirmText: "Delete video",
			cancelText: "Keep video",
			confirmClass: "btn btn-danger",
		},
	);
	if (!confirmed) return;

	try {
		const res = await fetch(
			`/api/videos/generated/${encodeURIComponent(filename)}`,
			{
				method: "DELETE",
			},
		);
		if (!res.ok) {
			throw await buildHttpError(res, "Failed to delete generated video");
		}

		showToast(`Deleted ${filename}`);
		await refreshGeneratedVideosList();
	} catch (err) {
		showToast(err?.message || "Failed to delete generated video");
	}
}

async function uploadBackgroundVideos() {
	const files = Array.from(uploadVideosInput.files || []);
	if (files.length === 0) {
		showToast("Choose at least one video file to upload");
		return;
	}

	uploadVideosBtn.disabled = true;
	uploadVideosBtn.textContent = "Uploading...";
	uploadVideosStatus.textContent = `Uploading ${files.length} file(s)...`;

	try {
		const formData = new FormData();
		files.forEach((file) => formData.append("videos", file));

		const res = await fetch("/api/videos/upload", {
			method: "POST",
			body: formData,
		});
		if (!res.ok) {
			throw await buildHttpError(res, "Failed to upload videos");
		}

		const data = await res.json();
		const uploadedCount = Array.isArray(data?.jobs)
			? data.jobs.length
			: files.length;
		const failedCount = Array.isArray(data?.jobs)
			? data.jobs.filter((j) => j.status === "corrupted").length
			: 0;

		let statusMessage = `Uploaded ${uploadedCount} file(s) to ${data?.upload_dir || settingsInputVideosDir.value || "/mnt/videos"}.`;
		if (failedCount > 0) {
			statusMessage += ` ${failedCount} file(s) failed verification.`;
		}

		uploadVideosStatus.textContent = statusMessage;
		uploadVideosInput.value = "";
		updateUploadVideosSelectionLabel();
		showToast(
			`Uploaded ${uploadedCount} background video(s)` +
			(failedCount > 0 ? ` (${failedCount} failed)` : ""),
		);

		// Refresh both library tabs
		await refreshVideoLibraries();

		// Log job details if needed
		if (Array.isArray(data?.jobs)) {
			console.log("Upload jobs:", data.jobs);
		}
	} catch (err) {
		uploadVideosStatus.textContent =
			err?.message || "Upload failed. Try again.";
		showToast(err?.message || "Failed to upload videos");
	} finally {
		uploadVideosBtn.disabled = false;
		uploadVideosBtn.textContent = "Upload Videos";
	}
}

async function startYoutubeImport() {
	const url = youtubeImportUrlInput.value.trim();
	if (!url) {
		showToast("Paste a YouTube link first");
		return;
	}

	youtubeImportBtn.disabled = true;
	youtubeImportBtn.textContent = "Starting...";
	youtubeImportStatus.textContent =
		"Starting backend YouTube import job...";

	try {
		const res = await fetch("/api/videos/import-youtube", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url }),
		});
		if (!res.ok) {
			throw await buildHttpError(res, "Failed to start YouTube import");
		}

		const data = await res.json();
		activeYoutubeImportJobId = data?.jobId || "";
		youtubeImportUrlInput.value = "";
		youtubeImportStatus.textContent =
			"Import started in the backend. You can close the modal or leave the page.";
		showToast("YouTube import started");
		await refreshYoutubeImportJobs(activeYoutubeImportJobId);
		startYoutubeImportPolling(activeYoutubeImportJobId);
	} catch (err) {
		youtubeImportStatus.textContent =
			err?.message || "Failed to start YouTube import.";
		showToast(err?.message || "Failed to start YouTube import");
	} finally {
		youtubeImportBtn.disabled = false;
		youtubeImportBtn.textContent = "Download + Split Into 56s Clips";
	}
}

function formatSelectedUploadFiles(files) {
	const selectedFiles = Array.from(files || []);

	if (!selectedFiles.length) {
		return "No files selected";
	}

	if (selectedFiles.length === 1) {
		return selectedFiles[0].name;
	}

	return `${selectedFiles.length} files selected`;
}

function updateUploadVideosSelectionLabel() {
	uploadVideosFileLabel.textContent = formatSelectedUploadFiles(uploadVideosInput.files);
	uploadVideosBtn.disabled = !uploadVideosInput.files?.length;
}

generateScriptBtn?.addEventListener("click", startPromptWorkflow);
chooseUploadVideosBtn?.addEventListener("click", () => {
	uploadVideosInput.click();
});
uploadVideosInput?.addEventListener("change", updateUploadVideosSelectionLabel);
initTrendsWorkflowControls();
initVoicePicker();
initOrientationPicker();
initPromptIdeaDefault();
updateScriptSourceInputs();
refreshVideoLibraries();