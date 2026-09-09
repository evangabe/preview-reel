import { describe, expect, it } from "vitest";

import type { RunEvent } from "./runs";
import { deriveRunStatus } from "./status";

const event = (
  stage: RunEvent["stage"],
  status: RunEvent["status"],
  at: string,
  extra: Partial<RunEvent> = {},
): RunEvent => ({ stage, status, at, ...extra });

describe("deriveRunStatus", () => {
  it("returns null when neither storage nor Workflow knows the run", () => {
    expect(deriveRunStatus([], null)).toBeNull();
  });

  it("reports a pending run at scope before its first event arrives", () => {
    expect(deriveRunStatus([], "pending")).toMatchObject({
      state: "in_progress",
      stage: "scope",
    });
  });

  it("uses the highest-sequence started event regardless of input order", () => {
    const status = deriveRunStatus(
      [
        event("record", "started", "2026-09-09T12:03:00.000Z"),
        event("scope", "started", "2026-09-09T12:01:00.000Z"),
        event("provision", "started", "2026-09-09T12:02:00.000Z"),
      ],
      "running",
    );

    expect(status).toEqual({
      state: "in_progress",
      stage: "record",
      since: "2026-09-09T12:03:00.000Z",
    });
  });

  it("lets a persisted failure win over all other state", () => {
    const status = deriveRunStatus(
      [
        event("upload", "completed", "2026-09-09T12:04:00.000Z"),
        event("record", "failed", "2026-09-09T12:03:00.000Z", {
          reason: "record-failed",
          detail: "Recorder exited 1",
          logsUrl: "https://blob.example/logs",
        }),
      ],
      "completed",
    );

    expect(status).toEqual({
      state: "failed",
      failure: {
        stage: "record",
        reason: "record-failed",
        detail: "Recorder exited 1",
        logsUrl: "https://blob.example/logs",
      },
      at: "2026-09-09T12:03:00.000Z",
    });
  });

  it("reports an upload completion as done", () => {
    expect(
      deriveRunStatus(
        [event("upload", "completed", "2026-09-09T12:04:00.000Z")],
        "completed",
      ),
    ).toEqual({
      state: "done",
      completedAt: "2026-09-09T12:04:00.000Z",
    });
  });

  it.each(["failed", "cancelled", "completed"] as const)(
    "turns terminal Workflow status %s without a terminal event into a named failure",
    (workflowStatus) => {
      const status = deriveRunStatus(
        [event("explore", "started", "2026-09-09T12:02:00.000Z")],
        workflowStatus,
      );

      expect(status).toMatchObject({
        state: "failed",
        failure: {
          stage: "explore",
          reason: "workflow-crashed",
          logsUrl: null,
        },
        at: "2026-09-09T12:02:00.000Z",
      });
    },
  );
});
