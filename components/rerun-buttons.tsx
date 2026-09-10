"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { RunMode } from "@/lib/storage/runs";

type Notice =
  | { kind: "in-progress"; runId: string }
  | { kind: "error"; message: string };

const NO_CONFIG = "No config was produced";

export function RerunButtons({
  runId,
  configUrl,
}: {
  runId: string;
  configUrl: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<RunMode | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function rerun(mode: RunMode) {
    if (pending) return;
    setPending(mode);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/runs/${encodeURIComponent(runId)}/rerun`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        runId?: string;
        error?: string;
        detail?: string;
      };
      if (response.status === 202 && body.runId) {
        router.push(`/runs/${encodeURIComponent(body.runId)}`);
        return;
      }
      if (response.status === 409 && body.error === "run-in-progress" && body.runId) {
        setNotice({ kind: "in-progress", runId: body.runId });
        return;
      }
      setNotice({
        kind: "error",
        message:
          body.detail ?? body.error ?? `Re-run request returned ${response.status}`,
      });
    } catch (error) {
      setNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Re-run request failed",
      });
    } finally {
      setPending(null);
    }
  }

  const busy = pending !== null;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || configUrl === null}
          title={configUrl === null ? NO_CONFIG : undefined}
          onClick={() => rerun("record-only")}
        >
          {pending === "record-only" ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <RotateCcw aria-hidden="true" />
          )}
          Re-run recording
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => rerun("explore-and-record")}
        >
          {pending === "explore-and-record" ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <RotateCcw aria-hidden="true" />
          )}
          Re-run full pipeline
        </Button>
      </div>
      {configUrl === null ? (
        <p className="text-xs text-muted-foreground">
          {NO_CONFIG}; only the full pipeline can re-run.
        </p>
      ) : null}
      {notice?.kind === "in-progress" ? (
        <p className="text-xs text-muted-foreground" role="status">
          A run for this PR is already in progress.{" "}
          <Link
            href={`/runs/${encodeURIComponent(notice.runId)}`}
            className="text-foreground underline underline-offset-4"
          >
            Open it
          </Link>
        </p>
      ) : null}
      {notice?.kind === "error" ? (
        <p className="text-xs text-destructive" role="alert">
          {notice.message}
        </p>
      ) : null}
    </div>
  );
}
