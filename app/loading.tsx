import { SiteHeader } from "@/components/site-header";
import { Skeleton } from "@/components/ui/skeleton";

function LoadingCard() {
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-2/3" />
      </div>
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
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <LoadingCard key={index} />
          ))}
        </div>
      </main>
    </>
  );
}
