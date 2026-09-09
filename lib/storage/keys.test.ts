import { describe, expect, it } from "vitest";

import {
  demoArtifactKeys,
  demoPrefix,
  deploymentSentinelKey,
  prDemosPrefix,
  prRunIndexKey,
  prRunsPrefix,
  runExploreTranscriptKey,
  runEventKey,
  runEventsPrefix,
  runLogsKey,
  runRecordKey,
} from "./keys";

const identity = {
  owner: "evangabe",
  repo: "preview-reel-target",
  prNumber: 1,
  deploymentId: "dpl_abc123",
  runId: "wfr_123",
};

describe("demo artifact keys", () => {
  it("builds immutable, run-scoped artifact paths", () => {
    expect(demoPrefix(identity)).toBe(
      "demos/evangabe/preview-reel-target/pr-1/dpl_abc123/wfr_123",
    );
    expect(demoArtifactKeys(identity)).toEqual({
      config:
        "demos/evangabe/preview-reel-target/pr-1/dpl_abc123/wfr_123/config.json",
      video:
        "demos/evangabe/preview-reel-target/pr-1/dpl_abc123/wfr_123/video.mp4",
      poster:
        "demos/evangabe/preview-reel-target/pr-1/dpl_abc123/wfr_123/poster.png",
      metadata:
        "demos/evangabe/preview-reel-target/pr-1/dpl_abc123/wfr_123/metadata.json",
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
    expect(() => demoPrefix({ ...identity, runId: "by-pr" })).toThrow(
      /safe Blob path/,
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
    expect(runExploreTranscriptKey("wfr_123")).toBe(
      "runs/wfr_123/explore-transcript.jsonl",
    );
  });

  it("builds PR indexes and run record prefixes", () => {
    expect(prDemosPrefix(identity)).toBe(
      "demos/evangabe/preview-reel-target/pr-1/",
    );
    expect(prRunsPrefix(identity)).toBe(
      "runs/by-pr/evangabe/preview-reel-target/pr-1/",
    );
    expect(prRunIndexKey(identity, "wfr_123")).toBe(
      "runs/by-pr/evangabe/preview-reel-target/pr-1/wfr_123.json",
    );
    expect(runRecordKey("wfr_123")).toBe("runs/wfr_123/run.json");
    expect(runEventsPrefix("wfr_123")).toBe("runs/wfr_123/events/");
  });

  it("rejects unsafe identities, stages, and sequence overflow", () => {
    expect(() => deploymentSentinelKey("../dpl")).toThrow(/safe Blob path/);
    expect(() => runEventKey("wfr_123", 10_000, "done")).toThrow(/sequence/);
    expect(() => runEventKey("wfr_123", 1, "Recording")).toThrow(/stage/);
    expect(() => runRecordKey("by-pr")).toThrow(/safe Blob path/);
  });
});
