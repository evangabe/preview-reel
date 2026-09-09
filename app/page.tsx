// Gallery (R-8.1). Placeholder scaffold — real grid, search, empty/loading/
// failure states land in build-order step 4 (see docs/spec.md §12).
export default function GalleryPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Preview Reel
      </h1>
      <p className="max-w-md text-sm text-zinc-500">
        Gallery scaffold. Demos will appear here once the pipeline records
        its first run.
      </p>
    </main>
  );
}
