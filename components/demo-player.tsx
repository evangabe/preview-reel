import { ExternalLink } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { DemoMetadata } from "@/lib/storage/metadata";

function duration(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1_000);
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function cost(value: number | null): string {
  if (value === null) return "not reported";
  return `$${value.toFixed(value < 0.01 ? 6 : 4)}`;
}

export function DemoPlayer({ demo }: { demo: DemoMetadata }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="grid lg:grid-cols-[minmax(0,1.7fr)_minmax(240px,0.8fr)]">
        <video
          controls
          preload="metadata"
          poster={demo.artifacts.posterUrl}
          src={demo.artifacts.videoUrl}
          aria-label={`${demo.demoTitle} recording`}
          className="aspect-video w-full bg-black object-contain"
        >
          This browser cannot play the recorded MP4.
        </video>
        <aside className="border-t p-5 sm:p-6 lg:border-t-0 lg:border-l">
          <p className="text-xs text-muted-foreground">Source</p>
          <a
            href={demo.prUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-muted-foreground"
          >
            {demo.repo} #{demo.prNumber}
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
          <dl className="mt-7 space-y-5">
            <div>
              <dt className="text-xs text-muted-foreground">Commit</dt>
              <dd className="mt-2 font-mono text-sm">
                {demo.commitSha.slice(0, 7)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Pipeline duration
              </dt>
              <dd className="mt-2 text-sm">{duration(demo.timings.totalMs)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Model cost</dt>
              <dd className="mt-2 text-sm">{cost(demo.modelCostUsd)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Mode</dt>
              <dd className="mt-2 text-sm">
                {demo.mode === "record-only" ? "Record only" : "Full pipeline"}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </Card>
  );
}
