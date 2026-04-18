"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "next-intl";
import { uploadUrl } from "@/lib/utils/upload-url";
import {
  Loader2,
  VideoIcon,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { AiOptimizeButton } from "../ai-optimize-button";
import type { RefImage, StepState } from "./types";

// Shared props for both step 3 and step 4
interface StepVideoProps {
  editVideoPrompt: string;
  setEditVideoPrompt: (v: string) => void;
  patchShot: (fields: Record<string, unknown>) => Promise<void>;
  projectId: string;
  promptState: StepState;
  hasVideoPrompt: boolean;
  hasFrame: boolean;
  hasFramePair: boolean;
  generatingPrompt: boolean;
  anyGenerating: boolean;
  nextStep: string | null;
  onGenerateVideoPrompt: () => void;
  videoUrl: string | null | undefined;
  generationMode: "keyframe" | "reference";
  allRefItems: RefImage[];
  activateAssetById: (assetId: string) => Promise<void>;
  setPreviewSrc: (src: string | null) => void;
  videoState: StepState;
  hasVideo: boolean;
  isGenerating: boolean;
  generatingVideo: boolean;
  onGenerateVideo: () => void;
}

export type { StepVideoProps };

export function StepVideoPromptContent(props: StepVideoProps) {
  const t = useTranslations();

  return (
    <>
      {props.hasVideoPrompt && (
        <div className="mb-2">
          <div className="mb-1 flex items-center gap-1">
            <AiOptimizeButton
              value={props.editVideoPrompt}
              onOptimized={(v) => { props.setEditVideoPrompt(v); props.patchShot({ videoPrompt: v }); }}
              fieldLabel="videoPrompt"
              projectId={props.projectId}
            />
          </div>
          <Textarea
            value={props.editVideoPrompt}
            onChange={(e) => props.setEditVideoPrompt(e.target.value)}
            onBlur={() => props.patchShot({ videoPrompt: props.editVideoPrompt })}
            className="min-h-[5rem] resize-none font-mono text-xs leading-relaxed"
          />
        </div>
      )}
      <Button
        size="xs"
        variant={props.nextStep === "prompt" ? "default" : "outline"}
        onClick={props.onGenerateVideoPrompt}
        disabled={props.generatingPrompt || props.anyGenerating || !props.hasFrame}
      >
        {(props.generatingPrompt || props.anyGenerating) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        {(props.generatingPrompt)
          ? t("common.generating")
          : props.hasVideoPrompt ? t("shot.regeneratePrompt") : t("shot.generateVideoPrompt")
        }
      </Button>
    </>
  );
}

export function StepVideoPlayerContent(props: StepVideoProps) {
  const t = useTranslations();
  const { videoUrl, generationMode, allRefItems, activateAssetById, setPreviewSrc,
    hasVideo, isGenerating, hasFramePair, generatingVideo, anyGenerating, nextStep,
    onGenerateVideo } = props;

  return (
    <>
      {hasVideo && (() => {
        const videoTypeKey = generationMode === "reference" ? "ref_video" : "video";
        const videoItem = allRefItems.find((r) => r.type === videoTypeKey);
        const videoHistoryIds = videoItem?.historyIds || [];
        const videoCurrentIdx = videoItem ? videoHistoryIds.indexOf(videoItem.id) : -1;
        return (
          <div
            className="group relative mb-2.5 w-full overflow-hidden rounded-xl border border-[--border-subtle] bg-black cursor-pointer"
            style={{ aspectRatio: "16/9" }}
            onClick={() => setPreviewSrc(uploadUrl(videoUrl!))}
          >
            <video className="h-full w-full object-contain" src={uploadUrl(videoUrl!)} />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-lg">
                <VideoIcon className="h-4 w-4 text-[--text-primary] translate-x-0.5" />
              </div>
            </div>
            {videoHistoryIds.length > 1 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = (videoCurrentIdx - 1 + videoHistoryIds.length) % videoHistoryIds.length;
                    activateAssetById(videoHistoryIds[next]);
                  }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = (videoCurrentIdx + 1) % videoHistoryIds.length;
                    activateAssetById(videoHistoryIds[next]);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-black/60 px-2 py-0.5 text-[10px] text-white">
                  {videoCurrentIdx + 1}/{videoHistoryIds.length}
                </span>
              </>
            )}
          </div>
        );
      })()}
      <Button
        size="xs"
        variant={nextStep === "video" ? "default" : "outline"}
        onClick={onGenerateVideo}
        disabled={generatingVideo || anyGenerating || isGenerating || (generationMode === "keyframe" && !hasFramePair)}
      >
        {(generatingVideo || (isGenerating && !hasVideo))
          ? <Loader2 className="h-3 w-3 animate-spin" />
          : <VideoIcon className="h-3 w-3" />
        }
        {(generatingVideo || (isGenerating && !hasVideo))
          ? t("common.generating")
          : hasVideo ? t("shot.regenerateVideo") : t("project.generateVideo")
        }
      </Button>
    </>
  );
}
