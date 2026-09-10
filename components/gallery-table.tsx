"use client";

import { GitPullRequest, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { groupByRecency, type DemoMetadata } from "@/lib/storage/metadata";

function relativeTime(iso: string): string {
  const seconds = Math.round((Date.parse(iso) - Date.now()) / 1_000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

function matchesQuery(demo: DemoMetadata, query: string): boolean {
  const haystack = [
    demo.demoTitle,
    demo.prTitle,
    demo.repo,
    `#${demo.prNumber}`,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

export function GalleryTable({ demos }: { demos: DemoMetadata[] }) {
  const [query, setQuery] = useState("");
  const filteredDemos = useMemo(
    () => demos.filter((demo) => matchesQuery(demo, query)),
    [demos, query],
  );
  const groups = useMemo(
    () => groupByRecency(filteredDemos, new Date()),
    [filteredDemos],
  );

  return (
    <div className="space-y-10">
      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <label htmlFor="gallery-search" className="sr-only">
          Search preview reels
        </label>
        <Input
          id="gallery-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search reels"
          className="h-10 pl-9"
        />
      </div>

      {groups.length > 0 ? (
        groups.map((group) => (
          <section key={group.label} aria-labelledby={`group-${group.label}`}>
            <h2
              id={`group-${group.label}`}
              className="mb-4 text-sm font-medium text-muted-foreground"
            >
              {group.label}
            </h2>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  {group.label} preview reels
                </caption>
                <tbody className="divide-y">
                  {group.demos.map((demo) => (
                    <tr
                      key={demo.runId}
                      className="group transition-colors hover:bg-muted/50"
                    >
                      <td className="w-28 py-3 pl-3 sm:w-36 sm:pl-4">
                        <Link
                          href={`/runs/${demo.runId}`}
                          className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`Open ${demo.demoTitle}`}
                        >
                          <div className="relative aspect-video overflow-hidden rounded-md bg-muted">
                            <Image
                              src={demo.artifacts.posterUrl}
                              alt=""
                              fill
                              sizes="144px"
                              loader={({ src }) => src}
                              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                            />
                          </div>
                        </Link>
                      </td>
                      <td className="px-3 py-3 sm:px-4">
                        <Link
                          href={`/runs/${demo.runId}`}
                          className="font-medium leading-snug outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {demo.demoTitle}
                        </Link>
                      </td>
                      <td className="px-2 py-3 sm:px-4">
                        <a
                          href={demo.prUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <GitPullRequest
                            className="size-4"
                            aria-hidden="true"
                          />
                          <span className="hidden sm:inline">
                            {demo.repo}{" "}
                          </span>
                          #{demo.prNumber}
                        </a>
                      </td>
                      <td className="whitespace-nowrap py-3 pr-3 text-right text-muted-foreground sm:pr-4">
                        <time
                          dateTime={demo.generatedAt}
                          suppressHydrationWarning
                        >
                          {relativeTime(demo.generatedAt)}
                        </time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      ) : (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No reels match “{query}”.
        </p>
      )}
    </div>
  );
}
