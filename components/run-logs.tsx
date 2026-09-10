"use client";

import { useEffect, useState } from "react";

import { Disclosure } from "@/components/disclosure";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLazyText } from "@/components/use-lazy-text";
import { formatLogTime, parseLogLines } from "@/lib/logs/parse";

export function RunLogs({
  logsUrl,
  inProgress,
}: {
  logsUrl: string | null;
  inProgress: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { state, loadOnce, retry } = useLazyText(logsUrl);

  useEffect(() => {
    if (open && logsUrl !== null && state.status === "idle") {
      loadOnce();
    }
  }, [loadOnce, logsUrl, open, state.status]);

  const availability = inProgress
    ? "Not saved yet"
    : logsUrl
      ? "Saved output"
      : "Unavailable";

  return (
    <Disclosure
      title="Run logs"
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) loadOnce();
      }}
      trailing={availability}
    >
      {logsUrl === null && inProgress ? (
        <p className="text-sm text-muted-foreground">
          Logs are saved after the runner finishes. They will appear here once
          the run ends.
        </p>
      ) : null}
      {logsUrl === null && !inProgress ? (
        <p className="text-sm text-muted-foreground">
          No run log was saved for this run.
        </p>
      ) : null}
      {logsUrl !== null && (state.status === "idle" || state.status === "loading") ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading run logs">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-5/6" />
        </div>
      ) : null}
      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Run log unavailable</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{state.message}</p>
            <Button variant="outline" size="sm" onClick={() => void retry()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {state.status === "ok" ? <LogContent text={state.text} /> : null}
    </Disclosure>
  );
}

function LogContent({ text }: { text: string }) {
  if (text.trim() === "") {
    return (
      <p className="text-sm text-muted-foreground">
        The runner produced no output.
      </p>
    );
  }

  const lines = parseLogLines(text);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Saved after the runner finishes.
      </p>
      <ol aria-label="Run log lines" className="space-y-3">
        {lines.map((line, index) => (
          <li
            key={`${line.at ?? "line"}-${index}`}
            className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1"
          >
            {line.at ? (
              <time
                dateTime={line.at}
                className="whitespace-nowrap font-mono text-xs text-muted-foreground"
              >
                {formatLogTime(line.at)}
              </time>
            ) : (
              <span aria-hidden="true" />
            )}
            <pre className="min-w-0 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
              {line.data}
            </pre>
          </li>
        ))}
      </ol>
    </div>
  );
}
