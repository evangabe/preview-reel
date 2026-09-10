import { describe, expect, it } from "vitest";

import { commentMarker, renderComment } from "./render";

const statusUrl = "https://preview-reel.vercel.app/runs/wrun_1";
const baseUrl = "http://localhost:3000";

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
    expect(output).toContain("### Preview reels");
    expect(output).toContain("| Reel status | Details |");
    expect(output).toContain(
      "| In progress | Recording **Low-stock filter** on the preview.",
    );
    expect(output).toContain(`[Watch progress](${statusUrl})`);
    expect(output).toContain(`[Preview Reel](${baseUrl})`);
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
    expect(output).toContain("| Ready | **Low-stock filter** |");
    expect(output).toContain(
      `[Watch the demo](${statusUrl}) · [View the recording config]`,
    );
    expect(output).toContain(`[Preview Reel](${baseUrl})`);
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
    expect(output).toContain(
      "[View logs](https://blob.example/logs.jsonl) · [Retry]",
    );
    expect(output).toContain("```text\nThe filter control was not found.\n```");
    expect(output).toContain(`[Preview Reel](${baseUrl})`);
    expect(output).not.toContain("Run log and re-run");
    expect(humanCopy(output)).not.toContain("!");
  });

  it("keeps failure URLs inside the details code block", () => {
    const output = renderComment(2, {
      state: "failed",
      title: "Low-stock filter",
      statusUrl,
      failure: {
        stage: "record",
        reason: "navigation-failed",
        detail: "Navigation failed at https://target.example/preview?token=abc.",
        logsUrl: "https://blob.example/logs.jsonl",
      },
    });

    expect(output).toContain(
      "```text\nNavigation failed at https://target.example/preview?token=abc.\n```",
    );
    expect(output).not.toContain(
      "Navigation failed at [https://target.example/preview",
    );
    expect(humanCopy(output)).not.toContain("!");
  });
});
