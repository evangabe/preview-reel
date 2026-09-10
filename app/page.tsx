import { EmptyState } from "@/components/empty-state";
import { GalleryTable } from "@/components/gallery-table";
import { SiteHeader } from "@/components/site-header";
import { sumReportedCosts } from "@/lib/ai/model";
import { formatCost } from "@/lib/format";
import { listCompletedDemos } from "@/lib/storage/runs";

export const dynamic = "force-dynamic";

function summaryLine(demos: { modelCostUsd: number | null }[]): string {
  const reels = `${demos.length} ${demos.length === 1 ? "reel" : "reels"}`;
  const spend = sumReportedCosts(...demos.map((demo) => demo.modelCostUsd));
  return spend === null
    ? reels
    : `${reels} · ${formatCost(spend)} in model spend for these reels`;
}

export default async function GalleryPage() {
  const demos = await listCompletedDemos();

  return (
    <>
      <SiteHeader />
      {demos.length > 0 ? (
        <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-12 sm:px-8">
          <div className="mb-8 max-w-2xl">
            <p className="mb-3 text-sm font-medium text-muted-foreground">
              Preview deployments, made watchable
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Your preview reels
            </h1>
            <p className="mt-3 text-base text-muted-foreground">
              Demos recorded from [feat] PRs on their Vercel preview
              deployments.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {summaryLine(demos)}
            </p>
          </div>
          <GalleryTable demos={demos} />
        </main>
      ) : (
        <EmptyState />
      )}
    </>
  );
}
