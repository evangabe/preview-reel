import { describe, expect, it } from "vitest";

import { matchFeatureTag } from "./tag";

describe("matchFeatureTag", () => {
  it.each([
    ["[feat] X", "X"],
    ["  [Feature]X", "X"],
    ["[FEAT]", ""],
  ])("matches %s", (title, stripped) => {
    expect(matchFeatureTag(title)).toEqual({
      matched: true,
      title: stripped,
    });
  });

  it.each(["No tag", "feat: X", "Prefix [feat] X"])("rejects %s", (title) => {
    expect(matchFeatureTag(title)).toEqual({ matched: false });
  });
});
