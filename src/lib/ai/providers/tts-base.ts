import fs from "node:fs";
import path from "node:path";
import { id as genId } from "@/lib/id";
import { DEFAULT_VOICE } from "./tts-voices";

// Re-export for server-side consumers
export { CHINESE_VOICES, DEFAULT_VOICE } from "./tts-voices";

// ─── TTS Provider Interface ─────────────────────────────────────────────

export interface TTSSynthesizeOptions {
  voice: string;
  rate?: string;   // e.g. "+10%", "-5%"
  pitch?: string;  // e.g. "+2Hz"
  volume?: string; // e.g. "+20%"
}

export interface TTSResult {
  filePath: string;
  duration: number; // seconds
}

export interface TTSProvider {
  synthesize(text: string, options: TTSSynthesizeOptions): Promise<TTSResult>;
}

// ─── Edge-TTS Provider ──────────────────────────────────────────────────

export class EdgeTTSProvider implements TTSProvider {
  private uploadDir: string;

  constructor(params?: { uploadDir?: string }) {
    this.uploadDir = params?.uploadDir || process.env.UPLOAD_DIR || "./uploads";
  }

  async synthesize(text: string, options: TTSSynthesizeOptions): Promise<TTSResult> {
    const dir = path.join(this.uploadDir, "audio");
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${genId()}.mp3`;
    const filepath = path.join(dir, filename);

    // Use compiled JS output to avoid Turbopack issues with the .ts source
    const { ttsSave: edgeTtsSave } = await import("edge-tts/out/index.js");
    await edgeTtsSave(text, filepath, {
      voice: options.voice || DEFAULT_VOICE,
      rate: options.rate || "+0%",
      pitch: options.pitch || "+0Hz",
      volume: options.volume || "+0%",
    });

    // Get duration via ffprobe
    const duration = await getAudioDuration(filepath);

    console.log(`[EdgeTTS] Synthesized: voice=${options.voice}, chars=${text.length}, duration=${duration.toFixed(2)}s, file=${filepath}`);
    return { filePath: filepath, duration };
  }
}

// ─── Audio Duration Utility ─────────────────────────────────────────────

async function getAudioDuration(filePath: string): Promise<number> {
  const ffmpeg = (await import("fluent-ffmpeg")).default;
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err || !data?.format?.duration) {
        // Fallback: estimate from file size (MP3 at ~48kbps)
        const stats = fs.statSync(filePath);
        resolve(stats.size / 6000);
        return;
      }
      resolve(data.format.duration);
    });
  });
}
