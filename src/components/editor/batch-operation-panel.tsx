"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  ImageIcon,
  VideoIcon,
  Loader2,
  RefreshCw,
  Play,
} from "lucide-react";
import { InlineModelPicker } from "@/components/editor/model-selector";
import { VideoRatioPicker } from "@/components/editor/video-ratio-picker";

interface BatchStats {
  totalShots: number;
  shotsWithFrames: number;
  shotsWithVideoPrompts: number;
  shotsWithFrameAny: number;
  shotsWithRefPrompts: number;
  shotsWithKeyframePrompts: number;
  shotsWithAllRefImages: number;
  hasReferenceImages: boolean;
  allRefImagesGenerated: boolean;
  generationMode: "keyframe" | "reference";
}

interface BatchState {
  anyGenerating: boolean;
  generating: boolean;
  generatingFrames: boolean;
  generatingSceneFrames: boolean;
  generatingRefPrompts: boolean;
  generatingKeyframeAssets: boolean;
  generatingVideoPrompts: boolean;
  generatingVideos: boolean;
  generatingFramesOverwrite: boolean;
  generatingVideosOverwrite: boolean;
  sceneFramesOverwrite: boolean;
}

interface BatchProgress {
  total: number;
  completed: number;
  failed: string[];
}

interface BatchActions {
  onGenerateShots: () => void;
  onBatchGenerateFrames: (overwrite: boolean) => void;
  onBatchGenerateSceneFrames: (overwrite: boolean) => void;
  onBatchGenerateVideos: (overwrite: boolean) => void;
  onBatchGenerateReferenceVideos: (overwrite: boolean) => void;
  onBatchGenerateVideoPrompts: () => void;
  onGenerateRefPrompts: () => void;
  onGenerateKeyframeAssets: () => void;
  onAutoRun: () => void;
  onRetryFailed: () => void;
}

interface BatchOperationPanelProps {
  stats: BatchStats;
  state: BatchState;
  progress: BatchProgress | null;
  lastFailedShots: string[];
  actions: BatchActions;
  videoRatio: string;
  onVideoRatioChange: (ratio: string) => void;
}

