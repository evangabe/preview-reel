import { readFile } from "node:fs/promises";

import { explore, exploreInputSchema } from "./explore";
import {
  isRunnerFailure,
  RunnerFailure,
  type RunnerStage,
} from "./failure";
import { record, recordInputSchema } from "./record";

function option(name: string, stage: RunnerStage): string {
  const index = process.argv.indexOf(name);
  const value = process.argv[index + 1];
  if (index === -1 || !value || value.startsWith("--")) {
    throw new RunnerFailure(
      stage,
      "invalid-config",
      `Missing ${name} argument`,
    );
  }
  return value;
}

async function main() {
  const command = process.argv[2];
  if (command === "explore") {
    const inputPath = option("--input", "explore");
    const input = exploreInputSchema.parse(
      JSON.parse(await readFile(inputPath, "utf8")),
    );
    const summary = await explore(input);
    process.stdout.write(`${JSON.stringify({ ok: true, summary })}\n`);
    return;
  }

  if (command === "record") {
    const input = recordInputSchema.parse({
      configPath: option("--config", "record"),
      outDir: option("--out-dir", "record"),
    });
    const summary = await record(input);
    process.stdout.write(`${JSON.stringify({ ok: true, summary })}\n`);
    return;
  }

  throw new RunnerFailure(
    "explore",
    "invalid-config",
    `Unknown runner command: ${command ?? "(missing)"}`,
  );
}

main().catch((error: unknown) => {
  const failure = isRunnerFailure(error)
    ? error
    : new RunnerFailure(
        "explore",
        "invalid-config",
        error instanceof Error ? error.message : String(error),
      );
  process.stderr.write(
    `${JSON.stringify({
      stage: failure.stage,
      reason: failure.reason,
      detail: failure.detail,
    })}\n`,
  );
  process.exitCode = 1;
});
