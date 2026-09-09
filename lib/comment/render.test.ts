import { describe, expect, it } from "vitest";

import { commentMarker, renderComment } from "./render";

const statusUrl = "https://preview-reel.vercel.app/runs/wrun_1";

function humanCopy(output: string): string {
  return output
    .replace(commentMarker(2), "")
    .replace("![", "[");
}

describe("renderComment", () => {
  it("renders progress with the marker on line one", () => {
    const output = renderComment(2, {
      state: "in_progress",
      title: "Low-stock filter",
      statusUrl,
    });
    expect(output.split("\n")[0]).toBe(commentMarker(2));
    expect(output).toContain("Recording a demo of **Low-stock filter**");
    expect(output).toContain(`[Watch progress](${statusUrl})`);
    expect(humanCopy(output)).not.toContain("!");
  });

  it("renders a linked poster and config for completion", () => {
    const output = renderComment(2, {
      state: "done",
      title: "Low-stock filter",
      statusUrl,
      posterUrl: "https://blob.example/poster.png",
      configUrl: "https://blob.example/config.json",
    });
    expect(output.split("\n")[0]).toBe(commentMarker(2));
    expect(output).toContain(
      `[![Low-stock filter](https://blob.example/poster.png)](${statusUrl})`,
    );
    expect(output).toContain(
      "[View the recording config](https://blob.example/config.json)",
    );
    expect(humanCopy(output)).not.toContain("!");
  });

  it("renders a specific staged failure through the status page", () => {
    const output = renderComment(2, {
      state: "failed",
      title: "Low-stock filter",
      statusUrl,
      failure: {
        stage: "record",
        reason: "element-not-found",
        detail: "The filter control was not found.",
        logsUrl: "https://blob.example/logs.jsonl",
      },
    });
    expect(output.split("\n")[0]).toBe(commentMarker(2));
    expect(output).toContain(
      "failed during **record**: element-not-found",
    );
    expect(output).toContain(`[Run log and re-run](${statusUrl})`);
    expect(output).not.toContain("logs.jsonl");
    expect(humanCopy(output)).not.toContain("!");
  });
});
