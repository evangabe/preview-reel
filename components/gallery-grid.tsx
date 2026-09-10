"use client";

import { Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  groupByRecency,
  type DemoMetadata,
} from "@/lib/storage/metadata";

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

export function GalleryGrid({ demos }: { demos: DemoMetadata[] }) {
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
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {group.demos.map((demo) => (
                <Link
                  key={demo.runId}
                  href={`/runs/${demo.runId}`}
                  className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Card className="h-full transition-shadow group-hover:shadow-md">
                    <div className="relative aspect-video overflow-hidden bg-muted">
                      <Image
                        src={demo.artifacts.posterUrl}
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
                        loader={({ src }) => src}
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    </div>
                    <div className="space-y-2 p-4">
                      <h3 className="line-clamp-2 font-medium leading-snug">
                        {demo.demoTitle}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {demo.repo} #{demo.prNumber} ·{" "}
                        <time
                          dateTime={demo.generatedAt}
                          suppressHydrationWarning
                        >
                          {relativeTime(demo.generatedAt)}
                        </time>
                      </p>
                    </div>
                  </Card>
                </Link>
              ))}
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
