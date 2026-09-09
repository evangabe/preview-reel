import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyVercelSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader || !/^[0-9a-f]{40}$/.test(signatureHeader)) {
    return false;
  }
  const expected = createHmac("sha1", secret).update(rawBody).digest();
  const received = Buffer.from(signatureHeader, "hex");
  return (
    received.byteLength === expected.byteLength &&
    timingSafeEqual(received, expected)
  );
}
