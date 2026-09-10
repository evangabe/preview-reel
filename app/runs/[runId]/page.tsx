import { notFound } from "next/navigation";

import { RunStatus } from "@/components/run-status";
import { SiteHeader } from "@/components/site-header";
import { loadRunView } from "@/lib/storage/run-view";

export const dynamic = "force-dynamic";

export default async function RunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const view = await loadRunView(runId);
  if (!view) notFound();

  return (
    <>
      <SiteHeader />
      <RunStatus initialView={view} />
    </>
  );
}
