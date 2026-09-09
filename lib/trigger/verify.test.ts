import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyVercelSignature } from "./verify";

const body = '{"type":"deployment.succeeded"}';
const secret = "webhook-secret";
const signature = createHmac("sha1", secret).update(body).digest("hex");

describe("verifyVercelSignature", () => {
  it("accepts the valid raw-body signature", () => {
    expect(verifyVercelSignature(body, signature, secret)).toBe(true);
  });

  it.each([
    [body, signature, "wrong-secret"],
    [`${body} `, signature, secret],
    [body, null, secret],
    [body, "abcd", secret],
    [body, signature.toUpperCase(), secret],
  ])("rejects invalid signature input", (value, header, key) => {
    expect(verifyVercelSignature(value, header, key)).toBe(false);
  });
});
