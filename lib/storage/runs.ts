import {
  BlobNotFoundError,
  head,
  put,
  type PutCommandOptions,
} from "@vercel/blob";

import {
  demoArtifactKeys,
  type DemoIdentity,
  deploymentSentinelKey,
  runEventKey,
  runLogsKey,
} from "./keys";

export interface StoredBlob {
  pathname: string;
  url: string;
  downloadUrl: string;
}

export interface RunEvent {
  at: string;
  stage: string;
  status: "started" | "completed" | "failed";
  reason?: string;
  logsUrl?: string;
}

const PUBLIC_ONCE = {
  access: "public",
  addRandomSuffix: false,
  allowOverwrite: false,
} satisfies PutCommandOptions;

async function putOnce(
  pathname: string,
  body: string | Uint8Array,
  options: PutCommandOptions,
): Promise<StoredBlob> {
  try {
    return await head(pathname);
  } catch (error) {
    if (!(error instanceof BlobNotFoundError)) throw error;
  }

  try {
    return await put(
      pathname,
      typeof body === "string" ? body : Buffer.from(body),
      options,
    );
  } catch (putError) {
    // A concurrent retry can win between head() and put(). In that one case,
    // the immutable object now present is the successful result.
    try {
      return await head(pathname);
    } catch {
      throw putError;
    }
  }
}

export async function persistConfig(
  identity: DemoIdentity,
  config: Uint8Array,
): Promise<StoredBlob> {
  return putOnce(demoArtifactKeys(identity).config, config, {
    ...PUBLIC_ONCE,
    contentType: "application/json; charset=utf-8",
  });
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
    }),
    putOnce(keys.poster, input.poster, {
      ...PUBLIC_ONCE,
      contentType: "image/png",
    }),
  ]);
  const metadata = await putOnce(
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

export async function createDeploymentSentinel(
  deploymentId: string,
  value: Record<string, unknown>,
): Promise<StoredBlob> {
  return putOnce(
    deploymentSentinelKey(deploymentId),
    `${JSON.stringify(value, null, 2)}\n`,
    {
      ...PUBLIC_ONCE,
      contentType: "application/json; charset=utf-8",
      cacheControlMaxAge: 60,
    },
  );
}

export async function appendRunEvent(
  runId: string,
  sequence: number,
  event: RunEvent,
): Promise<StoredBlob> {
  return putOnce(
    runEventKey(runId, sequence, event.stage),
    `${JSON.stringify(event, null, 2)}\n`,
    {
      ...PUBLIC_ONCE,
      contentType: "application/json; charset=utf-8",
      cacheControlMaxAge: 60,
    },
  );
}

export async function persistRunLogs(
  runId: string,
  logs: string,
): Promise<StoredBlob> {
  return putOnce(runLogsKey(runId), logs, {
    ...PUBLIC_ONCE,
    contentType: "application/x-ndjson; charset=utf-8",
    cacheControlMaxAge: 60,
  });
}
