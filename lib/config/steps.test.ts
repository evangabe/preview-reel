import { describe, expect, it } from "vitest";

import { entryUrl, extractSteps, splitPlaceholders } from "./steps";

describe("splitPlaceholders", () => {
  it("separates ${VAR} tokens from literal text in order", () => {
    expect(
      splitPlaceholders("/api/demo-login?token=${DEMO_LOGIN_TOKEN}&next=%2F"),
    ).toEqual([
      { text: "/api/demo-login?token=", placeholder: false },
      { text: "${DEMO_LOGIN_TOKEN}", placeholder: true },
      { text: "&next=%2F", placeholder: false },
    ]);
  });

  it("leaves text without placeholders as one literal run", () => {
    expect(splitPlaceholders("plain")).toEqual([
      { text: "plain", placeholder: false },
    ]);
  });
});

describe("entryUrl", () => {
  it("prefers an absolute video url", () => {
    expect(entryUrl({ url: "https://a.test/x" }, "https://b.test")).toBe(
      "https://a.test/x",
    );
  });

  it("resolves a relative video url against baseUrl", () => {
    expect(entryUrl({ url: "/login" }, "https://b.test/")).toBe(
      "https://b.test/login",
    );
  });

  it("returns null when neither is present", () => {
    expect(entryUrl({}, undefined)).toBeNull();
  });
});

describe("extractSteps", () => {
  it("carries the entry url alongside each video's steps", () => {
    const result = extractSteps(
      JSON.stringify({
        videos: { demo: { url: "https://a.test/?t=${TOKEN}", steps: [] } },
      }),
    );
    expect(result).toEqual({
      ok: true,
      videos: [{ name: "demo", entryUrl: "https://a.test/?t=${TOKEN}", steps: [] }],
    });
  });
});
