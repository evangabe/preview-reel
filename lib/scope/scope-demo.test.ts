import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MODEL_ID,
  DEFAULT_REASONING_EFFORT,
  readGatewayCost,
  sumReportedCosts,
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

function generation(text: string, costUsd: number | null = null) {
  return { text, costUsd };
}

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
    const generate = vi
      .fn()
      .mockResolvedValue(generation(JSON.stringify(validSpec), 0.01));

    await expect(scopeDemoWithGateway(input, generate)).resolves.toEqual(
      { demo: validSpec, costUsd: 0.01 },
    );
    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0]?.[0].attempt).toBe("initial");
  });

  it("repairs one malformed response with validation context", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce(
        generation('{"title":"missing fields"}', 0.01),
      )
      .mockResolvedValueOnce(generation(JSON.stringify(validSpec), 0.02));

    await expect(scopeDemoWithGateway(input, generate)).resolves.toEqual(
      { demo: validSpec, costUsd: 0.03 },
    );
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0]).toMatchObject({ attempt: "repair" });
    expect(generate.mock.calls[1]?.[0].prompt).toContain(
      "Validation errors:",
    );
  });

  it("fails specifically after the repair is still invalid", async () => {
    const generate = vi.fn().mockResolvedValue(generation("not json"));

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

describe("sumReportedCosts", () => {
  it("adds only costs reported by the Gateway", () => {
    expect(sumReportedCosts(null, null)).toBeNull();
    expect(sumReportedCosts(0.01, null)).toBe(0.01);
    expect(sumReportedCosts(0.01, 0.02)).toBeCloseTo(0.03);
  });
});

describe("readGatewayCost", () => {
  it("reads the Gateway's decimal-string inference cost", () => {
    expect(
      readGatewayCost({ gateway: { cost: "0.0002596" } }),
    ).toBe(0.0002596);
  });

  it("rejects absent and invalid cost metadata", () => {
    expect(readGatewayCost(undefined)).toBeNull();
    expect(readGatewayCost({ gateway: { cost: "unknown" } })).toBeNull();
    expect(readGatewayCost({ gateway: { cost: -1 } })).toBeNull();
  });
});
