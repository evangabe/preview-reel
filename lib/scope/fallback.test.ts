import { describe, expect, it } from "vitest";

import { fallbackDemoSpec } from "./fallback";

describe("fallbackDemoSpec", () => {
  it("strips the trigger tag and derives a stable slug", () => {
    expect(
      fallbackDemoSpec({ title: " [Feature] Bulk select & CSV export " }),
    ).toEqual({
      title: "Bulk select & CSV export",
      featureSlug: "bulk-select-csv-export",
      entryPoint: null,
      intent: "Bulk select & CSV export",
      reason: "model scoping not yet enabled",
    });
  });

  it("rejects a tag with no usable feature title", () => {
    expect(() => fallbackDemoSpec({ title: "[feat]  " })).toThrow();
  });
});
