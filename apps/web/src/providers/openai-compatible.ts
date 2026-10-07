export function getOpenAILLMApiKey(): string {
	return process.env.OPENAI_LLM_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || "";
}

export function getOpenAILLMBaseUrl(): string {
	return (
		process.env.OPENAI_LLM_BASE_URL ||
		process.env.OPENAI_BASE_URL ||
		"https://api.openai.com/v1"
	).replace(/\/$/, "");
}

export function getOpenAILLMModel(): string {
	return process.env.OPENAI_LLM_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
}

export function hasOpenAILLMConfig(): boolean {
	return Boolean(getOpenAILLMApiKey());
}
