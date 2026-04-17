import type { VideoProvider, VideoGenerateParams, VideoGenerateResult } from "../types";
import fs from "node:fs";
import path from "node:path";
import { id as genId } from "@/lib/id";

// Convert a local file path to a data: URL; http(s) URLs are returned as-is
function toImageUrl(imagePathOrUrl: string): string {
  if (imagePathOrUrl.startsWith("http://") || imagePathOrUrl.startsWith("https://")) {
    return imagePathOrUrl;
  }
  const ext = path.extname(imagePathOrUrl).toLowerCase().replace(".", "");
  const mime =
    ext === "jpg" || ext === "jpeg"
      ? "image/jpeg"
      : ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "image/png";
  const base64 = fs.readFileSync(imagePathOrUrl, { encoding: "base64" });
  return `data:${mime};base64,${base64}`;
}

// Map ratio string to Vidu size string
function ratioToSize(ratio: string): string {
  const map: Record<string, string> = {
    "16:9": "1280*720",
    "9:16": "720*1280",
    "1:1": "960*960",
    "4:3": "1104*816",
    "3:4": "816*1104",
  };
  return map[ratio] ?? "1280*720";
}

// Pick the right Vidu model variant for the current mode
function getModelForMode(model: string, mode: "keyframe" | "reference" | "text"): string {
  // If model already contains the mode suffix, use as-is
  if (mode === "keyframe") {
    if (model.includes("_start-end2video")) return model;
    // Convert base model to start-end variant
    const base = model.replace(/_text2video$/, "").replace(/_img2video$/, "");
    return `${base}_start-end2video`;
  }
  if (mode === "text") {
    if (model.includes("_text2video")) return model;
    const base = model.replace(/_start-end2video$/, "").replace(/_img2video$/, "");
    return `${base}_text2video`;
  }
  // reference: use start-end with single image, or text model
  if (model.includes("_start-end2video")) return model;
  if (model.includes("_text2video")) return model;
  return model;
}

export class ViduVideoProvider implements VideoProvider {
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
    this.apiKey = params?.apiKey || process.env.VIDU_API_KEY || process.env.DASHSCOPE_API_KEY || "";
    this.baseUrl = (
      params?.baseUrl ||
      process.env.VIDU_BASE_URL ||
      "https://dashscope.aliyuncs.com/api/v1"
    ).replace(/\/+$/, "");
    this.model = params?.model || "vidu/viduq3-turbo_text2video";
    this.uploadDir = params?.uploadDir || process.env.UPLOAD_DIR || "./uploads";
  }

  async generateVideo(params: VideoGenerateParams): Promise<VideoGenerateResult> {
    let body: Record<string, unknown>;

    if ("firstFrame" in params) {
      body = this.buildKeyframeBody(
        params as VideoGenerateParams & { firstFrame: string; lastFrame: string }
      );
    } else if (params.initialImage) {
      body = this.buildReferenceBody(
        params as VideoGenerateParams & { initialImage: string }
      );
    } else {
      body = this.buildTextBody(params);
    }

    console.log(
      `[Vidu] Submitting task: model=${(body as { model: string }).model}, ratio=${params.ratio}`
    );

    const submitRes = await fetch(
      `${this.baseUrl}/services/aigc/video-generation/video-synthesis`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "X-DashScope-Async": "enable",
        },
        body: JSON.stringify(body),
      }
    );

    if (!submitRes.ok) {
      const errText = await submitRes.text().catch(() => "");
      throw new Error(`Vidu submit failed: ${submitRes.status} ${errText}`);
    }

    const submitResult = (await submitRes.json()) as {
      output?: { task_id?: string };
    };

    const taskId = submitResult.output?.task_id;
    if (!taskId) {
      throw new Error(
        `Vidu: no task_id in response: ${JSON.stringify(submitResult)}`
      );
    }

    console.log(`[Vidu] Task submitted: ${taskId}`);

    const videoUrl = await this.pollForResult(taskId);

    // Download and persist video
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) {
      throw new Error(`Vidu: failed to download video (${videoRes.status})`);
    }
    const buffer = Buffer.from(await videoRes.arrayBuffer());
    const filename = `${genId()}.mp4`;
    const dir = path.join(this.uploadDir, "videos");
    fs.mkdirSync(dir, { recursive: true });
    const filepath = path.join(dir, filename);
    fs.writeFileSync(filepath, buffer);

    console.log(`[Vidu] Saved to ${filepath}`);
    return { filePath: filepath };
  }

  // ── Body builders ──────────────────────────────────────────────────────────

  private buildKeyframeBody(
    params: VideoGenerateParams & { firstFrame: string; lastFrame: string }
  ): Record<string, unknown> {
    const model = getModelForMode(this.model, "keyframe");
    return {
      model,
      input: {
        media: [
          { type: "image", url: toImageUrl(params.firstFrame) },
          { type: "image", url: toImageUrl(params.lastFrame) },
        ],
        prompt: params.prompt,
      },
      parameters: {
        resolution: "720P",
        size: ratioToSize(params.ratio),
        duration: params.duration || 5,
      },
    };
  }

  private buildReferenceBody(
    params: VideoGenerateParams & { initialImage: string }
  ): Record<string, unknown> {
    // Use start-end model with single image as first frame
    const model = getModelForMode(this.model, "reference");
    return {
      model,
      input: {
        media: [
          { type: "image", url: toImageUrl(params.initialImage) },
        ],
        prompt: params.prompt,
      },
      parameters: {
        resolution: "720P",
        size: ratioToSize(params.ratio),
        duration: params.duration || 5,
      },
    };
  }

  private buildTextBody(params: VideoGenerateParams): Record<string, unknown> {
    const model = getModelForMode(this.model, "text");
    return {
      model,
      input: {
        prompt: params.prompt,
      },
      parameters: {
        resolution: "720P",
        size: ratioToSize(params.ratio),
        duration: params.duration || 5,
      },
    };
  }

  // ── Polling ────────────────────────────────────────────────────────────────

  private async pollForResult(taskId: string): Promise<string> {
    const maxAttempts = 120; // 10 min
    const interval = 5_000;

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, interval));

      const res = await fetch(`${this.baseUrl}/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!res.ok) {
        console.warn(`[Vidu] Poll ${i + 1}: HTTP ${res.status}, retrying…`);
        continue;
      }

      const result = (await res.json()) as {
        output?: {
          task_id?: string;
          task_status?: string;
          video_url?: string;
          message?: string;
          code?: string;
        };
        usage?: unknown;
      };

      const status = result.output?.task_status ?? "UNKNOWN";
      console.log(`[Vidu] Poll ${i + 1}: status=${status}`);

      if (status === "SUCCEEDED") {
        const videoUrl = result.output?.video_url;
        if (!videoUrl) {
          throw new Error(
            `Vidu: SUCCEEDED but no video_url in response: ${JSON.stringify(result)}`
          );
        }
        return videoUrl;
      }

      if (status === "FAILED") {
        throw new Error(
          `Vidu generation failed: ${result.output?.code ?? ""} ${result.output?.message ?? "unknown error"}`
        );
      }

      // PENDING / RUNNING → keep polling
    }

    throw new Error("Vidu generation timed out after 10 minutes");
  }
}
