import { describe, expect, it } from "vitest";

import {
  deploymentFacts,
  deploymentSucceededSchema,
  eventTypeSchema,
} from "./payload";

const event = {
  id: "evt_1",
  type: "deployment.succeeded",
  createdAt: 1_757_444_400_000,
  payload: {
    target: null,
    deployment: {
      id: "dpl_1",
      url: "preview.example.vercel.app",
      meta: {
        githubOrg: "owner",
        githubRepo: "repo",
        githubPrId: "12",
        githubCommitRef: "feat/example",
        githubCommitSha: "a".repeat(40),
        undocumented: "kept",
      },
      extra: true,
    },
    extra: true,
  },
  extra: true,
};

describe("deployment payload", () => {
  it("accepts documented facts while retaining extra fields", () => {
    const parsed = deploymentSucceededSchema.parse(event);
    expect(parsed.payload.deployment.meta.undocumented).toBe("kept");
    expect(deploymentFacts(parsed)).toEqual({
      deploymentId: "dpl_1",
      previewUrl: "https://preview.example.vercel.app",
      owner: "owner",
      repo: "repo",
      prNumber: 12,
      headRef: "feat/example",
      commitSha: "a".repeat(40),
    });
  });

  it("supports branch lookup when githubPrId is absent", () => {
    const { githubPrId: _githubPrId, ...meta } =
      event.payload.deployment.meta;
    const withoutPr = {
      ...event,
      payload: {
        ...event.payload,
        deployment: { ...event.payload.deployment, meta },
      },
    };
    expect(
      deploymentFacts(deploymentSucceededSchema.parse(withoutPr)).prNumber,
    ).toBeNull();
  });

  it.each(["1.5", "-1", "abc"])("rejects PR id %s", (githubPrId) => {
    expect(
      deploymentSucceededSchema.safeParse({
        ...event,
        payload: {
          ...event.payload,
          deployment: {
            ...event.payload.deployment,
            meta: { ...event.payload.deployment.meta, githubPrId },
          },
        },
      }).success,
    ).toBe(false);
  });

  it("can identify another event type before full validation", () => {
    expect(eventTypeSchema.parse({ type: "deployment.created" }).type).toBe(
      "deployment.created",
    );
  });
});
