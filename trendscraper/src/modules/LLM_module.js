const BASE_SYSTEM_PROMPT = `You are a professional short-form content strategist and scriptwriter.

You will receive a USER_PROMPT describing what kind of video to create.

Create exactly one JSON object with these fields:
- "title": catchy title under 100 characters. Hashtags are allowed.
- "description": short engaging description with relevant hashtags.
- "body": voiceover script for a faceless short video (250-300 words), fast paced, natural narration, no placeholders.

Rules:
- Make the script strong for retention: hook early, keep momentum, finish with a call to action.
- Do not use first-person visual framing like "I am on screen".
- Do not include hashtags in "body"; hashtags belong only in title/description.
- Return only valid JSON. No markdown fences. No extra text.`;
let SYSTEM_PROMPT = BASE_SYSTEM_PROMPT;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GEMINI_MODEL =
	process.env.GEMINI_MODEL || "gemini-2.5-flash";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL =
	process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

function extractJsonCandidate(text) {
	return String(text || "")
		.replace(/^```json\s*/i, "")
		.replace(/^```\s*/i, "")
		.replace(/```$/i, "")
		.trim();
}

function parseGeneratedJsonResponse(rawText) {
	const cleaned = extractJsonCandidate(rawText);

	if (!cleaned) {
		throw new Error("Model response was empty");
	}

	try {
		return JSON.parse(cleaned);
	} catch {
		// Continue with fallbacks for chatty model responses.
	}

	const fencedJsonBlockMatch = cleaned.match(/```json\s*([\s\S]*?)```/i);
	if (fencedJsonBlockMatch?.[1]) {
		try {
			return JSON.parse(fencedJsonBlockMatch[1].trim());
		} catch {
			// Continue to next fallback.
		}
	}

	const firstBrace = cleaned.indexOf("{");
	const lastBrace = cleaned.lastIndexOf("}");

	if (firstBrace >= 0 && lastBrace > firstBrace) {
		const jsonSlice = cleaned.slice(firstBrace, lastBrace + 1);

		try {
			return JSON.parse(jsonSlice);
		} catch {
			// Continue to final failure below.
		}
	}

	throw new Error("Model response did not contain valid JSON");
}

function normalizeOpenRouterMessageContent(content) {
	if (typeof content === "string") {
		return content;
	}

	if (Array.isArray(content)) {
		return content
			.map((part) => {
				if (typeof part === "string") return part;
				if (part && typeof part.text === "string") return part.text;
				return "";
			})
			.join("\n")
			.trim();
	}

	return "";
}

async function callGemini(parts) {
	if (!GEMINI_API_KEY) {
		throw new Error("GEMINI_API_KEY is not configured");
	}

	const response = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				contents: [{ parts }],
			}),
		},
	);

	const geminiRes = await response.json();

	if (!response.ok) {
		const message = geminiRes?.error?.message || "Gemini API request failed";
		throw new Error(message);
	}

	const data = geminiRes?.candidates?.[0]?.content?.parts?.[0]?.text;

	if (!data) {
		throw new Error("Gemini response did not include generated content");
	}

	return data;
}

async function callOpenRouter(parts) {
	if (!OPENROUTER_API_KEY) {
		throw new Error("OPENROUTER_API_KEY is not configured");
	}

	const messages = parts.map((part, index) => ({
		role: index === 0 ? "system" : "user",
		content: part.text,
	}));

	const response = await fetch(
		"https://openrouter.ai/api/v1/chat/completions",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${OPENROUTER_API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: OPENROUTER_MODEL,
				messages,
				response_format: {
					type: "json_object",
				},
			}),
		},
	);

	const openRouterRes = await response.json();

	if (!response.ok) {
		const message =
			openRouterRes?.error?.message || "OpenRouter API request failed";
		throw new Error(message);
	}

	const data = normalizeOpenRouterMessageContent(
		openRouterRes?.choices?.[0]?.message?.content,
	);

	if (!data) {
		throw new Error("OpenRouter response did not include generated content");
	}

	return data;
}

async function generateTextWithFallback(parts) {
	try {
		return await callGemini(parts);
	} catch (geminiErr) {
		console.warn(
			"Gemini request failed. Falling back to OpenRouter:",
			String(geminiErr),
		);

		return callOpenRouter(parts);
	}
}

async function generateVideoScript(userPrompt) {
	const data = await generateTextWithFallback([
		{ text: SYSTEM_PROMPT },
		{ text: `USER_PROMPT:\n${userPrompt}` },
	]);

	return parseGeneratedJsonResponse(data);
}

async function translatePrompt(locale) {
	if (!locale || locale === "english") {
		return;
	}

	SYSTEM_PROMPT = await generateTextWithFallback([
		{
			text: `System: You are a professional translator. Please translate the following prompt from english to ${locale}. Ensure the translation is accurate and meaning is preserved. JSON contents MUST be translated in ${locale} too, that's mandatory. Omit the system prompt from the translation and translate only user content, ensure full prompt is translated, do not miss any part, and DO NOT add any additional part not in the prompt.

User:`,
		},
		{ text: BASE_SYSTEM_PROMPT },
	]);
}

export {
	generateVideoScript,
	translatePrompt,
};