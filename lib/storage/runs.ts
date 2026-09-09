import {
  BlobNotFoundError,
  head,
  list,
  put,
  type PutCommandOptions,
} from "@vercel/blob";

import type { DemoSpec } from "@/lib/scope/schema";

import {
  demoArtifactKeys,
  type DemoIdentity,
  deploymentSentinelKey,
  type PrIdentity,
  prDemosPrefix,
  prRunIndexKey,
  prRunsPrefix,
  runExploreTranscriptKey,
  runEventKey,
  runEventsPrefix,
  runLogsKey,
  runRecordKey,
} from "./keys";

export interface StoredBlob {
  pathname: string;
  url: string;
  downloadUrl: string;
}

export type RunStage =
  | "scope"
  | "comment"
  | "provision"
  | "explore"
  | "record"
  | "upload";

export type RunMode = "explore-and-record" | "record-only";

export type ConfigSource =
  | { kind: "inline"; json: string }
  | { kind: "blob"; url: string };

export interface RunFailure {
  stage: RunStage;
  reason: string;
  detail: string;
  logsUrl: string | null;
}

export interface RunRecord {
  runId: string;
  identity: DemoIdentity;
  previewUrl: string;
  commitSha: string;
  pr: {
    title: string;
    body: string;
    headRef: string;
    htmlUrl: string;
  };
  demo: DemoSpec;
  mode: RunMode;
  thinInput: boolean;
  startedAt: string;
}

export interface RunEvent {
  at: string;
  stage: RunStage;
  status: "started" | "completed" | "failed";
  reason?: string;
  detail?: string;
  logsUrl?: string;
}

export const EVENT_SEQ = {
  "scope:started": 10,
  "comment:started": 20,
  "provision:started": 30,
  "explore:started": 40,
  "record:started": 50,
  "upload:started": 60,
  "upload:completed": 100,
  failed: 100,
} as const;

const PUBLIC_ONCE = {
  access: "public",
  addRandomSuffix: false,
  allowOverwrite: false,
} satisfies PutCommandOptions;

async function putOnce(
  pathname: string,
  body: string | Uint8Array,
  options: PutCommandOptions,
): Promise<{ blob: StoredBlob; created: boolean }> {
  try {
    return { blob: await head(pathname), created: false };
  } catch (error) {
    if (!(error instanceof BlobNotFoundError)) throw error;
  }

  try {
    return {
      blob: await put(
        pathname,
        typeof body === "string" ? body : Buffer.from(body),
        options,
      ),
      created: true,
    };
  } catch (putError) {
    // A concurrent retry can win between head() and put(). In that one case,
    // the immutable object now present is the successful result.
    try {
      return { blob: await head(pathname), created: false };
    } catch {
      throw putError;
    }
  }
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Blob read failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function listAll(prefix: string) {
  const blobs = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, limit: 1_000, cursor });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs.sort((left, right) => left.pathname.localeCompare(right.pathname));
}

export async function persistConfig(
  identity: DemoIdentity,
  config: Uint8Array,
): Promise<StoredBlob> {
  const { blob } = await putOnce(demoArtifactKeys(identity).config, config, {
    ...PUBLIC_ONCE,
    contentType: "application/json; charset=utf-8",
  });
  return blob;
}

export async function persistCompletedArtifacts(
  identity: DemoIdentity,
  input: {
    video: Uint8Array;
    poster: Uint8Array;
    metadata: Record<string, unknown>;
    config: StoredBlob;
  },
) {
  const keys = demoArtifactKeys(identity);
  const [video, poster] = await Promise.all([
    putOnce(keys.video, input.video, {
      ...PUBLIC_ONCE,
      contentType: "video/mp4",
      multipart: input.video.byteLength > 4_500_000,
    }).then(({ blob }) => blob),
    putOnce(keys.poster, input.poster, {
      ...PUBLIC_ONCE,
      contentType: "image/png",
    }).then(({ blob }) => blob),
  ]);
  const { blob: metadata } = await putOnce(
    keys.metadata,
    `${JSON.stringify(
      {
        ...input.metadata,
        artifacts: {
          configUrl: input.config.url,
          videoUrl: video.url,
          posterUrl: poster.url,
        },
      },
      null,
      2,
    )}\n`,
    {
      ...PUBLIC_ONCE,
      contentType: "application/json; charset=utf-8",
    },
  );

  return { config: input.config, video, poster, metadata };
}

