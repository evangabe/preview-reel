import { describe, expect, it } from "vitest";

import { formatCost, formatDuration } from "./format";

describe("formatDuration", () => {
  it("renders seconds under a minute and m/s above", () => {
    expect(formatDuration(11_050)).toBe("11s");
    expect(formatDuration(95_400)).toBe("1m 35s");
  });
});

describe("formatCost", () => {
  it("keeps six decimals under a cent and four above", () => {
    expect(formatCost(0.000323)).toBe("$0.000323");
    expect(formatCost(0.0125)).toBe("$0.0125");
  });

  it("never invents a number when nothing was reported", () => {
    expect(formatCost(null)).toBe("not reported");
  });
});
