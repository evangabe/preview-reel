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

  for (let attempt = 1; attempt <= 2; attempt += 1) {
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
      const reason = /oidc|jwt|token.*expir|expir.*token/i.test(detail)
        ? "oidc-expired"
        : "create-failed";
      if (reason === "create-failed" && attempt === 1 && !signal?.aborted) {
        continue;
      }
      throw new RunnerFailure("provision", reason, detail);
    }
  }

  throw new RunnerFailure(
    "provision",
    "create-failed",
    "Sandbox provisioning exhausted its retry",
  );
}
