import { useState, useEffect } from "react";
import {
  Loader2,
  CheckCircle2,
  Circle,
  XCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { ShotAsset } from "@/stores/project-store";

// Local shape compatible with legacy rendering code, built from ShotAsset.
export interface RefImage {
  id: string;
  type: "first_frame" | "last_frame" | "reference" | "video" | "ref_video";
  prompt: string;
  imagePath?: string;
  status: "pending" | "generated";
  characters?: string[];
  sceneName?: string;
  model?: { providerId: string; modelId: string };
  history?: string[];
  /** Parallel array to history: shot_assets row IDs for each historical version */
  historyIds?: string[];
}

export function assetToRefImage(a: ShotAsset, allAssets: ShotAsset[] = []): RefImage {
  const typeMap: Record<ShotAsset["type"], RefImage["type"]> = {
    first_frame: "first_frame",
    last_frame: "last_frame",
    reference: "reference",
    keyframe_video: "video",
    reference_video: "ref_video",
  };
  const siblings = allAssets
    .filter((x) => x.type === a.type && x.sequenceInType === a.sequenceInType)
    .sort((x, y) => x.assetVersion - y.assetVersion);
  const historyUrls = siblings.map((s) => s.fileUrl).filter((u): u is string => !!u);
  const historyIds = siblings.filter((s) => !!s.fileUrl).map((s) => s.id);
  return {
    id: a.id,
    type: typeMap[a.type],
    prompt: a.prompt ?? "",
    imagePath: a.fileUrl ?? undefined,
    status: a.status === "completed" && a.fileUrl ? "generated" : "pending",
    characters: a.characters ?? undefined,
    sceneName: a.meta?.sceneName,
    model: a.modelProvider && a.modelId ? { providerId: a.modelProvider, modelId: a.modelId } : undefined,
    history: historyUrls,
    historyIds,
  };
}

export type StepState = "done" | "generating" | "error" | "idle";

export function StepIndicator({ state }: { state: StepState }) {
  if (state === "done") return <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />;
  if (state === "generating") return <Loader2 className="h-4 w-4 text-primary animate-spin flex-shrink-0" />;
  if (state === "error") return <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />;
  return <Circle className="h-4 w-4 text-[--text-muted] flex-shrink-0" />;
}

export function StepRow({
  label,
  state,
  children,
  defaultOpen = false,
  isNext = false,
}: {
  label: string;
  state: StepState;
  children: React.ReactNode;
  defaultOpen?: boolean;
  isNext?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen || isNext);

  useEffect(() => {
    if (isNext) setOpen(true);
  }, [isNext]);

  return (
    <div className={`rounded-xl border transition-colors ${
      isNext
        ? "border-primary/30 bg-primary/3"
        : state === "done"
          ? "border-emerald-100 bg-emerald-50/40"
          : state === "error"
            ? "border-destructive/20 bg-destructive/3"
            : "border-[--border-subtle] bg-[--surface]/50"
    }`}>
      <button
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <StepIndicator state={state} />
        <span className={`flex-1 text-[13px] font-medium ${
          isNext ? "text-primary" : state === "done" ? "text-emerald-700" : "text-[--text-secondary]"
        }`}>
          {label}
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-[--text-muted]" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-[--text-muted]" />
        )}
      </button>
      {open && (
        <div className="border-t border-[--border-subtle] px-3 pb-3 pt-2.5">
          {children}
        </div>
      )}
    </div>
  );
}
