import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { Sandbox } from "@vercel/sandbox";

import type { ExploreInput } from "../../sandbox-runner/explore";
import { RunnerFailure, type RunnerStage } from "../../sandbox-runner/failure";
import { provisionSandbox } from "./provision";

const RUN_DIR = "/vercel/run";
const RUNNER_PATH = "/vercel/runner.mjs";
const DEADLINE_MS = 5 * 60 * 1_000;

export type SandboxRunInput =
  | {
      mode: "explore-and-record";
      explore: Omit<ExploreInput, "outDir">;
    }
  | {
      mode: "record-only";
      config: string | Uint8Array;
    };

export interface SandboxLog {
  stage: "explore" | "record";
  stream: "stdout" | "stderr";
  data: string;
}

export interface SandboxRunResult {
  config: Buffer;
  video: Buffer;
  poster: Buffer;
  timings: {
    provisionMs: number;
    exploreMs: number | null;
    recordMs: number;
    totalMs: number;
  };
}

type LogCallback = (log: SandboxLog) => void | Promise<void>;
type ConfigCallback = (config: Buffer) => void | Promise<void>;
type StageCallback = () => void | Promise<void>;

export function redactRunnerOutput(
  value: string,
  secrets: string[],
): string {
  let redacted = value;
  for (const secret of secrets) {
    if (secret) redacted = redacted.replaceAll(secret, "<redacted>");
  }
  return redacted.replace(
    /([?&](?:token|x-vercel-protection-bypass)=)[^&"'\s]+/gi,
    "$1<redacted>",
  );
}

function runnerSecrets(): string[] {
  return [
    process.env.DEMO_LOGIN_TOKEN ?? "",
    process.env.VERCEL_PROTECTION_BYPASS ?? "",
    process.env.AI_GATEWAY_API_KEY ?? "",
  ];
}

function requiredEnv(name: string, stage: RunnerStage): string {
  const value = process.env[name];
  if (!value) {
    throw new RunnerFailure(
      stage,
      stage === "provision"
        ? "snapshot-missing"
        : "substitution-vars-missing",
      `${name} is not set`,
    );
  }
  return value;
}

function parseRunnerFailure(
  stage: "explore" | "record",
  stderr: string,
): RunnerFailure {
  for (const line of stderr.trim().split("\n").reverse()) {
    try {
      const parsed = JSON.parse(line) as {
        stage?: RunnerStage;
        reason?: string;
        detail?: string;
      };
      if (parsed.stage && parsed.reason && parsed.detail) {
        return new RunnerFailure(parsed.stage, parsed.reason, parsed.detail);
      }
    } catch {
      // Child logs may contain ordinary text before the terminal JSON line.
    }
  }
  return new RunnerFailure(
    stage,
    stage === "record" ? "record-failed" : "feature-not-found",
    stderr.trim() || `${stage} command failed without stderr`,
  );
}

async function runStage(
  sandbox: Sandbox,
  stage: "explore" | "record",
  args: string[],
  env: Record<string, string>,
  signal: AbortSignal,
  onLog?: LogCallback,
) {
  const command = await sandbox.runCommand({
    cmd: "node",
    args: [RUNNER_PATH, stage, ...args],
    cwd: RUN_DIR,
    env,
    detached: true,
    timeoutMs: DEADLINE_MS,
    signal,
  });
  const logs = (async () => {
    for await (const line of command.logs({ signal })) {
      await onLog?.({
        stage,
        stream: line.stream,
        data: redactRunnerOutput(line.data, runnerSecrets()),
      });
    }
  })();
  const finished = await command.wait({ signal });
  await logs;

  if (finished.exitCode !== 0) {
    throw parseRunnerFailure(
      stage,
      redactRunnerOutput(
        await finished.stderr({ signal }),
        runnerSecrets(),
      ),
    );
  }
}

async function readRequired(
  sandbox: Sandbox,
  path: string,
  stage: "explore" | "record",
): Promise<Buffer> {
  const value = await sandbox.readFileToBuffer({ path });
  if (!value || value.byteLength === 0) {
    throw new RunnerFailure(
      stage,
      stage === "record" ? "encode-failed" : "invalid-config",
      `${path} was not produced`,
    );
  }
  return value;
}

export async function runInSandbox(
  input: SandboxRunInput,
  onLog?: LogCallback,
  onConfig?: ConfigCallback,
  onProvisioned?: StageCallback,
  onRecorded?: StageCallback,
): Promise<SandboxRunResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), DEADLINE_MS);
  let sandbox: Sandbox | null = null;

  try {
    sandbox = await provisionSandbox(controller.signal);
    const provisionMs = Date.now() - startedAt;
    await onProvisioned?.();
    const bundle = await readFile(
      resolve(process.cwd(), ".runner/runner.mjs"),
    );
    await sandbox.writeFiles(
      [{ path: RUNNER_PATH, content: bundle, mode: 0o755 }],
      { signal: controller.signal },
    );

    let exploreMs: number | null = null;
    if (input.mode === "explore-and-record") {
      const exploreInput = {
        ...input.explore,
        outDir: RUN_DIR,
      };
      await sandbox.writeFiles(
        [
          {
            path: `${RUN_DIR}/explore-input.json`,
            content: `${JSON.stringify(exploreInput, null, 2)}\n`,
          },
        ],
        { signal: controller.signal },
      );
      const exploreStartedAt = Date.now();
      await runStage(
        sandbox,
        "explore",
        ["--input", `${RUN_DIR}/explore-input.json`],
        {
          DEMO_LOGIN_TOKEN: requiredEnv("DEMO_LOGIN_TOKEN", "explore"),
          VERCEL_PROTECTION_BYPASS: requiredEnv(
            "VERCEL_PROTECTION_BYPASS",
            "explore",
          ),
          AI_GATEWAY_API_KEY: requiredEnv("AI_GATEWAY_API_KEY", "explore"),
        },
        controller.signal,
        onLog,
      );
      exploreMs = Date.now() - exploreStartedAt;
    } else {
      await sandbox.writeFiles(
        [{ path: `${RUN_DIR}/config.json`, content: input.config }],
        { signal: controller.signal },
      );
    }

    // Read this before recording so callers can persist the reviewable config
    // even if the deterministic replay fails.
    const config = await readRequired(
      sandbox,
      `${RUN_DIR}/config.json`,
      "explore",
    );
    await onConfig?.(config);
    const recordStartedAt = Date.now();
    await runStage(
      sandbox,
      "record",
      [
        "--config",
        `${RUN_DIR}/config.json`,
        "--out-dir",
        RUN_DIR,
      ],
      {
        DEMO_LOGIN_TOKEN: requiredEnv("DEMO_LOGIN_TOKEN", "record"),
        VERCEL_PROTECTION_BYPASS: requiredEnv(
          "VERCEL_PROTECTION_BYPASS",
          "record",
        ),
        FFMPEG_PATH: "/usr/local/bin/ffmpeg",
      },
      controller.signal,
      onLog,
    );
    const recordMs = Date.now() - recordStartedAt;
    const [video, poster] = await Promise.all([
      readRequired(sandbox, `${RUN_DIR}/video.mp4`, "record"),
      readRequired(sandbox, `${RUN_DIR}/poster.png`, "record"),
    ]);
    await onRecorded?.();

    return {
      config,
      video,
      poster,
      timings: {
        provisionMs,
        exploreMs,
        recordMs,
        totalMs: Date.now() - startedAt,
      },
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new RunnerFailure(
        sandbox ? "record" : "provision",
        "timeout",
        `Sandbox run exceeded ${DEADLINE_MS / 1_000} seconds`,
      );
    }
    throw error;
  } finally {
    clearTimeout(deadline);
    if (sandbox) {
      await sandbox.stop().catch(() => undefined);
    }
  }
}
