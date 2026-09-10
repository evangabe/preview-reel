import { describe, expect, it } from "vitest";

import { recordingFailure } from "./record";

describe("recordingFailure", () => {
  it("reports a timed-out wait as an assertion timeout", () => {
    expect(
      recordingFailure(
        'Step 0 (wait) failed at https://target.example/: Timeout waiting for text "8 Low"',
      ),
    ).toMatchObject({
      stage: "record",
      reason: "assertion-timeout",
    });
  });

  it("keeps navigation errors as navigation failures", () => {
    expect(
      recordingFailure("Navigation failed: net::ERR_NAME_NOT_RESOLVED"),
    ).toMatchObject({
      stage: "record",
      reason: "navigation-failed",
    });
  });
});
