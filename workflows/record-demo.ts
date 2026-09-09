import { getWorkflowMetadata } from "workflow";

import { isRunnerFailure, RunnerFailure } from "@/sandbox-runner/failure";
import {
  commentMarker,
  renderComment,
  type CommentState,
} from "@/lib/comment/render";
import { appBaseUrl } from "@/lib/env";
import { fallbackDemoSpec } from "@/lib/scope/fallback";
import type { DemoSpec } from "@/lib/scope/schema";
import {
  runInSandbox,
  type SandboxRunResult,
} from "@/lib/sandbox/run";
import {
  EVENT_SEQ,
  markDone,
  markFailed,
  markStage,
  persistCompletedArtifacts,
  persistConfig,
  persistExploreTranscript,
  persistRunLogs,
  readRunEvents,
  readRunLogsUrl,
  type ConfigSource,
  type RunFailure,
  type RunMode,
  type RunRecord,
  type RunStage,
  type StoredBlob,
  writeRunRecord,
} from "@/lib/storage/runs";
import type { DemoIdentity } from "@/lib/storage/keys";
import {
  createComment,
  findCommentByMarker,
  GitHubError,
  listChangedPaths,
  updateComment,
} from "@/lib/trigger/github";

export interface RecordDemoInput {
  identity: DemoIdentity;
  previewUrl: string;
  commitSha: string;
  pr: {
    title: string;
    body: string;
    headRef: string;
    htmlUrl: string;
  };
  mode: RunMode;
  configSource?: ConfigSource;
}

export type Outcome =
  | {
      ok: true;
      artifacts: {
        configUrl: string;
        videoUrl: string;
        posterUrl: string;
        metadataUrl: string;
      };
      timings: SandboxRunResult["timings"];
    }
  | { ok: false; failure: RunFailure };

