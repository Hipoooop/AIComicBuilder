"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "next-intl";
import { Loader2, RefreshCw } from "lucide-react";
import { AiOptimizeButton } from "../ai-optimize-button";

interface StepTextProps {
  editPrompt: string;
  setEditPrompt: (v: string) => void;
  editMotionScript: string;
  setEditMotionScript: (v: string) => void;
  editCameraDirection: string;
  setEditCameraDirection: (v: string) => void;
  patchShot: (fields: Record<string, unknown>) => Promise<void>;
  projectId: string;
  rewritingText: boolean;
  onRewriteText: () => void;
}

export function StepText({
  editPrompt,
  setEditPrompt,
  editMotionScript,
  setEditMotionScript,
  editCameraDirection,
  setEditCameraDirection,
  patchShot,
  projectId,
  rewritingText,
  onRewriteText,
}: StepTextProps) {
  const t = useTranslations();

  return (
    <div className="space-y-2.5">
      <div>
        <div className="mb-1 flex items-center gap-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[--text-muted]">{t("shot.sceneDescription")}</p>
          <AiOptimizeButton
            value={editPrompt}
            onOptimized={(v) => { setEditPrompt(v); patchShot({ prompt: v }); }}
            fieldLabel="sceneDescription"
            projectId={projectId}
          />
        </div>
        <Textarea
          value={editPrompt}
          onChange={(e) => setEditPrompt(e.target.value)}
          onBlur={() => patchShot({ prompt: editPrompt })}
          rows={2}
          placeholder={t("shot.prompt")}
        />
      </div>
      <div>
        <div className="mb-1 flex items-center gap-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-600">{t("shot.motionScript")}</p>
          <AiOptimizeButton
            value={editMotionScript}
            onOptimized={(v) => { setEditMotionScript(v); patchShot({ motionScript: v }); }}
            fieldLabel="motionScript"
            projectId={projectId}
          />
        </div>
        <Textarea
          value={editMotionScript}
          onChange={(e) => setEditMotionScript(e.target.value)}
          onBlur={() => patchShot({ motionScript: editMotionScript })}
          rows={2}
          placeholder={t("shot.motionScript")}
          className="border-emerald-200 bg-emerald-50/30 text-sm"
        />
      </div>
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[--text-muted]">{t("shot.cameraDirection")}</p>
        <input
          value={editCameraDirection}
          onChange={(e) => setEditCameraDirection(e.target.value)}
          onBlur={() => patchShot({ cameraDirection: editCameraDirection })}
          className="w-full rounded-xl border border-[--border-subtle] bg-white px-3 py-2 text-sm outline-none focus:border-primary/50"
          placeholder="static / pan-left / zoom-in ..."
        />
      </div>
      <Button
        size="xs"
        variant="outline"
        onClick={onRewriteText}
        disabled={rewritingText}
      >
        {rewritingText ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        {rewritingText ? t("common.generating") : t("shot.rewriteText")}
      </Button>
    </div>
  );
}
