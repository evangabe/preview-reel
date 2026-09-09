import { describe, expect, it } from "vitest";

import { exploreInputSchema } from "./explore";

const input = {
  runId: "wfr_123",
  previewUrl: "https://preview.example.com",
  demoSpec: {
    title: "Command menu",
    featureSlug: "command-menu",
    entryPoint: "/",
    intent: "Open the command menu and select an action.",
    reason: "The PR adds the command menu.",
  },
  prDescription: "Press Command-K to open the menu.",
  changedPaths: ["app/page.tsx"],
  outDir: "/vercel/run",
};

describe("exploreInputSchema", () => {
  it("accepts PR description context", () => {
    expect(exploreInputSchema.parse(input).prDescription).toBe(
      input.prDescription,
    );
  });

  it("rejects PR descriptions beyond the bounded context window", () => {
    expect(() =>
      exploreInputSchema.parse({
        ...input,
        prDescription: "x".repeat(10_001),
      }),
    ).toThrow();
  });
});
