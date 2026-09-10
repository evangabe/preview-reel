"use client";

import { useCallback, useState } from "react";

export type LazyTextState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; text: string }
  | { status: "error"; message: string };

/**
 * Fetches a text artifact the first time a disclosure opens and keeps it for
 * the life of the component. Artifacts are immutable, so there is no refetch
 * on re-open; `retry` exists only for failed requests.
 */
export function useLazyText(url: string | null) {
  const [state, setState] = useState<LazyTextState>({ status: "idle" });

  const load = useCallback(async () => {
    if (url === null) return;
    setState({ status: "loading" });
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Request returned ${response.status}`);
      }
      setState({ status: "ok", text: await response.text() });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Request failed",
      });
    }
  }, [url]);

  const loadOnce = useCallback(() => {
    if (state.status === "idle") void load();
  }, [state.status, load]);

  return { state, loadOnce, retry: load };
}
