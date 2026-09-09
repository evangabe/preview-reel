import { describe, expect, it } from "vitest";

import {
  demoSpecSchema,
  webreelConfigSchema,
  webreelStepsSchema,
} from "./schema";

describe("demoSpecSchema", () => {
  it("accepts a grounded demo spec", () => {
    expect(
      demoSpecSchema.parse({
        title: "Bulk select and CSV export",
        featureSlug: "bulk-select-csv-export",
        entryPoint: "/",
        intent: "Select two inventory rows and export them as CSV.",
        reason: "The PR adds bulk selection and an export action.",
      }),
    ).toMatchObject({ featureSlug: "bulk-select-csv-export" });
  });

  it("rejects unstable slugs and cross-origin entry points", () => {
    expect(() =>
      demoSpecSchema.parse({
        title: "Export",
        featureSlug: "Export CSV",
        entryPoint: "//attacker.example",
        intent: "Export rows.",
        reason: "Requested by the PR.",
      }),
    ).toThrow();
  });
});

describe("webreelStepsSchema", () => {
  it("accepts replayable text and stable-selector targets", () => {
    expect(
      webreelStepsSchema.parse([
        { action: "click", selector: '[data-testid="select-P-1001"]' },
        { action: "wait", text: "Export CSV", timeout: 5_000 },
        { action: "click", text: "Export CSV" },
      ]),
    ).toHaveLength(3);
  });

  it("rejects agent-browser refs because WebReel cannot replay them", () => {
    expect(() =>
      webreelStepsSchema.parse([{ action: "click", selector: "@e12" }]),
    ).toThrow(/agent-browser refs/);
  });

  it("enforces the twelve-step budget", () => {
    const steps = Array.from({ length: 13 }, () => ({
      action: "pause" as const,
      ms: 100,
    }));

    expect(() => webreelStepsSchema.parse(steps)).toThrow();
  });
});

describe("webreelConfigSchema", () => {
  it("allows exactly one video", () => {
    const video = {
      url: "https://preview.example/api/demo-login?token=${DEMO_LOGIN_TOKEN}",
      steps: [{ action: "pause" as const, ms: 500 }],
    };

    expect(() =>
      webreelConfigSchema.parse({ videos: { first: video, second: video } }),
    ).toThrow(/exactly one video/);
  });
});
