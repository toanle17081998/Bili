export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		const { startNarrationSourceSweep } = await import("@/localization/source");
		const { LocalizationWasmError } = await import("@/localization/timing");
		try {
			await startNarrationSourceSweep();
		} catch (error) {
			if (!(error instanceof LocalizationWasmError)) throw error;
			console.error("Narration source cleanup could not start:", error.message);
		}
	}
}
