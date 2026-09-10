import { SiteHeader } from "@/components/site-header";
import { Skeleton } from "@/components/ui/skeleton";

function LoadingRow() {
  return (
    <div className="flex items-center gap-3 border-b px-3 py-3 last:border-b-0 sm:gap-4 sm:px-4">
      <Skeleton className="aspect-video w-28 shrink-0 rounded-md sm:w-36" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="hidden h-4 w-28 sm:block" />
      <Skeleton className="ml-auto h-4 w-20" />
    </div>
  );
}

export default function GalleryLoading() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-12 sm:px-8">
        <div className="mb-8 max-w-2xl">
          <Skeleton className="mb-3 h-4 w-48" />
          <Skeleton className="h-10 w-72" />
          <Skeleton className="mt-3 h-5 w-full max-w-lg" />
        </div>
        <Skeleton className="mb-10 h-10 w-full max-w-md" />
        <div className="space-y-8">
          {["Today", "Past week", "Earlier"].map((label) => (
            <section key={label}>
              <Skeleton className="mb-4 h-4 w-20" />
              <div className="overflow-hidden rounded-xl border">
                {Array.from({ length: 2 }, (_, index) => (
                  <LoadingRow key={index} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
