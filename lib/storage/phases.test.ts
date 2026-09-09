import { describe, expect, it } from "vitest";

import { phaseList } from "./phases";

describe("phaseList", () => {
  it("marks earlier phases complete and the current phase active", () => {
    expect(
      phaseList("explore-and-record", {
        state: "in_progress",
        stage: "record",
        since: "2026-09-09T12:00:00.000Z",
      }),
    ).toEqual([
      { phase: "scoping", state: "complete" },
      { phase: "provisioning", state: "complete" },
      { phase: "exploring", state: "complete" },
      { phase: "recording", state: "active" },
      { phase: "uploading", state: "pending" },
    ]);
  });

  it("omits exploration from record-only runs", () => {
    expect(
      phaseList("record-only", {
        state: "in_progress",
        stage: "record",
        since: "2026-09-09T12:00:00.000Z",
      }).map(({ phase }) => phase),
    ).toEqual(["scoping", "provisioning", "recording", "uploading"]);
  });

  it("marks a failed phase and leaves later phases pending", () => {
    expect(
      phaseList("explore-and-record", {
        state: "failed",
        failure: {
          stage: "explore",
          reason: "feature-not-found",
          detail: "Could not locate feature in the UI",
          logsUrl: null,
        },
        at: "2026-09-09T12:00:00.000Z",
      }),
    ).toEqual([
      { phase: "scoping", state: "complete" },
      { phase: "provisioning", state: "complete" },
      { phase: "exploring", state: "failed" },
      { phase: "recording", state: "pending" },
      { phase: "uploading", state: "pending" },
    ]);
  });

  it("marks every phase complete when the run is done", () => {
    expect(
      phaseList("explore-and-record", {
        state: "done",
        completedAt: "2026-09-09T12:00:00.000Z",
      }).every(({ state }) => state === "complete"),
    ).toBe(true);
  });
});
