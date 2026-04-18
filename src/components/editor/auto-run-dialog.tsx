"use client";

import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Play, CheckCircle2, Circle } from "lucide-react";

export interface AutoRunPlan {
  text: number;
  frame: number;
  prompt: number;
  video: number;
}

interface AutoRunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: AutoRunPlan | null;
  executing: boolean;
  onConfirm: () => void;
}

export function AutoRunDialog({
  open,
  onOpenChange,
  plan,
  executing,
  onConfirm,
}: AutoRunDialogProps) {
  const t = useTranslations();

  if (!plan) return null;

  const steps = [
    { key: "text", count: plan.text, label: t("project.generateShots") },
    { key: "frame", count: plan.frame, label: t("project.batchGenerateFrames") },
    { key: "prompt", count: plan.prompt, label: t("project.batchGenerateVideoPrompts") },
    { key: "video", count: plan.video, label: t("project.batchGenerateVideos") },
  ];

  const hasAny = steps.some((s) => s.count > 0);

  return (
    <Dialog open={open} onOpenChange={executing ? undefined : onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("project.autoRun")}</DialogTitle>
            <DialogDescription>
              {hasAny
                ? t("storyboard.autoRunDesc")
                : t("storyboard.autoRunNothing")}
            </DialogDescription>
          </DialogHeader>

          {hasAny && (
            <div className="space-y-2 py-2">
              {steps.map((step) => (
                <div
                  key={step.key}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                    step.count > 0
                      ? "bg-primary/5 border border-primary/10"
                      : "bg-[--surface] border border-transparent"
                  }`}
                >
                  {step.count > 0 ? (
                    <Circle className="h-4 w-4 text-primary flex-shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  )}
                  <span className={`flex-1 text-sm ${step.count > 0 ? "text-[--text-primary]" : "text-[--text-muted] line-through"}`}>
                    {step.label}
                  </span>
                  {step.count > 0 && (
                    <span className="text-xs font-medium text-primary">
                      {step.count} shots
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <DialogClose>
              <Button variant="outline" size="sm" disabled={executing}>
                {t("common.cancel")}
              </Button>
            </DialogClose>
            {hasAny && (
              <Button size="sm" onClick={onConfirm} disabled={executing}>
                {executing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                {executing ? t("common.generating") : t("project.autoRun")}
              </Button>
            )}
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
