"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleX,
  ExternalLink,
  LoaderCircle,
} from "lucide-react";

import { DemoPlayer } from "@/components/demo-player";
import { RecordingConfig } from "@/components/recording-config";
import { RunMetadata } from "@/components/run-metadata";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import {
  phaseList,
  type Phase,
  type PhaseView,
} from "@/lib/storage/phases";
import type { RunView } from "@/lib/storage/run-view";
import { matchFeatureTag } from "@/lib/trigger/tag";

const PHASE_LABEL: Record<Phase, string> = {
  scoping: "Scoping",
  provisioning: "Provisioning",
  exploring: "Exploring",
  recording: "Recording",
  uploading: "Uploading",
};

const ACTIVE_COPY: Record<Phase, string> = {
  scoping: "Scoping the demo",
  provisioning: "Provisioning the sandbox",
  exploring: "Exploring the preview",
  recording: "Recording in progress",
  uploading: "Uploading the recording",
};

function displayTitle(view: RunView): string {
  if (view.demo) return view.demo.demoTitle;
  if (view.record?.demo) return view.record.demo.title;
  if (view.record) {
    const tag = matchFeatureTag(view.record.pr.title);
    return tag.matched ? tag.title : view.record.pr.title;
  }
  return "Starting run";
}

function timestamp(iso: string): string {
  return `${new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(iso))} UTC`;
}

function PhaseIcon({ state }: Pick<PhaseView, "state">) {
  const className = "size-4 shrink-0";
  switch (state) {
    case "complete":
      return (
        <CheckCircle2
          className={`${className} text-emerald-400`}
          aria-hidden="true"
        />
      );
    case "active":
      return (
        <LoaderCircle
          className={`${className} animate-spin text-amber-400`}
          aria-hidden="true"
        />
      );
    case "failed":
      return (
        <CircleX
          className={`${className} text-rose-400`}
          aria-hidden="true"
        />
      );
    case "pending":
      return (
        <Circle
          className={`${className} text-muted-foreground/50`}
          aria-hidden="true"
        />
      );
  }
}

function PhaseRows({ phases }: { phases: PhaseView[] }) {
  return (
    <ol className="space-y-0">
      {phases.map(({ phase, state }) => (
        <li
          key={phase}
          className={`flex items-center gap-3 border-b px-2 py-3 last:border-b-0 ${
            state === "active" || state === "failed" ? "bg-muted/40" : ""
          }`}
        >
          <PhaseIcon state={state} />
          <span className="flex-1 font-medium">{PHASE_LABEL[phase]}</span>
          <span className="text-xs capitalize text-muted-foreground">
            {state}
          </span>
        </li>
      ))}
    </ol>
  );
}

function PhaseStatus({
  view,
  phases,
}: {
  view: RunView;
  phases: PhaseView[];
}) {
  if (view.status.state === "done") {
    return (
      <Collapsible className="rounded-xl border">
        <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-lg px-4 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <ChevronRight
            className="size-4 transition-transform group-aria-expanded:rotate-90"
            aria-hidden="true"
          />
          <span className="font-medium">
            {phases.length}/{phases.length} phases complete
          </span>
          <time
            dateTime={view.status.completedAt}
            className="ml-auto text-xs text-muted-foreground"
          >
            {timestamp(view.status.completedAt)}
          </time>
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t px-4">
          <PhaseRows phases={phases} />
        </CollapsibleContent>
      </Collapsible>
    );
  }

  const active = phases.find(({ state }) => state === "active");

  return (
    <Card className="grid overflow-hidden md:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.6fr)]">
      <div className="p-4 sm:p-5">
        <p className="mb-2 text-xs text-muted-foreground">Run phases</p>
        <PhaseRows phases={phases} />
      </div>
      <div className="flex min-h-64 items-center border-t p-6 sm:p-10 md:border-t-0 md:border-l">
        {view.status.state === "failed" ? (
          <FailureAlert view={view} phases={phases} />
        ) : active ? (
          <div className="max-w-sm space-y-4">
            <LoaderCircle
              className="size-5 animate-spin text-amber-400"
              aria-hidden="true"
            />
            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-tight">
                {ACTIVE_COPY[active.phase]}
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                The demo will appear here when the recording is uploaded.
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                This page updates automatically.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function FailureAlert({
  view,
  phases,
}: {
  view: RunView;
  phases: PhaseView[];
}) {
  if (view.status.state !== "failed") return null;
  const failedPhase = phases.find(({ state }) => state === "failed");
  const logsUrl = view.logsUrl ?? view.status.failure.logsUrl;

  return (
    <div className="max-w-lg space-y-4">
      <CircleX className="size-5 text-rose-400" aria-hidden="true" />
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">
          Failed during{" "}
          {failedPhase ? PHASE_LABEL[failedPhase.phase].toLowerCase() : "run"}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          <code className="font-mono text-foreground">
            {view.status.failure.reason}
          </code>
          {view.status.failure.detail
            ? ` — ${view.status.failure.detail}`
            : null}
        </p>
      </div>
      {logsUrl || view.transcriptUrl ? (
        <p className="flex flex-wrap gap-4 text-sm">
          {logsUrl ? (
            <a
              href={logsUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              Run log ↗
            </a>
          ) : null}
          {view.transcriptUrl ? (
            <a
              href={view.transcriptUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              Exploration transcript ↗
            </a>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

export function RunStatus({ initialView }: { initialView: RunView }) {
  const [view, setView] = useState(initialView);
  const [pollError, setPollError] = useState<string | null>(null);
  const shouldPoll =
    view.status.state === "in_progress" ||
    (view.status.state === "done" && view.demo === null);

  useEffect(() => {
    if (!shouldPoll) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const response = await fetch(`/api/runs/${view.runId}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`Status request returned ${response.status}`);
        }
        const nextView = (await response.json()) as RunView;
        if (!cancelled) {
          setView(nextView);
          setPollError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setPollError(
            error instanceof Error ? error.message : "Status request failed",
          );
        }
      } finally {
        if (!cancelled) timer = setTimeout(poll, 3_000);
      }
    }

    timer = setTimeout(poll, 3_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [shouldPoll, view.runId]);

  const phases = phaseList(
    view.record?.mode ?? "explore-and-record",
    view.status,
  );

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-5 py-8 sm:px-8 sm:py-10">
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">Reels / Run details</p>
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              {displayTitle(view)}
            </h1>
            <RunMetadata
              record={view.record}
              status={view.status}
            />
          </div>
          {view.record?.previewUrl ? (
            <a
              href={view.record.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Visit preview
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          ) : null}
        </div>
      </div>

      {pollError ? (
        <Alert>
          <AlertTitle>Live status update delayed</AlertTitle>
          <AlertDescription>
            {pollError}. Preview Reel will keep trying.
          </AlertDescription>
        </Alert>
      ) : null}

      {view.demo ? <DemoPlayer demo={view.demo} /> : null}
      <PhaseStatus view={view} phases={phases} />

      {view.status.state === "done" && !view.demo ? (
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <Skeleton className="mx-auto aspect-video w-full max-w-xl" />
            <p className="text-sm text-muted-foreground">Finalizing upload</p>
          </CardContent>
        </Card>
      ) : null}

      {view.configUrl ? (
        <RecordingConfig configUrl={view.configUrl} />
      ) : null}
    </main>
  );
}
