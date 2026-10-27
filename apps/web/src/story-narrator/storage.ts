import path from "node:path";
import { readAtomicJSON, writeAtomicJSON } from "./atomic-json";
import type { StoryJob, StoryProject } from "./types";

export function storyDirectory(projectId: string) {
	if (!/^[a-zA-Z0-9_-]{1,128}$/.test(projectId))
		throw new Error("Project ID không hợp lệ.");
	return path.resolve(
		process.cwd(),
		".local_storage",
		"projects",
		projectId,
		"story-narrator",
	);
}
export async function readStoryProject(
	projectId: string,
): Promise<StoryProject | null> {
	return readAtomicJSON<StoryProject>({
		filePath: path.join(storyDirectory(projectId), "project.json"),
		validate(value) {
			if (value.schema_version !== 1 || value.project_id !== projectId)
				throw new Error("Phiên bản project Story Narrator không được hỗ trợ.");
			return value;
		},
	});
}
export async function writeStoryJSON({
	projectId,
	name,
	value,
}: {
	projectId: string;
	name: string;
	value: unknown;
}) {
	await writeAtomicJSON({
		filePath: path.join(storyDirectory(projectId), name),
		value,
	});
}
export function saveStoryProject(project: StoryProject) {
	return writeStoryJSON({
		projectId: project.project_id,
		name: "project.json",
		value: project,
	});
}
export async function readStoryJob(projectId: string) {
	return readAtomicJSON<StoryJob>({
		filePath: path.join(storyDirectory(projectId), "job.json"),
	});
}
