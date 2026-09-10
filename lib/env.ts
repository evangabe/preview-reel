// Boot-time environment validation (R-CFG.1). A missing secret should
// fail at startup, not in the third stage of a run.
//
// The two groups below fail for different reasons and are fixed in
// different places, so they carry different messages. A missing
// GITHUB_TOKEN means "add a variable"; a missing VERCEL_OIDC_TOKEN means
// "turn a project setting on" — telling someone to paste an OIDC token
// into the dashboard sends them toward a value that expires in 12 hours.

/** Secrets set by hand, in the Vercel dashboard or `.env.local`. */
const MANUAL = [
  "VERCEL_WEBHOOK_SECRET",
  "PREVIEW_REEL_REPOS",
  "GITHUB_TOKEN",
  "VERCEL_PROTECTION_BYPASS",
  "DEMO_LOGIN_TOKEN",
  "AI_GATEWAY_API_KEY",
  "SANDBOX_SNAPSHOT_ID",
  "APP_BASE_URL",
] as const;

/** Injected by the platform once the matching resource is connected. */
const INJECTED: Record<string, string> = {
  BLOB_READ_WRITE_TOKEN:
    "connect a Blob store to this project (Storage -> Blob -> Connect Project)",
};

// VERCEL_OIDC_TOKEN is deliberately absent from both lists. It is a build-time
// and local-development variable only: deployed functions never see it on
// `process.env`, and the Sandbox SDK acquires it out of band. Requiring it here
// 500s every dynamic route in production. Locally it does arrive on
// `process.env` via `vercel env pull`, so it is checked off-platform only.
const LOCAL_ONLY: Record<string, string> = {
  VERCEL_OIDC_TOKEN:
    "run `vercel env pull` (the token expires after 12 hours, so re-pull on " +
    "Sandbox auth errors)",
};

export type Env = Record<(typeof MANUAL)[number] | keyof typeof INJECTED, string>;

export function appBaseUrl(): string {
  const configured = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "");
  return configured || "http://localhost:3000";
}

/**
 * Throws if anything is missing, naming every absent variable at once —
 * a validator that reports one missing secret per restart turns setup
 * into six deploys.
 */
export function assertEnv(): Env {
  const problems: string[] = [];

  for (const name of MANUAL) {
    if (!process.env[name]) {
      problems.push(`${name} is not set — add it to the environment`);
    }
  }

  const injected = process.env.VERCEL
    ? INJECTED
    : { ...INJECTED, ...LOCAL_ONLY };

  for (const [name, remedy] of Object.entries(injected)) {
    if (!process.env[name]) {
      problems.push(`${name} is not set — ${remedy}`);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Preview Reel is missing required configuration:\n${problems
        .map((p) => `  - ${p}`)
        .join("\n")}\nSee .env.example and README.md.`,
    );
  }

  return process.env as unknown as Env;
}
