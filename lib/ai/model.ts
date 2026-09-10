export const DEFAULT_MODEL_ID = "openai/gpt-5.6-luna";
export const DEFAULT_REASONING_EFFORT = "medium" as const;

const DISPLAY_NAMES: Record<string, string> = {
  "openai/gpt-5.6-luna": "GPT-5.6 Luna",
};

/** Human-readable model name; falls back to the id's suffix. */
export function modelDisplayName(id: string): string {
  return DISPLAY_NAMES[id] ?? id.split("/").pop() ?? id;
}

/** Provider prefix of a Gateway model id ("openai/gpt-…" → "openai"). */
export function modelProvider(id: string): string {
  return id.includes("/") ? id.slice(0, id.indexOf("/")) : "";
}

export const defaultModelProviderOptions = {
  openai: {
    reasoningEffort: DEFAULT_REASONING_EFFORT,
    reasoningSummary: null,
  },
} as const;

export function readGatewayCost(
  providerMetadata: unknown,
): number | null {
  if (!providerMetadata || typeof providerMetadata !== "object") return null;
  const gateway = (providerMetadata as Record<string, unknown>).gateway;
  if (!gateway || typeof gateway !== "object") return null;
  const rawCost = (gateway as Record<string, unknown>).cost;
  if (
    typeof rawCost !== "string" &&
    typeof rawCost !== "number"
  ) {
    return null;
  }
  const cost = Number(rawCost);
  return Number.isFinite(cost) && cost >= 0 ? cost : null;
}

/**
 * Adds only costs the Gateway actually reported. Prices are never estimated.
 */
export function sumReportedCosts(
  ...costs: Array<number | null>
): number | null {
  const reported = costs.filter((cost): cost is number => cost !== null);
  return reported.length === 0
    ? null
    : reported.reduce((total, cost) => total + cost, 0);
}
