import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { loadEnvConfig } from "@next/env";

import { getPullRequest } from "../lib/trigger/github";
import type { RecordDemoInput } from "../workflows/record-demo";

loadEnvConfig(process.cwd());

const TEAM_ID = "team_VSTlHHiJh5nS7NI8PYWhxuFI";
const TARGET_PROJECT = "preview-reel-target";

interface Deployment {
  uid: string;
  url: string;
  state: string;
  target: "production" | "staging" | null;
  created: number;
  meta?: {
    githubPrId?: string;
    githubCommitSha?: string;
    githubCommitRef?: string;
  };
}

async function latestDeployment(prNumber: number): Promise<Deployment> {
  const authPath = join(
    homedir(),
    "Library/Application Support/com.vercel.cli/auth.json",
  );
  const { token } = JSON.parse(await readFile(authPath, "utf8")) as {
    token: string;
  };
  const query = new URLSearchParams({
    projectId: TARGET_PROJECT,
    teamId: TEAM_ID,
    limit: "100",
  });
  const response = await fetch(
    `https://api.vercel.com/v6/deployments?${query}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    throw new Error(`Vercel deployments request failed: ${response.status}`);
  }
  const body = (await response.json()) as { deployments: Deployment[] };
  const deployment = body.deployments
    .filter(
      (value) =>
        value.state === "READY" &&
        value.target !== "production" &&
        value.meta?.githubPrId === String(prNumber),
    )
    .sort((left, right) => right.created - left.created)[0];
  if (!deployment) {
    throw new Error(`No ready preview deployment found for PR #${prNumber}`);
  }
  return deployment;
}

async function configForDeployment(deployment: Deployment): Promise<string> {
  const config = JSON.parse(
    await readFile("fixtures/sample-run/config.json", "utf8"),
  ) as { videos: Record<string, { url: string }> };
  const video = Object.values(config.videos)[0];
  if (!video) throw new Error("Fixture config has no video");

  const fixtureUrl = new URL(video.url);
  video.url = `https://${deployment.url}${fixtureUrl.pathname}${fixtureUrl.search}`;
  return `${JSON.stringify(config, null, 2)}\n`;
}

async function pollRun(runId: string): Promise<void> {
  let previous = "";
  const deadline = Date.now() + 6 * 60_000;
  while (Date.now() < deadline) {
    const response = await fetch(`http://localhost:3000/api/runs/${runId}`, {
      cache: "no-store",
    });
    const body = (await response.json()) as {
      status?: { state: string; stage?: string; completedAt?: string };
      error?: string;
    };
    const current = JSON.stringify(body.status ?? body);
    if (current !== previous) {
      console.log(new Date().toISOString(), current);
      previous = current;
    }
    if (
      body.status?.state === "done" ||
      body.status?.state === "failed"
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error(`Run ${runId} did not finish within six minutes`);
}

async function main() {
  const prIndex = process.argv.indexOf("--pr");
  const prNumber = Number(process.argv[prIndex + 1]);
  if (
    prIndex === -1 ||
    !Number.isSafeInteger(prNumber) ||
    prNumber < 1
  ) {
    throw new Error(
      "Usage: npx tsx scripts/trigger-run.ts --pr N [--record-only]",
    );
  }
  const recordOnly = process.argv.includes("--record-only");

  const ref = { owner: "evangabe", repo: "preview-reel-target" };
  const [pr, deployment] = await Promise.all([
    getPullRequest(ref, prNumber),
    latestDeployment(prNumber),
  ]);
  if (!pr) throw new Error(`PR #${prNumber} was not found`);
  if (!deployment.meta?.githubCommitSha) {
    throw new Error("Preview deployment has no commit SHA");
  }

  const input: RecordDemoInput = {
    identity: {
      ...ref,
      prNumber,
      deploymentId: deployment.uid,
    },
    previewUrl: `https://${deployment.url}`,
    commitSha: deployment.meta.githubCommitSha,
    pr: {
      title: pr.title,
      body: pr.body,
      headRef: pr.headRef,
      htmlUrl: pr.htmlUrl,
    },
    mode: recordOnly ? "record-only" : "explore-and-record",
    ...(recordOnly
      ? {
          configSource: {
            kind: "inline" as const,
            json: await configForDeployment(deployment),
          },
        }
      : {}),
  };
  const response = await fetch("http://localhost:3000/api/dev/trigger-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Workflow start failed: ${response.status}`);
  }
  const { runId } = (await response.json()) as { runId: string };
  console.log(`runId=${runId}`);
  await pollRun(runId);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
