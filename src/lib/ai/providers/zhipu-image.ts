import type { AIProvider, TextOptions, ImageOptions } from "../types";
import fs from "node:fs";
import path from "node:path";
import { ulid } from "ulid";

interface ZhipuImageResponse {
  created: number;
  data: Array<{
    url: string;
  }>;
}

export class ZhipuImageProvider implements AIProvider {
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
    this.model = params?.model || process.env.ZHIPU_IMAGE_MODEL || "cogview-3-plus";
    this.uploadDir = params?.uploadDir || process.env.UPLOAD_DIR || "./uploads";
  }

  async generateText(_prompt: string, _options?: TextOptions): Promise<string> {
    throw new Error("Zhipu image provider does not support text generation");
  }

  async generateImage(prompt: string, options?: ImageOptions): Promise<string> {
    const size = this.mapSize(options?.aspectRatio || "1:1");

    const body: Record<string, unknown> = {
      model: this.model,
      prompt,
      size,
      n: 1,
    };

    console.log(`[Zhipu Image] Generating: model=${this.model}, size=${size}`);

    const res = await fetch(`${this.baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Zhipu image generation failed: ${res.status} ${errText}`);
    }

    const json = (await res.json()) as ZhipuImageResponse;

    if (!json.data?.[0]?.url) {
      throw new Error("Zhipu image: no URL in response");
    }

    const imageUrl = json.data[0].url;
    console.log(`[Zhipu Image] Got URL: ${imageUrl}`);

    // Download to local storage
    const imageRes = await fetch(imageUrl);
    const buffer = Buffer.from(await imageRes.arrayBuffer());
    const ext = imageUrl.split("?")[0].split(".").pop() || "png";
    const filename = `${ulid()}.${ext}`;
    const dir = path.join(this.uploadDir, "images");
    fs.mkdirSync(dir, { recursive: true });
    const filepath = path.join(dir, filename);
    fs.writeFileSync(filepath, buffer);

    console.log(`[Zhipu Image] Saved to ${filepath}`);
    return filepath;
  }

  private mapSize(aspectRatio: string): string {
    // Map aspect ratio to size
    // CogView supports: 720x720, 1024x1024, 1280x720, 720x1280, 1920x1080, 1080x1920
    const sizeMap: Record<string, string> = {
      "1:1": "1024x1024",
      "16:9": "1920x1080",
      "9:16": "1080x1920",
      "4:3": "1280x960",
      "3:4": "960x1280",
      "16:10": "1920x1200",
    };
    return sizeMap[aspectRatio] || "1024x1024";
  }
}
