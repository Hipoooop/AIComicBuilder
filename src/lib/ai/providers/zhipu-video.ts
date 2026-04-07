import type { VideoProvider, VideoGenerateParams, VideoGenerateResult } from "../types";
import fs from "node:fs";
import path from "node:path";
import { ulid } from "ulid";

function toDataUrl(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().replace(".", "");
  const mime =
    ext === "jpg" || ext === "jpeg"
      ? "image/jpeg"
      : ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "image/png";
  const base64 = fs.readFileSync(filePath, { encoding: "base64" });
  return `data:${mime};base64,${base64}`;
}

async function toImageUrl(imagePathOrUrl: string): Promise<string> {
  if (imagePathOrUrl.startsWith("http://") || imagePathOrUrl.startsWith("https://")) {
    return imagePathOrUrl;
  }
  return toDataUrl(imagePathOrUrl);
}

interface ZhipuSubmitResponse {
  id: string;
  request_id: string;
  model: string;
  task_status: "PROCESSING" | "SUCCESS" | "FAIL";
}

interface ZhipuResultResponse {
  model: string;
  request_id: string;
  task_status: "PROCESSING" | "SUCCESS" | "FAIL";
  video_result?: Array<{
    url: string;
    cover_image_url: string;
  }>;
}

function mapRatioToSize(ratio: string): string {
  // 智谱 API 要求：
  // 1. 长宽在 512-2880px 之间
  // 2. 必须是 16 的整数倍
  // 3. 最大像素数不超过 2^21 (约 2,097,152)
  const ratioMap: Record<string, string> = {
    "16:9": "1920x1088",   // 1088 = 68*16, pixels: 2,088,960
    "9:16": "1088x1920",   // pixels: 2,088,960
    "1:1": "1024x1024",    // pixels: 1,048,576
    "4:3": "1280x960",     // 960 = 60*16, pixels: 1,228,800
    "3:4": "960x1280",     // pixels: 1,228,800
    "16:10": "1920x1200",  // 1200 = 75*16, pixels: 2,304,000
    "2:1": "1920x960",     // pixels: 1,843,200
    "4K": "1920x1088",     // 4K 超过限制，降级到 1080p
  };
  return ratioMap[ratio] || "1920x1088";
}

export class ZhipuVideoProvider implements VideoProvider {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private uploadDir: string;

  constructor(params?: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    uploadDir?: string;
  }) {
    this.apiKey = (params?.apiKey || process.env.ZHIPU_API_KEY || "").trim();
    this.baseUrl = (
      params?.baseUrl ||
      process.env.ZHIPU_BASE_URL ||
      "https://open.bigmodel.cn/api/paas/v4"
    ).replace(/\/+$/, "");
    this.model = params?.model || process.env.ZHIPU_MODEL || "cogvideox-2";
    this.uploadDir = params?.uploadDir || process.env.UPLOAD_DIR || "./uploads";
  }

  async generateVideo(params: VideoGenerateParams): Promise<VideoGenerateResult> {
    const size = mapRatioToSize(params.ratio);
    const quality = this.model === "cogvideox-flash" ? "speed" : "quality";

    let imageUrl: string | undefined;

    if ("firstFrame" in params && params.firstFrame) {
      imageUrl = await toImageUrl(params.firstFrame);
    } else if ("initialImage" in params && params.initialImage) {
      imageUrl = await toImageUrl(params.initialImage);
    }

    const body: Record<string, unknown> = {
      model: this.model,
      prompt: params.prompt,
      quality,
      with_audio: true,
      size,
      fps: 30,
    };

    if (imageUrl) {
      body.image_url = imageUrl;
    }

    console.log(
      `[Zhipu Video] Submitting task: model=${this.model}, size=${size}, hasImage=${!!imageUrl}`
    );

    const submitRes = await fetch(`${this.baseUrl}/videos/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text().catch(() => "");
      throw new Error(`Zhipu video submit failed: ${submitRes.status} ${errText}`);
    }

    const submitJson = (await submitRes.json()) as ZhipuSubmitResponse;
    if (submitJson.task_status === "FAIL") {
      throw new Error(`Zhipu video submit failed: task immediately failed`);
    }

    const taskId = submitJson.id;
    console.log(`[Zhipu Video] Task submitted: ${taskId}`);

    const videoUrl = await this.pollForResult(taskId);

    const videoRes = await fetch(videoUrl);
    const buffer = Buffer.from(await videoRes.arrayBuffer());
    const filename = `${ulid()}.mp4`;
    const dir = path.join(this.uploadDir, "videos");
    fs.mkdirSync(dir, { recursive: true });
    const filepath = path.join(dir, filename);
    fs.writeFileSync(filepath, buffer);

    console.log(`[Zhipu Video] Saved to ${filepath}`);
    return { filePath: filepath };
  }

  private async pollForResult(taskId: string): Promise<string> {
    const maxAttempts = 120;
    const interval = 5000;

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, interval));

      const res = await fetch(`${this.baseUrl}/async-result/${taskId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!res.ok) {
        console.warn(`[Zhipu Video] Poll ${i + 1}: HTTP ${res.status}`);
        continue;
      }

      const json = (await res.json()) as ZhipuResultResponse;

      console.log(`[Zhipu Video] Poll ${i + 1}: status=${json.task_status}`);

      if (json.task_status === "SUCCESS" && json.video_result?.[0]?.url) {
        return json.video_result[0].url;
      }

      if (json.task_status === "FAIL") {
        throw new Error(`Zhipu video generation failed`);
      }
    }

    throw new Error("Zhipu video generation timed out after 10 minutes");
  }
}
