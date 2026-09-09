import {
  EVENT_SEQ,
  type RunEvent,
  type RunFailure,
  type RunStage,
} from "./runs";

export type WorkflowRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type RunStatusView =
  | { state: "in_progress"; stage: RunStage; since: string }
  | { state: "done"; completedAt: string }
  | { state: "failed"; failure: RunFailure; at: string };

function startedSequence(event: RunEvent): number {
  if (event.status !== "started") return -1;
  return EVENT_SEQ[`${event.stage}:started`];
}

export function deriveRunStatus(
  events: RunEvent[],
  workflowStatus: WorkflowRunStatus | null,
): RunStatusView | null {
  const failed = events.find((event) => event.status === "failed");
  if (failed) {
    return {
      state: "failed",
      failure: {
        stage: failed.stage,
        reason: failed.reason ?? "unknown",
        detail: failed.detail ?? "",
        logsUrl: failed.logsUrl ?? null,
      },
      at: failed.at,
    };
  }

  const completed = events.find(
    (event) => event.stage === "upload" && event.status === "completed",
  );
  if (completed) {
    return { state: "done", completedAt: completed.at };
  }

  const current = events
    .filter((event) => event.status === "started")
    .sort((left, right) => startedSequence(right) - startedSequence(left))[0];

  if (
    workflowStatus === "failed" ||
    workflowStatus === "cancelled" ||
    workflowStatus === "completed"
  ) {
    return {
      state: "failed",
      failure: {
        stage: current?.stage ?? "scope",
        reason: "workflow-crashed",
        detail: `Workflow ended with status ${workflowStatus} before recording a terminal event.`,
        logsUrl: null,
      },
      at: current?.at ?? new Date(0).toISOString(),
    };
  }

  if (current) {
    return {
      state: "in_progress",
      stage: current.stage,
      since: current.at,
    };
  }

  if (workflowStatus === "pending" || workflowStatus === "running") {
    return {
      state: "in_progress",
      stage: "scope",
      since: new Date(0).toISOString(),
    };
  }

  return null;
}
