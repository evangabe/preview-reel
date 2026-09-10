import { z } from "zod";

const millisecondsSchema = z.number().int().nonnegative();
const artifactUrlSchema = z.url();

export const modelInfoSchema = z
  .object({
    id: z.string().min(1),
    reasoningEffort: z.enum(["low", "medium", "high"]),
  })
  .strict();

export type ModelInfo = z.infer<typeof modelInfoSchema>;

export const demoMetadataSchema = z
  .object({
    runId: z.string().min(1),
    repo: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
    prNumber: z.number().int().positive(),
    prTitle: z.string(),
    demoTitle: z.string().min(1),
    featureSlug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be kebab-case"),
    deploymentId: z.string().min(1),
    deploymentUrl: z.url(),
    commitSha: z.string().regex(/^[0-9a-f]{40}$/),
    prUrl: z.url(),
    status: z.literal("completed"),
    mode: z.enum(["explore-and-record", "record-only"]),
    timings: z
      .object({
        provisionMs: millisecondsSchema,
        exploreMs: millisecondsSchema.nullable(),
        recordMs: millisecondsSchema,
        totalMs: millisecondsSchema,
      })
      .strict(),
    // Storage-schema evolution, not model-output coercion: objects written
    // before this field existed read back as `null` and render "not recorded".
    model: modelInfoSchema.nullable().default(null),
    modelCostUsd: z.number().nonnegative().nullable(),
    logsUrl: z.url().nullable(),
    generatedAt: z.iso.datetime(),
    artifacts: z
      .object({
        configUrl: artifactUrlSchema,
        videoUrl: artifactUrlSchema,
        posterUrl: artifactUrlSchema,
      })
      .strict(),
  })
  .strict();

export type DemoMetadata = z.infer<typeof demoMetadataSchema>;
export type DemoMetadataInput = Omit<DemoMetadata, "artifacts">;

export type RecencyGroup = {
  label: "Today" | "Past week" | "Earlier";
  demos: DemoMetadata[];
};

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function groupByRecency(
  demos: DemoMetadata[],
  now: Date,
): RecencyGroup[] {
  const groups: Record<RecencyGroup["label"], DemoMetadata[]> = {
    Today: [],
    "Past week": [],
    Earlier: [],
  };
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1_000;

  for (const demo of demos) {
    const generatedAt = new Date(demo.generatedAt);
    const label = isSameLocalDay(generatedAt, now)
      ? "Today"
      : generatedAt.getTime() >= weekAgo
        ? "Past week"
        : "Earlier";
    groups[label].push(demo);
  }

  return (["Today", "Past week", "Earlier"] as const)
    .filter((label) => groups[label].length > 0)
    .map((label) => ({ label, demos: groups[label] }));
}

export function newestPerPr(demos: DemoMetadata[]): DemoMetadata[] {
  const newest = new Map<string, DemoMetadata>();

  for (const demo of demos) {
    const key = `${demo.repo}#${demo.prNumber}`;
    const existing = newest.get(key);
    if (
      !existing ||
      Date.parse(demo.generatedAt) > Date.parse(existing.generatedAt)
    ) {
      newest.set(key, demo);
    }
  }

  return [...newest.values()].sort(
    (left, right) =>
      Date.parse(right.generatedAt) - Date.parse(left.generatedAt),
  );
}
