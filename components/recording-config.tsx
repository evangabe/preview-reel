"use client";

import { useState } from "react";
import { ChevronDown, Download } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";

function containsResolvedCredential(config: string): boolean {
  const checks = [
    ["token", "${DEMO_LOGIN_TOKEN}"],
    [
      "x-vercel-protection-bypass",
      "${VERCEL_PROTECTION_BYPASS}",
    ],
  ] as const;

  return checks.some(([parameter, placeholder]) => {
    const value = new RegExp(
      `[?&]${parameter}=([^&"\\\\\\s]+)`,
    ).exec(config)?.[1];
    return value !== undefined && value !== placeholder;
  });
}

export function RecordingConfig({ configUrl }: { configUrl: string }) {
  const [config, setConfig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadConfig(open: boolean) {
    if (!open || config !== null || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(configUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Config download returned ${response.status}`);
      }
      const text = await response.text();
      if (containsResolvedCredential(text)) {
        console.error("Recording config contains a resolved credential");
        setError(
          "This config was hidden because it contains a resolved credential.",
        );
        return;
      }
      setConfig(text);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Config download failed",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Collapsible
      onOpenChange={(open) => {
        void loadConfig(open);
      }}
      className="rounded-xl border"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium">
          <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
          Recording config
        </CollapsibleTrigger>
        <a
          href={configUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Download className="size-3.5" aria-hidden="true" />
          Download JSON
        </a>
      </div>
      <CollapsibleContent className="border-t">
        <div className="p-4">
          {loading ? <Skeleton className="h-48 w-full" /> : null}
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Config unavailable</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {config ? (
            <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed">
              {config}
            </pre>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
