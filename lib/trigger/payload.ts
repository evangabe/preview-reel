import { z } from "zod";

export const eventTypeSchema = z.object({ type: z.string() }).passthrough();

export const deploymentSucceededSchema = z
  .object({
    id: z.string(),
    type: z.literal("deployment.succeeded"),
    createdAt: z.number(),
    payload: z
      .object({
        target: z.enum(["production", "staging"]).nullable(),
        deployment: z
          .object({
            id: z.string().min(1),
            url: z.string().min(1),
            meta: z
              .object({
                githubOrg: z.string().min(1),
                githubRepo: z.string().min(1),
                githubPrId: z.string().regex(/^\d+$/).optional(),
                githubCommitRef: z.string().min(1),
                githubCommitSha: z.string().regex(/^[0-9a-f]{40}$/),
              })
              .passthrough(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

export type DeploymentSucceeded = z.infer<
  typeof deploymentSucceededSchema
>;

export interface DeploymentFacts {
  deploymentId: string;
  previewUrl: string;
  owner: string;
  repo: string;
  prNumber: number | null;
  headRef: string;
  commitSha: string;
}

export function deploymentFacts(
  event: DeploymentSucceeded,
): DeploymentFacts {
  const { deployment } = event.payload;
  return {
    deploymentId: deployment.id,
    previewUrl: `https://${deployment.url}`,
    owner: deployment.meta.githubOrg,
    repo: deployment.meta.githubRepo,
    prNumber:
      deployment.meta.githubPrId === undefined
        ? null
        : Number(deployment.meta.githubPrId),
    headRef: deployment.meta.githubCommitRef,
    commitSha: deployment.meta.githubCommitSha,
  };
}
