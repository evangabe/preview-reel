import { assertEnv } from "@/lib/env";

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    assertEnv();
  }
}
