import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { FFmpegService } from "./ffmpeg";

export function pythonBinary(separation = false): string {
	if (!separation && process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
	const local = path.resolve(process.cwd(), "../../.local_tools/audio", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
	if (existsSync(local)) return local;
	return process.env.PYTHON_BIN || (process.platform === "win32"
		? "python"
		: "python3");
}

export function runPython(code: string, args: string[], timeoutMs: number, separation = false): Promise<string> {
	return new Promise((resolve, reject) => {
		const env: NodeJS.ProcessEnv = { ...process.env, PYTHONIOENCODING: "utf-8" };
		const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "PATH";
		env[pathKey] = `${path.dirname(FFmpegService.getBinaryPath("ffmpeg"))}${path.delimiter}${env[pathKey] || ""}`;
		const child = spawn(pythonBinary(separation), ["-c", code, ...args], { windowsHide: true, env });
		let stdout = "";
		let stderr = "";
		const timer = setTimeout(() => {
			child.kill();
			reject(new Error("Xử lý âm thanh quá thời gian cho phép. Vui lòng thử lại."));
		}, timeoutMs);
		child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
		child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-4000); });
		child.on("error", (error: NodeJS.ErrnoException) => {
			clearTimeout(timer);
			reject(error.code === "ENOENT"
				? new Error("Python was not found. Install Python on PATH or set PYTHON_BIN in apps/web/.env.local.", { cause: error })
				: error);
		});
		child.on("close", (status) => {
			clearTimeout(timer);
			if (status === 0) resolve(stdout);
			else reject(new Error(`Xử lý âm thanh thất bại: ${stderr}`));
		});
	});
}
