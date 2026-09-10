import {
  ExternalLink,
  GitPullRequest,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { DemoMetadata } from "@/lib/storage/metadata";
import type { RunRecord } from "@/lib/storage/runs";

function relativeTime(iso: string): string {
  const seconds = Math.round((Date.parse(iso) - Date.now()) / 1_000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

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

export function RunMetadata({
  record,
  demo,
}: {
  record: RunRecord | null;
  demo: DemoMetadata | null;
}) {
  if (!record) {
    return (
      <p className="text-sm text-muted-foreground">
        Run details are being initialized.
      </p>
    );
  }

  const repo = `${record.identity.owner}/${record.identity.repo}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <a
          href={record.pr.htmlUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
        >
          <GitPullRequest className="size-4" aria-hidden="true" />
          {repo} #{record.identity.prNumber}
        </a>
        <code className="font-mono text-xs">{record.commitSha.slice(0, 7)}</code>
        <a
          href={record.previewUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
        >
          Preview deployment
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
        <Badge variant="outline">
          {record.mode === "record-only" ? "Record only" : "Full pipeline"}
        </Badge>
        <time
          dateTime={record.startedAt}
          title={new Date(record.startedAt).toISOString()}
          suppressHydrationWarning
        >
          Started {relativeTime(record.startedAt)}
        </time>
      </div>

      {demo ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>Duration {duration(demo.timings.totalMs)}</span>
          <span>Model cost {cost(demo.modelCostUsd)}</span>
        </div>
      ) : null}

      {record.thinInput ? (
        <p className="text-sm text-muted-foreground">
          PR body was empty; scoping used the title and diff only.
        </p>
      ) : null}
    </div>
  );
}
