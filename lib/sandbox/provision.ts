import { Sandbox } from "@vercel/sandbox";

import { RunnerFailure } from "../../sandbox-runner/failure";

const RUN_TIMEOUT_MS = 5 * 60 * 1_000;

export async function provisionSandbox(signal?: AbortSignal): Promise<Sandbox> {
  const snapshotId = process.env.SANDBOX_SNAPSHOT_ID;
  if (!snapshotId) {
    throw new RunnerFailure(
      "provision",
      "snapshot-missing",
      "SANDBOX_SNAPSHOT_ID is not set",
    );
  }

  try {
    return await Sandbox.create({
      source: { type: "snapshot", snapshotId },
      timeout: RUN_TIMEOUT_MS,
      persistent: false,
      region: "iad1",
      resources: { vcpus: 4 },
      tags: { purpose: "preview-reel-run" },
      signal,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new RunnerFailure(
      "provision",
      /oidc|jwt|token.*expir|expir.*token/i.test(detail)
        ? "oidc-expired"
        : "create-failed",
      detail,
    );
  }
}
