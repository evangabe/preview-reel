import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const event = JSON.parse(
    await readFile("fixtures/webhook/deployment-succeeded.json", "utf8"),
  ) as {
    type: string;
    payload: {
      target: string | null;
      deployment: {
        id: string;
        meta: Record<string, string>;
      };
    };
  };

  event.type = option("--type") ?? event.type;
  event.payload.deployment.id =
    option("--deployment-id") ?? event.payload.deployment.id;
  event.payload.target =
    option("--target") === "null"
      ? null
      : option("--target") ?? event.payload.target;
  event.payload.deployment.meta.githubRepo =
    option("--repo") ?? event.payload.deployment.meta.githubRepo;
  event.payload.deployment.meta.githubPrId =
    option("--pr") ?? event.payload.deployment.meta.githubPrId;
  event.payload.deployment.meta.githubCommitRef =
    option("--head-ref") ??
    event.payload.deployment.meta.githubCommitRef;
  if (process.argv.includes("--omit-pr")) {
    delete event.payload.deployment.meta.githubPrId;
  }

  const rawBody = JSON.stringify(event);
  const secret = process.argv.includes("--bad-secret")
    ? "wrong-secret"
    : process.env.VERCEL_WEBHOOK_SECRET;
  if (!secret) throw new Error("VERCEL_WEBHOOK_SECRET is not set");
  const signature = createHmac("sha1", secret)
    .update(rawBody)
    .digest("hex");
  const response = await fetch(
    "http://localhost:3000/api/webhooks/vercel",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vercel-signature": signature,
      },
      body: rawBody,
    },
  );
  console.log(response.status, await response.text());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
