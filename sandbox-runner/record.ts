import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, resolve } from "node:path";

import { z } from "zod";

import {
  type WebreelConfig,
  webreelConfigSchema,
} from "../lib/scope/schema";
import {
  AUTH_FAILURE_DETAIL,
  followAuthChain,
  substitutePlaceholders,
} from "./auth-preflight";
import { runCommand } from "./command";
import { RunnerFailure } from "./failure";

export const recordInputSchema = z
  .object({
    configPath: z.string().min(1),
    outDir: z.string().min(1),
  })
  .strict();

export type RecordInput = z.infer<typeof recordInputSchema>;

export interface RecordSummary {
  durationMs: number;
  videoBytes: number;
  posterBytes: number;
  videoName: string;
}

function requireSubstitutionVariables() {
  const missing = ["DEMO_LOGIN_TOKEN", "VERCEL_PROTECTION_BYPASS"].filter(
    (name) => !process.env[name],
  );
  if (missing.length > 0) {
    throw new RunnerFailure(
      "record",
      "substitution-vars-missing",
      `Missing ${missing.join(", ")}`,
    );
  }
}

function normalizeOutput(config: WebreelConfig): WebreelConfig {
  const [videoName, video] = Object.entries(config.videos)[0];
  return {
    ...config,
    videos: {
      [videoName]: {
        ...video,
        output: "../video.mp4",
        thumbnail: {
          ...video.thumbnail,
          enabled: true,
        },
      },
    },
  };
}

function entryUrl(config: WebreelConfig): string {
  const [video] = Object.values(config.videos);
  return new URL(video.url, config.baseUrl).toString();
}

/**
 * Names the auth wall before webreel hits it. The resolved URL, statuses,
 * and Location headers never reach a detail or a log line: they carry the
 * bypass secret and the login token.
 */
async function preflightAuth(config: WebreelConfig): Promise<void> {
  let verdict: Awaited<ReturnType<typeof followAuthChain>>;
  try {
    verdict = await followAuthChain(
      substitutePlaceholders(entryUrl(config), process.env),
    );
  } catch (error) {
    process.stdout.write(
      `Auth preflight skipped (${error instanceof Error ? error.name : "error"}); continuing to record\n`,
    );
    return;
  }
  if (verdict !== "ok") {
    throw new RunnerFailure("record", verdict, AUTH_FAILURE_DETAIL[verdict]);
  }
}

export function recordingFailure(output: string): RunnerFailure {
  if (/Step \d+ \(wait\) failed/i.test(output)) {
    const reason = /timeout|timed out/i.test(output)
      ? "assertion-timeout"
      : "assertion-failed";
    return new RunnerFailure("record", reason, output);
  }
  if (/element not found/i.test(output)) {
    return new RunnerFailure("record", "element-not-found", output);
  }
  if (/ffmpeg|composit|encod/i.test(output)) {
    return new RunnerFailure("record", "encode-failed", output);
  }
  if (/navigat|net::|err_|timeout|timed out/i.test(output)) {
    return new RunnerFailure("record", "navigation-failed", output);
  }
  return new RunnerFailure("record", "record-failed", output);
}

export async function record(rawInput: RecordInput): Promise<RecordSummary> {
  const input = recordInputSchema.parse(rawInput);
  requireSubstitutionVariables();

  const startedAt = Date.now();
  const outDir = resolve(input.outDir);
  const configPath = resolve(outDir, "config.json");
  const videoPath = resolve(outDir, "video.mp4");
  const generatedPosterPath = resolve(outDir, "video.png");
  const posterPath = resolve(outDir, "poster.png");
  const summaryPath = resolve(outDir, "record-summary.json");
  await mkdir(outDir, { recursive: true });

  let parsedConfig: WebreelConfig;
  try {
    parsedConfig = webreelConfigSchema.parse(
      JSON.parse(await readFile(resolve(input.configPath), "utf8")),
    );
  } catch (error) {
    const detail =
      error instanceof z.ZodError
        ? z.prettifyError(error)
        : error instanceof Error
          ? error.message
          : String(error);
    throw new RunnerFailure("record", "invalid-config", detail);
  }

  await preflightAuth(parsedConfig);

  const config = normalizeOutput(parsedConfig);
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  await Promise.all([
    rm(videoPath, { force: true }),
    rm(generatedPosterPath, { force: true }),
    rm(posterPath, { force: true }),
    rm(summaryPath, { force: true }),
  ]);

  const validation = await runCommand(
    "webreel",
    ["validate", "-c", configPath],
    { cwd: outDir },
  );
  if (validation.exitCode !== 0) {
    throw new RunnerFailure(
      "record",
      "invalid-config",
      validation.stderr.trim() ||
        validation.stdout.trim() ||
        "WebReel rejected the config",
    );
  }

  const result = await runCommand(
    "webreel",
    ["record", "-c", configPath, "--verbose"],
    {
      cwd: outDir,
      onStdout: (chunk) => process.stdout.write(chunk),
    },
  );
  if (result.exitCode !== 0) {
    throw recordingFailure(
      result.stderr.trim() ||
        result.stdout.trim() ||
        `WebReel exited ${result.exitCode}`,
    );
  }

  const [videoStats, posterStats] = await Promise.all([
    stat(videoPath),
    stat(generatedPosterPath),
  ]).catch((error: unknown) => {
    throw new RunnerFailure(
      "record",
      "encode-failed",
      error instanceof Error ? error.message : String(error),
    );
  });
  if (videoStats.size < 10_000 || posterStats.size === 0) {
    throw new RunnerFailure(
      "record",
      "encode-failed",
      `Artifacts are unexpectedly small: video=${videoStats.size}, poster=${posterStats.size}`,
    );
  }
  await rename(generatedPosterPath, posterPath);

  const summary: RecordSummary = {
    durationMs: Date.now() - startedAt,
    videoBytes: videoStats.size,
    posterBytes: posterStats.size,
    videoName: basename(videoPath),
  };
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}
