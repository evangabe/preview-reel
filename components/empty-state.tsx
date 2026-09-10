export function EmptyState() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-16 sm:px-8">
      <p className="mb-3 text-sm font-medium text-muted-foreground">
        Preview Reel
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">
        No preview reels yet
      </h1>
      <p className="mt-4 text-muted-foreground">
        Preview Reel records a short demo of a feature on its Vercel preview
        deployment. It posts the result to the pull request and keeps the
        recording here.
      </p>
      <ol className="mt-8 list-decimal space-y-3 pl-5 text-sm text-muted-foreground">
        <li>Deploy the target app to a Vercel project in the same team as Preview Reel.</li>
        <li>
          Generate a Protection Bypass for Automation secret on the target
          project and copy it into <code>VERCEL_PROTECTION_BYPASS</code>.
        </li>
        <li>
          Add <code>owner/repo</code> to <code>PREVIEW_REEL_REPOS</code>. Do not
          add Preview Reel&apos;s own repo, or it will process its own
          deployments.
        </li>
        <li>
          Create a fine-grained PAT scoped to that repo; set{" "}
          <code>GITHUB_TOKEN</code>.
        </li>
        <li>
          Target app exposes{" "}
          <code>/api/demo-login?token=...&amp;next=...</code>, which validates
          the token, sets the session cookie, and redirects. Set that same
          token as <code>DEMO_LOGIN_TOKEN</code>. No credential pair, no
          scripted login.
        </li>
        <li>Open a PR titled <code>[feat] ...</code>.</li>
      </ol>
      <p className="mt-8 text-sm font-medium">
        Open a PR titled <code>[feat] …</code> and the demo appears here.
      </p>
    </main>
  );
}
