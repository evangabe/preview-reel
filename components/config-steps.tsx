"use client";

import { ChevronRight } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  actionLabel,
  primaryValue,
  stepDescription,
  type VideoSteps,
} from "@/lib/config/steps";

function StepRow({ index, step }: { index: number; step: unknown }) {
  const { label, known } = actionLabel(step);
  const value = primaryValue(step);
  const description = stepDescription(step);

  return (
    <Collapsible render={<li />} className="border-b last:border-b-0">
      <CollapsibleTrigger className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-4 rounded-lg px-2 py-3 text-left text-sm outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="w-6 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {index}
        </span>
        <span className="min-w-0 flex-1">
          <span className={known ? "font-medium" : "font-mono"}>{label}</span>
          {description ? (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {description}
            </span>
          ) : null}
        </span>
        {value ? (
          <span className="max-w-[45%] truncate font-mono text-xs text-muted-foreground">
            {value}
          </span>
        ) : null}
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground transition-transform group-aria-expanded:rotate-90"
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-4 pl-10">
        <p className="mb-2 text-xs text-muted-foreground">Parameters</p>
        <pre className="overflow-x-auto rounded-lg bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
          {JSON.stringify(step, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ConfigSteps({ videos }: { videos: VideoSteps[] }) {
  return (
    <div className="space-y-6">
      {videos.map((video) => (
        <section key={video.name} className="space-y-3">
          <h3 className="font-mono text-sm">{video.name}</h3>
          <p className="text-xs text-muted-foreground">
            Configured actions in replay order. Expand a step to inspect its
            parameters.
          </p>
          {video.steps.length > 0 ? (
            <ol aria-label={`Steps for ${video.name}`}>
              {video.steps.map((step, index) => (
                <StepRow key={index} index={index + 1} step={step} />
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">
              This video has no steps.
            </p>
          )}
        </section>
      ))}
      <p className="text-xs text-muted-foreground">
        Screenshot steps describe capture actions; output filenames are
        configuration values.
      </p>
    </div>
  );
}
