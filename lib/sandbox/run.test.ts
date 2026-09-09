import { describe, expect, it } from "vitest";

import { redactRunnerOutput } from "./run";

describe("redactRunnerOutput", () => {
  it("redacts known secrets and credential query parameters", () => {
    const output =
      "key=known-secret " +
      "https://preview.example/api/demo-login?token=login-value" +
      "&x-vercel-protection-bypass=bypass-value&next=/";

    const redacted = redactRunnerOutput(output, ["known-secret"]);

    expect(redacted).not.toContain("known-secret");
    expect(redacted).not.toContain("login-value");
    expect(redacted).not.toContain("bypass-value");
    expect(redacted).toContain("key=<redacted>");
    expect(redacted).toContain("token=<redacted>");
    expect(redacted).toContain("x-vercel-protection-bypass=<redacted>");
  });

  it("does not let an empty secret corrupt every character", () => {
    expect(redactRunnerOutput("ordinary output", [""])).toBe(
      "ordinary output",
    );
  });
});