export function BatchOperationPanel({
  stats,
  state,
  progress,
  lastFailedShots,
  actions,
  videoRatio,
  onVideoRatioChange,
}: BatchOperationPanelProps) {
  const t = useTranslations();
  const {
    totalShots, shotsWithFrames, shotsWithVideoPrompts,
    shotsWithFrameAny, shotsWithRefPrompts, shotsWithKeyframePrompts,
    hasReferenceImages, allRefImagesGenerated, generationMode,
  } = stats;
  const {
    anyGenerating, generating, generatingFrames, generatingSceneFrames,
    generatingRefPrompts, generatingKeyframeAssets, generatingVideoPrompts,
    generatingVideos, generatingFramesOverwrite, generatingVideosOverwrite,
    sceneFramesOverwrite,
  } = state;

  return (
    <div className="space-y-2">
      {/* Row 1: Generate text / shots */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center rounded-full bg-[--surface] text-[10px] font-bold text-[--text-muted]">1</span>
        <InlineModelPicker capability="text" />
        <Button
          onClick={actions.onGenerateShots}
          disabled={anyGenerating}
          variant="default"
          size="sm"
        >
          {generating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {generating ? t("common.generating") : t("project.generateShots")}
        </Button>
      </div>

      {/* Row 2: Frames */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center rounded-full bg-[--surface] text-[10px] font-bold text-[--text-muted]">2</span>
        <InlineModelPicker capability="image" />
        {generationMode === "reference" ? (
          <>
            <Button
              size="sm"
              onClick={actions.onGenerateRefPrompts}
              disabled={generatingRefPrompts || anyGenerating || totalShots === 0}
            >
              {generatingRefPrompts ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {generatingRefPrompts ? t("common.generating") : (t("storyboard.generateRefPrompts") || "Generate Ref Prompts")}
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={() => actions.onBatchGenerateSceneFrames(false)}
              disabled={anyGenerating || totalShots === 0 || !hasReferenceImages || shotsWithRefPrompts === 0}
            >
              {generatingSceneFrames && !sceneFramesOverwrite ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
              {generatingSceneFrames && !sceneFramesOverwrite ? t("common.generating") : (t("storyboard.batchGenerateRefImages") || "Batch Generate Ref Images")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => actions.onBatchGenerateSceneFrames(true)}
              disabled={anyGenerating || totalShots === 0 || !hasReferenceImages}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              onClick={actions.onGenerateKeyframeAssets}
              disabled={generatingKeyframeAssets || anyGenerating || totalShots === 0}
              title="基于已有的镜头元数据生成首尾帧的图像提示词"
            >
              {generatingKeyframeAssets ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {generatingKeyframeAssets ? "生成中…" : "生成首尾帧提示词"}
            </Button>
            <Button
              onClick={() => actions.onBatchGenerateFrames(false)}
              disabled={anyGenerating || totalShots === 0 || shotsWithKeyframePrompts === 0}
              variant="default"
              size="sm"
            >
              {generatingFrames && !generatingFramesOverwrite ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImageIcon className="h-3.5 w-3.5" />
              )}
              {generatingFrames && !generatingFramesOverwrite
                ? t("common.generating")
                : t("project.batchGenerateFrames")}
            </Button>
            <Button
              onClick={() => actions.onBatchGenerateFrames(true)}
              disabled={anyGenerating || totalShots === 0 || shotsWithKeyframePrompts === 0}
              variant="ghost"
              size="icon"
              title={t("project.batchGenerateFramesOverwrite")}
            >
              {generatingFrames && generatingFramesOverwrite ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          </>
        )}
      </div>

      {/* Row 3: Video prompts */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center rounded-full bg-[--surface] text-[10px] font-bold text-[--text-muted]">3</span>
        <InlineModelPicker capability="text" />
        <Button
          onClick={actions.onBatchGenerateVideoPrompts}
          disabled={anyGenerating || shotsWithFrameAny === 0}
          variant="default"
          size="sm"
        >
          {generatingVideoPrompts ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {generatingVideoPrompts ? t("common.generating") : t("project.batchGenerateVideoPrompts")}
        </Button>
      </div>

      {/* Row 4: Videos */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center rounded-full bg-[--surface] text-[10px] font-bold text-[--text-muted]">4</span>
        <InlineModelPicker capability="video" />
        <VideoRatioPicker value={videoRatio} onChange={onVideoRatioChange} />
        <Button
          onClick={() =>
            generationMode === "reference"
              ? actions.onBatchGenerateReferenceVideos(false)
              : actions.onBatchGenerateVideos(false)
          }
          disabled={
            anyGenerating ||
            totalShots === 0 ||
            shotsWithVideoPrompts !== totalShots ||
            (generationMode === "reference"
              ? !hasReferenceImages || !allRefImagesGenerated || shotsWithRefPrompts !== totalShots
              : shotsWithFrames !== totalShots)
          }
          variant="default"
          size="sm"
        >
          {generatingVideos && !generatingVideosOverwrite ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <VideoIcon className="h-3.5 w-3.5" />
          )}
          {generatingVideos && !generatingVideosOverwrite
            ? t("common.generating")
            : generationMode === "reference"
              ? t("project.batchGenerateReferenceVideos")
              : t("project.batchGenerateVideos")}
        </Button>
        <Button
          onClick={() =>
            generationMode === "reference"
              ? actions.onBatchGenerateReferenceVideos(true)
              : actions.onBatchGenerateVideos(true)
          }
          disabled={
            anyGenerating ||
            totalShots === 0 ||
            shotsWithVideoPrompts !== totalShots ||
            (generationMode === "reference"
              ? !hasReferenceImages || !allRefImagesGenerated || shotsWithRefPrompts !== totalShots
              : shotsWithFrames !== totalShots)
          }
          variant="ghost"
          size="icon"
          title={t("project.batchGenerateVideosOverwrite")}
        >
          {generatingVideos && generatingVideosOverwrite ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* Divider + Auto-run */}
      {totalShots > 0 && (
        <>
          <div className="h-px bg-[--border-subtle]" />
          <div className="flex items-center gap-2">
            <Button
              onClick={actions.onAutoRun}
              disabled={anyGenerating}
              variant="default"
              size="sm"
              className="gap-1.5"
            >
              {anyGenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {t("project.autoRun")}
            </Button>
            {lastFailedShots.length > 0 && !progress && (
              <Button
                variant="outline"
                size="sm"
                onClick={actions.onRetryFailed}
                disabled={anyGenerating}
                className="border-destructive/50 text-destructive hover:bg-destructive/10"
              >
                <RefreshCw className="mr-1 h-4 w-4" />
                Retry {lastFailedShots.length} failed
              </Button>
            )}
          </div>
        </>
      )}

      {/* Batch progress bar */}
      {progress && (
        <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/50">
          <Loader2 className="h-4 w-4 animate-spin" />
          <div className="flex-1">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{
                  width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
          <span className="text-sm text-muted-foreground tabular-nums">
            {progress.completed}/{progress.total}
            {progress.failed.length > 0 && (
              <span className="text-destructive ml-1">
                ({progress.failed.length} failed)
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
