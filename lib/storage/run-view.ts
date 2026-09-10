import { getRun } from "workflow/api";

import {
  readConfigUrl,
  readDemoForRun,
  readExploreTranscriptUrl,
  readRunEvents,
  readRunLogsUrl,
  readRunRecord,
  type RunRecord,
} from "./runs";
import {
  deriveRunStatus,
  type RunStatusView,
  type WorkflowRunStatus,
} from "./status";
import type { DemoMetadata } from "./metadata";

export interface RunView {
  runId: string;
  record: RunRecord | null;
  status: RunStatusView;
  demo: DemoMetadata | null;
  configUrl: string | null;
  logsUrl: string | null;
  transcriptUrl: string | null;
}

export async function loadRunView(runId: string): Promise<RunView | null> {
  const [record, events, logsUrl, transcriptUrl] = await Promise.all([
    readRunRecord(runId),
    readRunEvents(runId),
    readRunLogsUrl(runId),
    readExploreTranscriptUrl(runId),
  ]);
  let status = deriveRunStatus(events, null);
  const needsWorkflowStatus =
    status === null ||
    (process.env.NODE_ENV !== "development" &&
      status.state === "in_progress");
  if (needsWorkflowStatus) {
    const workflowStatus: WorkflowRunStatus | null =
      await getRun(runId).status.catch(() => null);
    status = deriveRunStatus(events, workflowStatus);
  }
  if (!status) return null;

  const [demo, configUrl] = record
    ? await Promise.all([
        readDemoForRun(record),
        readConfigUrl(record.identity),
      ])
    : [null, null];

  return {
    runId,
    record,
    status,
    demo,
    configUrl,
    logsUrl,
    transcriptUrl,
  };
}
