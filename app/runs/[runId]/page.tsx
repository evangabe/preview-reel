// Status + player page (R-8.2, R-8.3). Build order step 4.
// TODO: live-updating stage list (provisioning/exploring/recording/
// uploading), then the mp4 + poster + collapsed config once done, and the
// three-state failure view (stage, reason, logsUrl, re-run link).
export default async function RunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Run {runId}</h1>
      <p className="max-w-md text-sm text-zinc-500">
        Status page scaffold — not yet wired to the Workflow.
      </p>
    </main>
  );
}
