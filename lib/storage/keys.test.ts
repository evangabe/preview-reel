import { describe, expect, it } from "vitest";

import {
  demoArtifactKeys,
  demoPrefix,
  deploymentSentinelKey,
  runEventKey,
  runLogsKey,
} from "./keys";

const identity = {
  owner: "evangabe",
  repo: "preview-reel-target",
  prNumber: 1,
  deploymentId: "dpl_abc123",
};

describe("demo artifact keys", () => {
  it("builds the R-6.1 paths from stable identity fields", () => {
    expect(demoPrefix(identity)).toBe(
      "demos/evangabe/preview-reel-target/pr-1/dpl_abc123",
    );
    expect(demoArtifactKeys(identity)).toEqual({
      config:
        "demos/evangabe/preview-reel-target/pr-1/dpl_abc123/config.json",
      video: "demos/evangabe/preview-reel-target/pr-1/dpl_abc123/video.mp4",
      poster: "demos/evangabe/preview-reel-target/pr-1/dpl_abc123/poster.png",
      metadata:
        "demos/evangabe/preview-reel-target/pr-1/dpl_abc123/metadata.json",
    });
  });

  it("rejects path traversal and invalid PR numbers", () => {
    expect(() => demoPrefix({ ...identity, owner: ".." })).toThrow(
      /safe Blob path/,
    );
    expect(() => demoPrefix({ ...identity, repo: "a/b" })).toThrow(
      /safe Blob path/,
    );
    expect(() => demoPrefix({ ...identity, prNumber: 0 })).toThrow(
      /positive integer/,
    );
  });
});

describe("run keys", () => {
  it("builds deployment sentinels and lexically ordered events", () => {
    expect(deploymentSentinelKey("dpl_abc123")).toBe(
      "runs/dpl_abc123/sentinel.json",
    );
    expect(runEventKey("wfr_123", 7, "recording")).toBe(
      "runs/wfr_123/events/0007-recording.json",
    );
    expect(runLogsKey("wfr_123")).toBe("runs/wfr_123/logs.jsonl");
  });

  it("rejects unsafe identities, stages, and sequence overflow", () => {
    expect(() => deploymentSentinelKey("../dpl")).toThrow(/safe Blob path/);
    expect(() => runEventKey("wfr_123", 10_000, "done")).toThrow(/sequence/);
    expect(() => runEventKey("wfr_123", 1, "Recording")).toThrow(/stage/);
  });
});
