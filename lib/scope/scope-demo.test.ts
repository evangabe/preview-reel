import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MODEL_ID,
  DEFAULT_REASONING_EFFORT,
} from "../ai/model";

import {
  buildScopePrompt,
  ScopeDemoError,
  scopeDemoWithGateway,
  type ScopeDemoInput,
} from "./scope-demo";

const input: ScopeDemoInput = {
  runId: "wrun_123",
  previewUrl: "https://preview.example.com",
  pr: {
    title: "[feat] Command palette",
    body: "Press Command-K and search for 6202.",
  },
  changedPaths: ["app/page.tsx", "components/command-palette.tsx"],
};

const validSpec = {
  title: "Command palette",
  featureSlug: "command-palette",
  entryPoint: "/",
  intent: "Open the command palette and find part 6202.",
  reason: "The PR adds keyboard-driven part lookup.",
};

describe("scopeDemoWithGateway", () => {
  it("uses Luna with medium reasoning as the shared default", () => {
    expect(DEFAULT_MODEL_ID).toBe("openai/gpt-5.6-luna");
    expect(DEFAULT_REASONING_EFFORT).toBe("medium");
  });

  it("builds JSON-encoded context from every required input", () => {
    const prompt = buildScopePrompt(input);

    expect(prompt).toContain(JSON.stringify(input.pr.title));
    expect(prompt).toContain(JSON.stringify(input.pr.body));
    expect(prompt).toContain(JSON.stringify(input.changedPaths));
    expect(prompt).toContain(JSON.stringify(input.previewUrl));
  });

  it("returns a valid first response without repair", async () => {
    const generate = vi.fn().mockResolvedValue(JSON.stringify(validSpec));

    await expect(scopeDemoWithGateway(input, generate)).resolves.toEqual(
      validSpec,
    );
    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0]?.[0].attempt).toBe("initial");
  });

  it("repairs one malformed response with validation context", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce('{"title":"missing fields"}')
      .mockResolvedValueOnce(JSON.stringify(validSpec));

    await expect(scopeDemoWithGateway(input, generate)).resolves.toEqual(
      validSpec,
    );
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0]).toMatchObject({ attempt: "repair" });
    expect(generate.mock.calls[1]?.[0].prompt).toContain(
      "Validation errors:",
    );
  });

  it("fails specifically after the repair is still invalid", async () => {
    const generate = vi.fn().mockResolvedValue("not json");

    await expect(scopeDemoWithGateway(input, generate)).rejects.toMatchObject({
      reason: "invalid-output",
      detail: "Output was not valid JSON",
    } satisfies Partial<ScopeDemoError>);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("does not retry transport or account failures", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("Gateway denied"));

    await expect(scopeDemoWithGateway(input, generate)).rejects.toMatchObject({
      reason: "model-call-failed",
      detail: "Gateway denied",
    } satisfies Partial<ScopeDemoError>);
    expect(generate).toHaveBeenCalledOnce();
  });
});
