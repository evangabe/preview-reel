import { afterEach, describe, expect, it, vi } from "vitest";

import { appBaseUrl } from "./env";

afterEach(() => vi.unstubAllEnvs());

describe("appBaseUrl", () => {
  it("uses the configured production URL", () => {
    vi.stubEnv("APP_BASE_URL", "https://preview-reel.vercel.app/");
    expect(appBaseUrl()).toBe("https://preview-reel.vercel.app");
  });

  it("uses localhost off platform", () => {
    vi.stubEnv("APP_BASE_URL", "");
    expect(appBaseUrl()).toBe("http://localhost:3000");
  });
});
