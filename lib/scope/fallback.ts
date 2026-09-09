import { demoSpecSchema, type DemoSpec } from "./schema";

const FEATURE_TAG = /^\s*\[(?:feat|feature)\]\s*/i;

export function fallbackDemoSpec(pr: { title: string }): DemoSpec {
  const title = pr.title.replace(FEATURE_TAG, "").trim();
  const featureSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return demoSpecSchema.parse({
    title,
    featureSlug,
    entryPoint: null,
    intent: title,
    reason: "model scoping not yet enabled",
  });
}
