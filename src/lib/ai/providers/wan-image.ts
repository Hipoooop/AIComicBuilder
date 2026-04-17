import type { AIProvider, TextOptions, ImageOptions } from "../types";
import fs from "node:fs";
import path from "node:path";
import { id as genId } from "@/lib/id";

// Map ratio string to wan size string (width*height)
function ratioToSize(ratio: string): string {
  const map: Record<string, string> = {
    "16:9": "1696*960",
    "9:16": "960*1696",
    "1:1": "1280*1280",
    "4:3": "1472*1104",
    "3:4": "1104*1472",
  };
  return map[ratio] ?? "1280*1280";
}

export class WanImageProvider implements AIProvider {
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
    this.apiKey = params?.apiKey || process.env.DASHSCOPE_API_KEY || "";
    this.baseUrl = (
      params?.baseUrl ||
      "https://dashscope.aliyuncs.com/api/v1"
    ).replace(/\/+$/, "");
    this.model = params?.model || "wan2.6-t2i";
    this.uploadDir = params?.uploadDir || process.env.UPLOAD_DIR || "./uploads";
  }

  // wan2.6 uses multimodal-generation endpoint
  private get isWan26(): boolean {
    return this.model.startsWith("wan2.6");
  }

  async generateText(_prompt: string, _options?: TextOptions): Promise<string> {
    throw new Error("通义万相 does not support text generation");
  }

  async generateImage(prompt: string, options?: ImageOptions): Promise<string> {
    const size = ratioToSize(options?.aspectRatio || "1:1");

    let submitUrl: string;
    let body: Record<string, unknown>;

    if (this.isWan26) {
      // wan2.6 uses multimodal-generation endpoint with messages format
      submitUrl = `${this.baseUrl}/services/aigc/multimodal-generation/generation`;
      body = {
        model: this.model,
        input: {
          messages: [
            {
              role: "user",
              content: [{ text: prompt }],
            },
          ],
        },
        parameters: {
          size,
          n: 1,
          prompt_extend: true,
          watermark: false,
        },
      };
    } else {
      // wan2.5 and below use text2image/image-synthesis endpoint
      submitUrl = `${this.baseUrl}/services/aigc/text2image/image-synthesis`;
      body = {
        model: this.model,
        input: {
          prompt,
        },
        parameters: {
          size,
          n: 1,
        },
      };
    }

    console.log(`[WanImage] Submitting task: model=${this.model}, size=${size}`);

    const submitRes = await fetch(submitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify(body),
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text().catch(() => "");
      throw new Error(`WanImage submit failed: ${submitRes.status} ${errText}`);
    }

    const submitResult = (await submitRes.json()) as {
      output?: { task_id?: string };
      code?: string;
      message?: string;
    };

    if (submitResult.code) {
      throw new Error(`WanImage error: ${submitResult.message}`);
    }

    const taskId = submitResult.output?.task_id;
    if (!taskId) {
      throw new Error(
        `WanImage: no task_id in response: ${JSON.stringify(submitResult)}`
      );
    }

    console.log(`[WanImage] Task submitted: ${taskId}`);

    const imageUrl = await this.pollForResult(taskId);

    // Download to local storage
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      throw new Error(`WanImage: failed to download image (${imageRes.status})`);
    }
    const buffer = Buffer.from(await imageRes.arrayBuffer());
    const filename = `${genId()}.png`;
    const dir = path.join(this.uploadDir, "images");
    fs.mkdirSync(dir, { recursive: true });
    const filepath = path.join(dir, filename);
    fs.writeFileSync(filepath, buffer);

    console.log(`[WanImage] Saved to ${filepath}`);
    return filepath;
  }

  private async pollForResult(taskId: string): Promise<string> {
    const maxAttempts = 60; // 5 min
    const interval = 5_000;

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, interval));

      const res = await fetch(`${this.baseUrl}/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!res.ok) {
        console.warn(`[WanImage] Poll ${i + 1}: HTTP ${res.status}, retrying…`);
        continue;
      }

      const result = (await res.json()) as {
        output?: {
          task_id?: string;
          task_status?: string;
          choices?: {
            message: {
              content: { image?: string; type?: string }[];
            };
          }[];
          results?: { url?: string }[];
          message?: string;
          code?: string;
        };
      };

      const status = result.output?.task_status ?? "UNKNOWN";
      console.log(`[WanImage] Poll ${i + 1}: status=${status}`);

      if (status === "SUCCEEDED") {
        // wan2.6 returns image URL in choices[0].message.content[0].image
        const imageFromChoices = result.output?.choices?.[0]?.message?.content?.[0]?.image;
        if (imageFromChoices) return imageFromChoices;

        // Older models return in results[0].url
        const imageFromResults = result.output?.results?.[0]?.url;
        if (imageFromResults) return imageFromResults;

        throw new Error(
          `WanImage: SUCCEEDED but no image URL in response: ${JSON.stringify(result)}`
        );
      }

      if (status === "FAILED") {
        throw new Error(
          `WanImage generation failed: ${result.output?.code ?? ""} ${result.output?.message ?? "unknown error"}`
        );
      }

      // PENDING / RUNNING → keep polling
    }

    throw new Error("WanImage generation timed out after 5 minutes");
  }
}
