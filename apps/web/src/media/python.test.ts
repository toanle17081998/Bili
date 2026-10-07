import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { pythonBinary, runPython } from "./python";

async function withPythonEnv({
	value,
	run,
}: {
	value?: string;
	run: () => void | Promise<void>;
}) {
	const previous = process.env.PYTHON_BIN;
	if (value === undefined) delete process.env.PYTHON_BIN;
	else process.env.PYTHON_BIN = value;
	try {
		await run();
	} finally {
		if (previous === undefined) delete process.env.PYTHON_BIN;
		else process.env.PYTHON_BIN = previous;
	}
}

async function withWorkspace({
	localPython = false,
	run,
}: {
	localPython?: boolean;
	run: (local: string) => void | Promise<void>;
}) {
	const prefix = path.join(os.tmpdir(), "opencut-python-test-");
	const directory = await fs.mkdtemp(prefix);
	const previous = process.cwd();
	const app = path.join(directory, "apps", "web");
	const local = path.join(
		directory,
		".local_tools",
		"audio",
		process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
	);
	try {
		await fs.mkdir(app, { recursive: true });
		if (localPython) {
			await fs.mkdir(path.dirname(local), { recursive: true });
			await fs.writeFile(local, "");
		}
		process.chdir(app);
		await run(local);
	} finally {
		process.chdir(previous);
		assert.ok(path.resolve(directory).startsWith(prefix));
		await fs.rm(directory, { recursive: true, force: true });
	}
}

test("Python defaults to PATH when no local environment is installed", async () => {
	await withPythonEnv({
		run: () => withWorkspace({
			run: () => {
				const expected = process.platform === "win32" ? "python" : "python3";
				assert.equal(pythonBinary(), expected);
				assert.equal(pythonBinary(true), expected);
			},
		}),
	});
});

test("transcription, TTS and separation use the installed local environment", async () => {
	await withPythonEnv({
		run: () => withWorkspace({
			localPython: true,
			run: (local) => {
				assert.equal(pythonBinary(), local);
				assert.equal(pythonBinary(true), local);
			},
		}),
	});
});

test("explicit transcription runtime does not override local separation runtime", async () => {
	await withPythonEnv({
		value: "C:/custom tools/python.exe",
		run: () => withWorkspace({
			localPython: true,
			run: (local) => {
				assert.equal(pythonBinary(), "C:/custom tools/python.exe");
				assert.equal(pythonBinary(true), local);
			},
		}),
	});
});

test("Python supports an explicitly configured executable", async () => {
	await withPythonEnv({
		value: "C:/custom tools/python.exe",
		run: () => {
			assert.equal(pythonBinary(), "C:/custom tools/python.exe");
		},
	});
});

test("a missing Python executable returns an actionable configuration error", async () => {
	await withPythonEnv({
		value: path.join(os.tmpdir(), `opencut-missing-python-${randomUUID()}`),
		run: async () => {
			await assert.rejects(runPython("print('ok')", [], 5000), /PYTHON_BIN/);
		},
	});
});
