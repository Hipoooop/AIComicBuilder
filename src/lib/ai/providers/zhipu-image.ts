import type { AIProvider, TextOptions, ImageOptions } from "../types";
import fs from "node:fs";
import path from "node:path";
import { ulid } from "ulid";
import ZhipuAI from "zhipuai-sdk-nodejs-v4";

interface ZhipuImageResponse {
  created: number;
  data: Array<{ url: string } | string>;
}

interface ZhipuErrorResponse {
  error?: {
    code?: string | number;
    message?: string;
  };
}

export class ZhipuImageProvider implements AIProvider {
  private client: ZhipuAI;
  private model: string;
  private uploadDir: string;

  constructor(params?: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    uploadDir?: string;
  }) {
    this.client = new ZhipuAI({
      apiKey: (params?.apiKey || process.env.ZHIPU_API_KEY || "").trim(),
    });
    this.model = params?.model || process.env.ZHIPU_IMAGE_MODEL || "cogview-3-plus";
    this.uploadDir = params?.uploadDir || process.env.UPLOAD_DIR || "./uploads";
  }

  async generateText(_prompt: string, _options?: TextOptions): Promise<string> {
    throw new Error("Zhipu image provider does not support text generation");
  }

  async generateImage(prompt: string, options?: ImageOptions): Promise<string> {
    const size = this.mapSize(options?.aspectRatio || "1:1");

    console.log(`[Zhipu Image] Generating: model=${this.model}, size=${size}`);

    try {
      const res = await this.client.images.create({
        model: this.model,
        prompt,
        size,
      });

      // SDK returns { created, data: [url1, url2, ...] } on success
      // On error, throws an object with { error: { code, message } }
      if (!res || typeof res !== "object") {
        throw new Error(`Zhipu image: unexpected response type: ${typeof res}`);
      }

      // Check if it's an error response
      const errRes = res as ZhipuErrorResponse;
      if (errRes.error) {
        throw new Error(`Zhipu image error: ${errRes.error.code} ${errRes.error.message}`);
      }

      if (!res.data || res.data.length === 0) {
        throw new Error("Zhipu image: no images in response");
      }

      // data can be string[] or { url: string }[]
      // SDK types say string[], but API actually returns { url: string }[]
      const firstItem = (res.data as Array<{ url: string } | string>)[0];
      const imageUrl = typeof firstItem === "string" ? firstItem : firstItem.url;
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
    } catch (err) {
      console.error("[Zhipu Image] Error:", err);
      throw err;
    }
  }

  private mapSize(aspectRatio: string): string {
    // 智谱 CogView API 要求：
    // 1. 长宽在 512-2880px 之间
    // 2. 必须是 16 的整数倍
    // 3. 最大像素数不超过 2^21 (约 2,097,152)
    const sizeMap: Record<string, string> = {
      "1:1": "1024x1024",
      "16:9": "1920x1088",   // 2,088,960 px (1088 = 68*16)
      "9:16": "1088x1920",
      "4:3": "960x1280",
      "3:4": "1280x960",
    };
    return sizeMap[aspectRatio] || sizeMap[aspectRatio] || "1024x1024";
  }
}
