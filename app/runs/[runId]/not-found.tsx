import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

export default function RunNotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 px-5 py-20 sm:px-8">
        <p className="text-sm font-medium text-muted-foreground">Run not found</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          No run with this ID
        </h1>
        <p className="text-muted-foreground">
          It may have been started on a different deployment of Preview Reel.
        </p>
        <Button render={<Link href="/" />}>Return to the gallery</Button>
      </main>
    </>
  );
}
