import fs from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const retryDelays = [50, 100, 200, 400, 800, 1000, 1000, 1000];

/** Windows can keep a completed download locked briefly after the writer closes. */
export async function publishDownloadedFile({
	temporaryPath,
	finalPath,
	rename = fs.rename,
	wait = delay,
}: {
	temporaryPath: string;
	finalPath: string;
	rename?: typeof fs.rename;
	wait?: (milliseconds: number) => Promise<unknown>;
}) {
	for (let attempt = 0; ; attempt++) {
		try {
			await rename(temporaryPath, finalPath);
			return;
		} catch (error) {
			const locked = error instanceof Error && "code" in error &&
				["EBUSY", "EPERM", "EACCES"].includes(String(error.code));
			if (!locked) throw error;
			if (attempt === retryDelays.length) {
				throw new Error(
					"Video đã tải xong nhưng Windows đang khóa tệp. File tải đã được giữ lại; thử import lại sau để hoàn tất.",
					{ cause: error },
				);
			}
			await wait(retryDelays[attempt]);
		}
	}
}