interface ScopeResult {
  demo: DemoSpec;
  changedPaths: string[];
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function recordDemo(
  input: RecordDemoInput,
): Promise<Outcome & { commentError?: string }> {
  "use workflow";

  const { workflowRunId: runId } = getWorkflowMetadata();
  const scope = await scopeDemo(runId, input);
  await openRun(runId, input, scope.demo);

  let commentId: number | null = null;
  let commentError: string | undefined;
  try {
    commentId = await postInProgressComment(runId, input, scope.demo);
  } catch (error) {
    commentError = describe(error);
  }

  let outcome: Outcome;
  try {
    outcome = await runPipeline(runId, input, scope);
  } catch (error) {
    outcome = {
      ok: false,
      failure: await unexpectedFailure(runId, describe(error)),
    };
  }

  await recordOutcome(runId, outcome);
  try {
    await finalizeComment(runId, input, scope.demo, commentId, outcome);
  } catch (error) {
    commentError = describe(error);
  }

  return commentError ? { ...outcome, commentError } : outcome;
}

async function scopeDemo(
  runId: string,
  input: RecordDemoInput,
): Promise<ScopeResult> {
  "use step";

  await markStage(runId, "scope");
  const changedPaths = await listChangedPaths(input.identity, input.identity.prNumber);
  return { demo: fallbackDemoSpec(input.pr), changedPaths };
}

scopeDemo.maxRetries = 0;

async function openRun(
  runId: string,
  input: RecordDemoInput,
  demo: DemoSpec,
): Promise<void> {
  "use step";

  const record: RunRecord = {
    runId,
    identity: input.identity,
    previewUrl: input.previewUrl,
    commitSha: input.commitSha,
    pr: input.pr,
    demo,
    mode: input.mode,
    thinInput: input.pr.body.length === 0,
    startedAt: new Date().toISOString(),
  };
  await writeRunRecord(record);
  await markStage(runId, "comment");
}

async function postInProgressComment(
  runId: string,
  input: RecordDemoInput,
  demo: DemoSpec,
): Promise<number | null> {
  "use step";

  const marker = commentMarker(input.identity.prNumber);
  const body = renderComment(input.identity.prNumber, {
    state: "in_progress",
    title: demo.title,
    statusUrl: `${appBaseUrl()}/runs/${encodeURIComponent(runId)}`,
  });
  const existing = await findCommentByMarker(
    input.identity,
    input.identity.prNumber,
    marker,
  );
  if (existing) {
    await updateComment(input.identity, existing.id, body);
    return existing.id;
  }
  return (await createComment(
    input.identity,
    input.identity.prNumber,
    body,
  )).id;
}

async function loadConfig(source: ConfigSource | undefined): Promise<string> {
  if (!source) {
    throw new RunnerFailure(
      "record",
      "invalid-config",
      "record-only mode requires a config source",
    );
  }
  if (source.kind === "inline") return source.json;

  const response = await fetch(source.url, { cache: "no-store" });
  if (!response.ok) {
    throw new RunnerFailure(
      "record",
      "config-fetch-failed",
      `Config download failed with status ${response.status}`,
    );
  }
  return response.text();
}

async function runPipeline(
  runId: string,
  input: RecordDemoInput,
  scope: ScopeResult,
): Promise<Outcome> {
  "use step";

  await markStage(runId, "provision");
  const logs: string[] = [];
  let configBlob: StoredBlob | null = null;
  let result: SandboxRunResult | null = null;
  let runnerFailure: RunnerFailure | null = null;
  let logsUrl: string | null = null;

  try {
    result = await runInSandbox(
      input.mode === "record-only"
        ? {
            mode: "record-only",
            config: await loadConfig(input.configSource),
          }
        : {
            mode: "explore-and-record",
            explore: {
              runId,
              previewUrl: input.previewUrl,
              demoSpec: scope.demo,
              prDescription: input.pr.body.slice(0, 10_000),
              changedPaths: scope.changedPaths,
            },
          },
      (log) => {
        logs.push(
          JSON.stringify({ at: new Date().toISOString(), ...log }),
        );
      },
      async (config) => {
        configBlob = await persistConfig(input.identity, config);
        await markStage(runId, "record");
      },
      () =>
        markStage(
          runId,
          input.mode === "record-only" ? "record" : "explore",
        ),
      () => markStage(runId, "upload"),
      async (transcript) => {
        const blob = await persistExploreTranscript(runId, transcript);
        logs.push(
          JSON.stringify({
            at: new Date().toISOString(),
            stage: "explore",
            stream: "artifact",
            data: blob.url,
          }),
        );
      },
    );
  } catch (error) {
    if (!isRunnerFailure(error)) throw error;
    runnerFailure = error;
  } finally {
    const blob = await persistRunLogs(
      runId,
      logs.length > 0 ? `${logs.join("\n")}\n` : "",
    );
    logsUrl = blob.url;
  }

  if (runnerFailure) {
    return {
      ok: false,
      failure: {
        stage: runnerFailure.stage,
        reason: runnerFailure.reason,
        detail: runnerFailure.detail,
        logsUrl,
      },
    };
  }
  if (!result || !configBlob) {
    throw new Error("Sandbox completed without returning its artifacts");
  }

  const artifacts = await persistCompletedArtifacts(input.identity, {
    video: result.video,
    poster: result.poster,
    config: configBlob,
    metadata: {
      repo: `${input.identity.owner}/${input.identity.repo}`,
      prNumber: input.identity.prNumber,
      prTitle: input.pr.title,
      deploymentId: input.identity.deploymentId,
      deploymentUrl: input.previewUrl,
      featureSlug: scope.demo.featureSlug,
      status: "completed",
      timings: result.timings,
      generatedAt: new Date().toISOString(),
    },
  });

  return {
    ok: true,
    artifacts: {
      configUrl: artifacts.config.url,
      videoUrl: artifacts.video.url,
      posterUrl: artifacts.poster.url,
      metadataUrl: artifacts.metadata.url,
    },
    timings: result.timings,
  };
}

runPipeline.maxRetries = 0;

async function unexpectedFailure(
  runId: string,
  detail: string,
): Promise<RunFailure> {
  "use step";

  const events = await readRunEvents(runId);
  const current = events
    .filter((event) => event.status === "started")
    .sort(
      (left, right) =>
        EVENT_SEQ[`${right.stage}:started`] -
        EVENT_SEQ[`${left.stage}:started`],
    )[0];
  return {
    stage: (current?.stage ?? "scope") as RunStage,
    reason: "unexpected",
    detail,
    logsUrl: await readRunLogsUrl(runId),
  };
}

async function recordOutcome(
  runId: string,
  outcome: Outcome,
): Promise<void> {
  "use step";
  if (outcome.ok) {
    await markDone(runId);
  } else {
    await markFailed(runId, outcome.failure);
  }
}

async function finalizeComment(
  runId: string,
  input: RecordDemoInput,
  demo: DemoSpec,
  commentId: number | null,
  outcome: Outcome,
): Promise<void> {
  "use step";

  const statusUrl = `${appBaseUrl()}/runs/${encodeURIComponent(runId)}`;
  const state: CommentState = outcome.ok
    ? {
        state: "done",
        title: demo.title,
        statusUrl,
        posterUrl: outcome.artifacts.posterUrl,
        configUrl: outcome.artifacts.configUrl,
      }
    : {
        state: "failed",
        title: demo.title,
        statusUrl,
        failure: outcome.failure,
      };
  const body = renderComment(input.identity.prNumber, state);

  if (commentId !== null) {
    try {
      await updateComment(input.identity, commentId, body);
      return;
    } catch (error) {
      if (!(error instanceof GitHubError) || error.status !== 404) throw error;
    }
  }

  const marker = commentMarker(input.identity.prNumber);
  const existing = await findCommentByMarker(
    input.identity,
    input.identity.prNumber,
    marker,
  );
  if (existing) {
    await updateComment(input.identity, existing.id, body);
    return;
  }
  await createComment(input.identity, input.identity.prNumber, body);
}
