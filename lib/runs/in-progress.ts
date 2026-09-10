import { getRun } from "workflow/api";

import type { PrIdentity } from "@/lib/storage/keys";
import { listRunIdsForPr } from "@/lib/storage/runs";

// Only the run index pointers written in this window are consulted; an
// older pointer belongs to a run that has long since finished or died.
const FRESH_WINDOW_MS = 15 * 60_000;

/**
 * Run ID of a pending/running run for this PR that started in the last 15
 * minutes, or null. A Workflow lookup that fails counts as not running.
 */
export async function findInProgressRun(
  identity: PrIdentity,
): Promise<string | null> {
  const pointers = await listRunIdsForPr(identity);
  const cutoff = Date.now() - FRESH_WINDOW_MS;
  const fresh = pointers.filter(
    (pointer) => Date.parse(pointer.claimedAt) > cutoff,
  );
  const statuses = await Promise.all(
    fresh.map(async (pointer) => ({
      runId: pointer.runId,
      status: await getRun(pointer.runId).status.catch(() => "failed" as const),
    })),
  );
  const active = statuses.find(
    ({ status }) => status === "pending" || status === "running",
  );
  return active?.runId ?? null;
}
