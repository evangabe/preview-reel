/**
 * Before `webreel record`, resolve the entry URL and walk its redirect chain
 * so an auth wall is reported as an auth wall (R-3.6), not as the first
 * step's "element not found".
 *
 * Observed against the target (DECISIONS `[Auth wall]`):
 *   wrong bypass secret → 302 to https://vercel.com/sso-api?…
 *   good bypass         → 307 back to the same path (Vercel sets the bypass
 *                         cookie and strips its params) → app responds
 *   wrong login token   → 401 from /api/demo-login
 *   good login token    → 302 / → 200
 *
 * The cookie from the 307 must be carried forward or the next hop lands on
 * the SSO wall and misreports the reason.
 */

export type AuthHop = {
  /** URL that was requested for this hop. Never logged: it carries secrets. */
  url: string;
  status: number;
  location: string | null;
};

export type AuthVerdict =
  | "ok"
  | "preview-protected"
  | "login-failed"
  | "application-auth-failed";

export const AUTH_FAILURE_DETAIL: Record<
  Exclude<AuthVerdict, "ok">,
  string
> = {
  "preview-protected":
    "Preview deployment is protected — check the bypass secret.",
  "login-failed":
    "Target app rejected the demo login token — check DEMO_LOGIN_TOKEN.",
  "application-auth-failed":
    "Target app rejected the entrypoint request — check the app's auth or API credentials.",
};

const LOGIN_ROUTE = "/api/demo-login";
const MAX_HOPS = 5;
const HOP_TIMEOUT_MS = 10_000;

function isVercelHost(hostname: string): boolean {
  return hostname === "vercel.com" || hostname.endsWith(".vercel.com");
}

/** Replaces `${NAME}` with `env[NAME]`; unknown names are left as written. */
export function substitutePlaceholders(
  text: string,
  env: Record<string, string | undefined>,
): string {
  return text.replace(/\$\{([A-Z0-9_]+)\}/g, (token, name: string) =>
    env[name] ?? token,
  );
}

export function classifyAuthHop(hop: AuthHop): AuthVerdict {
  const requested = new URL(hop.url);

  if (hop.status >= 300 && hop.status < 400 && hop.location) {
    const target = new URL(hop.location, requested);
    if (isVercelHost(target.hostname)) return "preview-protected";
    if (target.origin === requested.origin && target.pathname === "/login") {
      return "login-failed";
    }
    return "ok";
  }

  if (hop.status === 401 || hop.status === 403) {
    // The app's own login route rejecting us is a token problem. A direct
    // 401/403 from any other route is app-level auth, not the Vercel wall:
    // Vercel's wall redirects to vercel.com and is handled above.
    return requested.pathname.startsWith(LOGIN_ROUTE)
      ? "login-failed"
      : "application-auth-failed";
  }

  return "ok";
}

type FetchLike = (
  url: string,
  init: { redirect: "manual"; headers: Record<string, string>; signal: AbortSignal },
) => Promise<{
  status: number;
  headers: { get(name: string): string | null; getSetCookie(): string[] };
}>;

/**
 * Follows up to five hops with `redirect: "manual"` and a minimal cookie
 * jar, classifying each. Resolves "ok" when the chain ends without a wall.
 * Rejects on network failure or timeout; callers must not fail the run on
 * that — the preflight sharpens a reason, it does not add a new way to fail.
 */
export async function followAuthChain(
  entryUrl: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<AuthVerdict> {
  const cookies = new Map<string, string>();
  let url = entryUrl;

  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    const headers: Record<string, string> = { accept: "text/html" };
    if (cookies.size > 0) {
      headers.cookie = [...cookies]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
    }
    const response = await fetchImpl(url, {
      redirect: "manual",
      headers,
      signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
    });
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }

    const location = response.headers.get("location");
    const verdict = classifyAuthHop({ url, status: response.status, location });
    if (verdict !== "ok") return verdict;
    if (response.status < 300 || response.status >= 400 || !location) {
      return "ok";
    }
    url = new URL(location, url).toString();
  }
  return "ok";
}
