import { Triangle } from "lucide-react";
import Link from "next/link";

import { GitHubIcon } from "@/components/icons/github";

export function targetRepo(): string | null {
  return (
    process.env.PREVIEW_REEL_REPOS?.split(",")
      .map((repo) => repo.trim())
      .find(Boolean) ?? null
  );
}

export function SiteHeader() {
  const repo = targetRepo();
  const projectName = repo?.split("/").at(-1) ?? null;
  const projectUrl =
    process.env.TARGET_VERCEL_PROJECT_URL ??
    (projectName ? `https://${projectName}.vercel.app` : null);

  return (
    <header className="border-b">
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-semibold tracking-tight">
            Preview reels
          </Link>
          <span aria-hidden="true" className="text-muted-foreground/50">
            /
          </span>
          {projectUrl && projectName ? (
            <a
              href={projectUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Triangle
                className="size-3 fill-current"
                aria-hidden="true"
              />
              {projectName}
            </a>
          ) : null}
        </div>
        {repo ? (
          <a
            href={`https://github.com/${repo}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-xs text-foreground transition-colors hover:text-muted-foreground"
          >
            <GitHubIcon
              className="size-3.5"
              aria-hidden="true"
            />
            {repo}
          </a>
        ) : null}
      </div>
    </header>
  );
}
