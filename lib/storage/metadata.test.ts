import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  demoMetadataSchema,
  groupByRecency,
  newestPerPr,
  type DemoMetadata,
} from "./metadata";

const base: DemoMetadata = {
  runId: "wrun_fixture",
  repo: "evangabe/preview-reel-target",
  prNumber: 1,
  prTitle: "Bulk select and CSV export",
  demoTitle: "Bulk select and CSV export",
  featureSlug: "bulk-select-csv-export",
  deploymentId: "dpl_preview_fixture",
  deploymentUrl: "https://preview.example.com",
  commitSha: "a".repeat(40),
  prUrl: "https://github.com/evangabe/preview-reel-target/pull/1",
  status: "completed",
  mode: "record-only",
  timings: {
    provisionMs: 1_000,
    exploreMs: null,
    recordMs: 10_050,
    totalMs: 11_050,
  },
  model: { id: "openai/gpt-5.6-luna", reasoningEffort: "medium" },
  modelCostUsd: null,
  logsUrl: "https://blob.example.com/logs.jsonl",
  generatedAt: "2026-09-09T17:07:00.000Z",
  artifacts: {
    configUrl: "https://blob.example.com/config.json",
    videoUrl: "https://blob.example.com/video.mp4",
    posterUrl: "https://blob.example.com/poster.png",
  },
};

describe("demoMetadataSchema", () => {
  it("parses the sample-run fixture", async () => {
    const fixture = JSON.parse(
      await readFile("fixtures/sample-run/metadata.json", "utf8"),
    );

    expect(demoMetadataSchema.safeParse(fixture).success).toBe(true);
  });

  it("rejects metadata without artifact URLs", () => {
    const { artifacts: _artifacts, ...incomplete } = base;
    expect(demoMetadataSchema.safeParse(incomplete).success).toBe(false);
  });

  it("reads objects written before the model field as model: null", () => {
    const { model: _model, ...legacy } = base;
    const parsed = demoMetadataSchema.safeParse(legacy);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.model).toBeNull();
  });

  it("still rejects unknown keys alongside the defaulted model", () => {
    expect(
      demoMetadataSchema.safeParse({ ...base, extra: true }).success,
    ).toBe(false);
  });

  it("rejects a model with an unknown reasoning effort", () => {
    expect(
      demoMetadataSchema.safeParse({
        ...base,
        model: { id: "openai/gpt-5.6-luna", reasoningEffort: "max" },
      }).success,
    ).toBe(false);
  });
});

describe("groupByRecency", () => {
  it("groups demos under today, past week, and earlier in that order", () => {
    const now = new Date(2026, 8, 9, 12);
    const demos = [
      { ...base, runId: "today", generatedAt: new Date(2026, 8, 9, 11).toISOString() },
      { ...base, runId: "week", generatedAt: new Date(2026, 8, 6, 12).toISOString() },
      { ...base, runId: "earlier", generatedAt: new Date(2026, 7, 10, 12).toISOString() },
    ];

    expect(groupByRecency(demos, now).map(({ label }) => label)).toEqual([
      "Today",
      "Past week",
      "Earlier",
    ]);
  });
});

describe("newestPerPr", () => {
  it("keeps the latest run per repo and PR, sorted newest first", () => {
    const demos = [
      { ...base, runId: "old", generatedAt: "2026-09-08T12:00:00.000Z" },
      { ...base, runId: "new", generatedAt: "2026-09-09T12:00:00.000Z" },
      {
        ...base,
        runId: "other",
        prNumber: 2,
        generatedAt: "2026-09-10T12:00:00.000Z",
      },
    ];

    expect(newestPerPr(demos).map(({ runId }) => runId)).toEqual([
      "other",
      "new",
    ]);
  });
});
