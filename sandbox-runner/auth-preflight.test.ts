import { describe, expect, it } from "vitest";

import {
  classifyAuthHop,
  followAuthChain,
  substitutePlaceholders,
} from "./auth-preflight";

const origin = "https://preview-reel-target-abc.vercel.app";
const login = `${origin}/api/demo-login?token=x&next=%2F`;

describe("substitutePlaceholders", () => {
  it("fills known names from env and leaves unknown tokens as written", () => {
    expect(
      substitutePlaceholders("/x?a=${DEMO_LOGIN_TOKEN}&b=${NOPE}", {
        DEMO_LOGIN_TOKEN: "t0k",
      }),
    ).toBe("/x?a=t0k&b=${NOPE}");
  });
});

describe("classifyAuthHop", () => {
  it("names the Vercel SSO wall as preview-protected", () => {
    expect(
      classifyAuthHop({
        url: login,
        status: 302,
        location: "https://vercel.com/sso-api?url=…&nonce=…",
      }),
    ).toBe("preview-protected");
  });

  it("treats a 401 from the demo login route as a token problem", () => {
    expect(classifyAuthHop({ url: login, status: 401, location: null })).toBe(
      "login-failed",
    );
  });

  it("treats a 401 from anywhere else as the platform wall", () => {
    expect(
      classifyAuthHop({ url: `${origin}/`, status: 401, location: null }),
    ).toBe("preview-protected");
  });

  it("treats a same-origin redirect to /login as a token problem", () => {
    expect(
      classifyAuthHop({ url: login, status: 302, location: "/login" }),
    ).toBe("login-failed");
  });

  it("lets the cookie hop and the post-login redirect through", () => {
    expect(
      classifyAuthHop({
        url: `${login}&x-vercel-protection-bypass=s`,
        status: 307,
        location: "/api/demo-login?next=%2F&token=x",
      }),
    ).toBe("ok");
    expect(classifyAuthHop({ url: login, status: 302, location: "/" })).toBe(
      "ok",
    );
    expect(classifyAuthHop({ url: `${origin}/`, status: 200, location: null })).toBe(
      "ok",
    );
  });
});

function responses(
  script: Array<{ status: number; location?: string; setCookie?: string[] }>,
) {
  const seen: Array<{ url: string; cookie: string | undefined }> = [];
  let index = 0;
  const fetchImpl = async (
    url: string,
    init: { headers: Record<string, string> },
  ) => {
    seen.push({ url, cookie: init.headers.cookie });
    const step = script[index] ?? { status: 200 };
    index += 1;
    return {
      status: step.status,
      headers: {
        get: (name: string) =>
          name === "location" ? (step.location ?? null) : null,
        getSetCookie: () => step.setCookie ?? [],
      },
    };
  };
  return { fetchImpl, seen };
}

describe("followAuthChain", () => {
  it("carries the bypass cookie into the next hop and ends ok", async () => {
    const { fetchImpl, seen } = responses([
      {
        status: 307,
        location: "/api/demo-login?next=%2F&token=x",
        setCookie: ["_vercel_jwt=abc; Path=/; HttpOnly"],
      },
      { status: 302, location: "/" },
      { status: 200 },
    ]);
    await expect(followAuthChain(login, fetchImpl)).resolves.toBe("ok");
    expect(seen[1]?.cookie).toBe("_vercel_jwt=abc");
    expect(seen).toHaveLength(3);
  });

  it("stops at the first wall", async () => {
    const { fetchImpl, seen } = responses([
      { status: 302, location: "https://vercel.com/sso-api?url=x" },
    ]);
    await expect(followAuthChain(login, fetchImpl)).resolves.toBe(
      "preview-protected",
    );
    expect(seen).toHaveLength(1);
  });

  it("propagates network failure so the caller can skip, not fail", async () => {
    const fetchImpl = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(followAuthChain(login, fetchImpl)).rejects.toThrow(
      "fetch failed",
    );
  });
});
