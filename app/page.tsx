import { EmptyState } from "@/components/empty-state";
import { GalleryTable } from "@/components/gallery-table";
import { SiteHeader } from "@/components/site-header";
import { sumReportedCosts } from "@/lib/ai/model";
import { formatCost } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { listCompletedDemos } from "@/lib/storage/runs";

export const dynamic = "force-dynamic";

function currentTimestamp(): number {
  return Date.now();
}

function KpiCard({
  label,
  value,
  trend,
}: {
  label: string;
  value: string;
  trend: string;
}) {
  return (
    <Card className="gap-2 p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{trend}</p>
    </Card>
  );
}

export default async function GalleryPage() {
  const demos = await listCompletedDemos();
  const dayAgo = currentTimestamp() - 24 * 60 * 60 * 1_000;
  const recentDemos = demos.filter(
    (demo) => Date.parse(demo.generatedAt) >= dayAgo,
  );
  const totalCost = sumReportedCosts(
    ...demos.map((demo) => demo.modelCostUsd),
  );
  const recentCost = sumReportedCosts(
    ...recentDemos.map((demo) => demo.modelCostUsd),
  );

  return (
    <>
      <SiteHeader />
      {demos.length > 0 ? (
        <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-12 sm:px-8">
          <div className="mb-8 max-w-2xl">
            <p className="mb-3 text-sm font-medium text-muted-foreground">
              Live feature demos for your Vercel Project
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Your preview reels
            </h1>
            <p className="mt-3 text-base text-muted-foreground">
              Use <code className="font-mono">[feat]</code> in PR titles in{" "}
              <code className="font-mono">{"{{repo_name}}"}</code> to create a
              feature demo
            </p>
          </div>
          <div className="mb-8 grid gap-3 sm:grid-cols-2">
            <KpiCard
              label="Reels"
              value={String(demos.length)}
              trend={`+${recentDemos.length} in past 24 hours`}
            />
            <KpiCard
              label="Usage"
              value={formatCost(totalCost)}
              trend={
                recentCost === null
                  ? "No reported spend in past 24 hours"
                  : `${formatCost(recentCost)} in past 24 hours`
              }
            />
          </div>
          <GalleryTable demos={demos} />
        </main>
      ) : (
        <EmptyState />
      )}
    </>
  );
}
