export const DEFAULT_MODEL_ID = "openai/gpt-5.6-luna";
export const DEFAULT_REASONING_EFFORT = "medium" as const;

export const defaultModelProviderOptions = {
  openai: {
    reasoningEffort: DEFAULT_REASONING_EFFORT,
    reasoningSummary: null,
  },
} as const;
