import { Triangle } from "lucide-react";
import Link from "next/link";

function targetRepo(): string | null {
  return (
    process.env.PREVIEW_REEL_REPOS?.split(",")
      .map((repo) => repo.trim())
      .find(Boolean) ?? null
  );
}

export function SiteHeader() {
  const repo = targetRepo();

  return (
    <header className="border-b">
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-semibold tracking-tight">
            Preview Reel
          </Link>
          <span aria-hidden="true" className="text-muted-foreground/50">
            /
          </span>
          <Link
            href="/"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Reels
          </Link>
        </div>
        {repo ? (
          <a
            href={`https://github.com/${repo}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-xs text-foreground transition-colors hover:text-muted-foreground"
          >
            <Triangle
              className="size-3 fill-current"
              aria-hidden="true"
            />
            {repo}
          </a>
        ) : null}
      </div>
    </header>
  );
}
