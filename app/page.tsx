import { EmptyState } from "@/components/empty-state";
import { GalleryGrid } from "@/components/gallery-grid";
import { SiteHeader } from "@/components/site-header";
import { listCompletedDemos } from "@/lib/storage/runs";

export const dynamic = "force-dynamic";

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
          </div>
          <GalleryGrid demos={demos} />
        </main>
      ) : (
        <EmptyState />
      )}
    </>
  );
}
