import { afterEach, describe, expect, it, vi } from "vitest";

import { appBaseUrl } from "./env";

afterEach(() => vi.unstubAllEnvs());

describe("appBaseUrl", () => {
  it("uses the platform production host", () => {
    vi.stubEnv(
      "VERCEL_PROJECT_PRODUCTION_URL",
      "preview-reel.vercel.app",
    );
    expect(appBaseUrl()).toBe("https://preview-reel.vercel.app");
  });

  it("uses localhost off platform", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect(appBaseUrl()).toBe("http://localhost:3000");
  });
});