export async function appendRunEvent(
  runId: string,
  sequence: number,
  event: RunEvent,
): Promise<StoredBlob> {
  const { blob } = await putOnce(
    runEventKey(runId, sequence, event.stage),
    `${JSON.stringify(event, null, 2)}\n`,
    {
      ...PUBLIC_ONCE,
      contentType: "application/json; charset=utf-8",
      cacheControlMaxAge: 60,
    },
  );
  return blob;
}

export async function persistRunLogs(
  runId: string,
  logs: string,
): Promise<StoredBlob> {
  const { blob } = await putOnce(runLogsKey(runId), logs, {
    ...PUBLIC_ONCE,
    contentType: "application/x-ndjson; charset=utf-8",
    cacheControlMaxAge: 60,
  });
  return blob;
}

export async function persistExploreTranscript(
  runId: string,
  transcript: string | Uint8Array,
): Promise<StoredBlob> {
  const { blob } = await putOnce(runExploreTranscriptKey(runId), transcript, {
    ...PUBLIC_ONCE,
    contentType: "application/x-ndjson; charset=utf-8",
    cacheControlMaxAge: 60,
  });
  return blob;
}

export async function markStage(
  runId: string,
  stage: RunStage,
): Promise<void> {
  await appendRunEvent(runId, EVENT_SEQ[`${stage}:started`], {
    at: new Date().toISOString(),
    stage,
    status: "started",
  });
}

export async function markDone(runId: string): Promise<void> {
  await appendRunEvent(runId, EVENT_SEQ["upload:completed"], {
    at: new Date().toISOString(),
    stage: "upload",
    status: "completed",
  });
}

export async function markFailed(
  runId: string,
  failure: RunFailure,
): Promise<void> {
  await appendRunEvent(runId, EVENT_SEQ.failed, {
    at: new Date().toISOString(),
    stage: failure.stage,
    status: "failed",
    reason: failure.reason,
    detail: failure.detail,
    ...(failure.logsUrl ? { logsUrl: failure.logsUrl } : {}),
  });
}

export async function readRunEvents(runId: string): Promise<RunEvent[]> {
  const blobs = await listAll(runEventsPrefix(runId));
  return Promise.all(blobs.map((blob) => readJson<RunEvent>(blob.url)));
}

export async function claimDeployment(
  deploymentId: string,
  claim: PrIdentity & { claimedAt: string },
): Promise<
  { claimed: true } | { claimed: false; existing: unknown }
> {
  const result = await putOnce(
    deploymentSentinelKey(deploymentId),
    `${JSON.stringify(claim, null, 2)}\n`,
    {
      ...PUBLIC_ONCE,
      contentType: "application/json; charset=utf-8",
      cacheControlMaxAge: 60,
    },
  );
  if (result.created) return { claimed: true };
  return {
    claimed: false,
    existing: await readJson<unknown>(result.blob.url),
  };
}

export async function indexRunForPr(
  identity: PrIdentity,
  runId: string,
  claimedAt: string,
): Promise<void> {
  await putOnce(
    prRunIndexKey(identity, runId),
    `${JSON.stringify({ runId, claimedAt }, null, 2)}\n`,
    {
      ...PUBLIC_ONCE,
      contentType: "application/json; charset=utf-8",
      cacheControlMaxAge: 60,
    },
  );
}

export async function writeRunRecord(record: RunRecord): Promise<void> {
  await putOnce(
    runRecordKey(record.runId),
    `${JSON.stringify(record, null, 2)}\n`,
    {
      ...PUBLIC_ONCE,
      contentType: "application/json; charset=utf-8",
      cacheControlMaxAge: 60,
    },
  );
}

export async function readRunRecord(
  runId: string,
): Promise<RunRecord | null> {
  try {
    const blob = await head(runRecordKey(runId));
    return readJson<RunRecord>(blob.url);
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
}

export async function readRunLogsUrl(runId: string): Promise<string | null> {
  try {
    return (await head(runLogsKey(runId))).url;
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
}

export async function listRunIdsForPr(
  identity: PrIdentity,
): Promise<Array<{ runId: string; claimedAt: string }>> {
  const blobs = await listAll(prRunsPrefix(identity));
  return Promise.all(
    blobs.map((blob) =>
      readJson<{ runId: string; claimedAt: string }>(blob.url),
    ),
  );
}

export async function hasCompletedDemo(
  identity: PrIdentity,
): Promise<boolean> {
  const blobs = await listAll(prDemosPrefix(identity));
  return blobs.some((blob) => blob.pathname.endsWith("/metadata.json"));
}
