import { describe, expect, it } from "vitest";

import {
  exploreInputSchema,
  initialWaitError,
  isNotFoundSnapshot,
  redact,
} from "./explore";

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

describe("redact", () => {
  it("redacts a token that ends a URL inside a nested JSON string", () => {
    // The browser parked on the login route after a 401: the token is the
    // last query param and the URL sits inside a serialized snapshot.
    const snapshot = JSON.stringify({
      origin: "https://t.example/api/demo-login?next=%2F&token=s3cret",
    });
    const event = redact({ type: "initial-state", snapshot }, ["s3cret"]);

    expect(event).toEqual({
      type: "initial-state",
      snapshot: JSON.stringify({
        origin: "https://t.example/api/demo-login?next=%2F&token=<redacted>",
      }),
    });
  });

  it("redacts known secrets and query values that are not followed by &", () => {
    expect(
      redact(
        { url: "https://t.example/x?x-vercel-protection-bypass=abc", key: "k3y" },
        ["k3y"],
      ),
    ).toEqual({
      url: "https://t.example/x?x-vercel-protection-bypass=<redacted>",
      key: "<redacted>",
    });
  });
});

describe("isNotFoundSnapshot", () => {
  it("recognizes the standard Next.js not-found snapshot", () => {
    expect(
      isNotFoundSnapshot(
        '- heading "404" [level=1]\n- heading "This page could not be found." [level=2]',
      ),
    ).toBe(true);
  });

  it("does not treat an ordinary page containing 404 as not found", () => {
    expect(isNotFoundSnapshot("- heading \"Order 404\" [level=2]")).toBe(false);
  });
});

describe("initialWaitError", () => {
  it("rejects a first wait for content absent from the initial snapshot", () => {
    expect(
      initialWaitError(
        [{ action: "wait", text: "8 Low" }],
        "Showing 12 of 12",
      ),
    ).toContain("Cause the state with a click, key, or type step");
  });

  it("allows a first wait for content already visible initially", () => {
    expect(
      initialWaitError(
        [{ action: "wait", text: "Inventory" }],
        "heading Inventory",
      ),
    ).toBeNull();
  });
});
