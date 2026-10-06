import fs from "node:fs/promises";
import path from "node:path";
import { runPython } from "./python";

export async function separateVocals(source: string, directory: string) {
	const vocals = path.join(directory, "vocals.wav");
	const background = path.join(directory, "background.wav");
	const cache = path.join(directory, "separation.json");
	const stat = await fs.stat(source);
	const signature = `${path.resolve(source)}:${stat.size}:${stat.mtimeMs}:htdemucs-v1`;
	try {
		if (JSON.parse(await fs.readFile(cache, "utf8")).signature === signature) {
			await Promise.all([fs.access(vocals), fs.access(background)]);
			return { vocals, background };
		}
	} catch { /* No usable cached stems. */ }
	await runPython(`
import sys, torch, soundfile as sf
from demucs.pretrained import get_model
from demucs.apply import apply_model
from demucs.audio import AudioFile
source, vocals, background = sys.argv[1:]
torch.set_num_threads(4)
model = get_model('htdemucs').cpu().eval()
wav = AudioFile(source).read(streams=0, samplerate=model.samplerate, channels=model.audio_channels)
reference = wav.mean(0)
mean, std = reference.mean(), reference.std().clamp(min=1e-8)
with torch.no_grad():
    stems = apply_model(model, ((wav - mean) / std)[None], device='cpu', shifts=0, split=True, overlap=0.25, progress=False)[0]
stems = stems * std + mean
index = model.sources.index('vocals')
bed = stems[[i for i in range(len(model.sources)) if i != index]].sum(0)
sf.write(vocals, stems[index].t().numpy(), model.samplerate, subtype='PCM_16')
sf.write(background, bed.t().numpy(), model.samplerate, subtype='PCM_16')
`, [source, vocals, background], 30 * 60_000, true);
	await fs.writeFile(cache, JSON.stringify({ signature }));
	return { vocals, background };
}
