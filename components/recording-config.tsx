"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { Download } from "lucide-react";

import { ConfigSteps } from "@/components/config-steps";
import { Disclosure } from "@/components/disclosure";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLazyText } from "@/components/use-lazy-text";
import { extractSteps } from "@/lib/config/steps";
import { cn } from "@/lib/utils";

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

const TABS = [
  { id: "steps", label: "Steps" },
  { id: "raw", label: "Raw JSON" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function ConfigTabs({
  value,
  onChange,
  idPrefix,
}: {
  value: TabId;
  onChange: (tab: TabId) => void;
  idPrefix: string;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((tab) => tab.id === value);
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % TABS.length
        : event.key === "ArrowLeft"
          ? (index - 1 + TABS.length) % TABS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? TABS.length - 1
              : -1;
    if (next === -1) return;
    event.preventDefault();
    onChange(TABS[next].id);
    document.getElementById(`${idPrefix}-tab-${TABS[next].id}`)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Recording config view"
      className="flex gap-1"
      onKeyDown={onKeyDown}
    >
      {TABS.map((tab) => {
        const selected = tab.id === value;
        return (
          <Button
            key={tab.id}
            id={`${idPrefix}-tab-${tab.id}`}
            role="tab"
            variant="ghost"
            size="sm"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              "rounded-md text-muted-foreground",
              selected &&
                "text-foreground underline decoration-2 underline-offset-[10px]",
            )}
          >
            {tab.label}
          </Button>
        );
      })}
    </div>
  );
}

function ConfigBody({ text }: { text: string }) {
  const [tab, setTab] = useState<TabId>("steps");
  const idPrefix = useId();
  const steps = useMemo(() => extractSteps(text), [text]);

  return (
    <div className="space-y-4">
      <ConfigTabs value={tab} onChange={setTab} idPrefix={idPrefix} />
      <div
        role="tabpanel"
        id={`${idPrefix}-panel-steps`}
        aria-labelledby={`${idPrefix}-tab-steps`}
        hidden={tab !== "steps"}
      >
        {steps.ok ? (
          <ConfigSteps videos={steps.videos} />
        ) : (
          <Alert>
            <AlertTitle>Steps could not be listed</AlertTitle>
            <AlertDescription>
              {steps.reason} The Raw JSON tab shows the file as saved.
            </AlertDescription>
          </Alert>
        )}
      </div>
      <div
        role="tabpanel"
        id={`${idPrefix}-panel-raw`}
        aria-labelledby={`${idPrefix}-tab-raw`}
        hidden={tab !== "raw"}
      >
        <pre
          tabIndex={0}
          className="max-h-96 overflow-auto rounded-lg bg-muted/40 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {text}
        </pre>
      </div>
    </div>
  );
}

export function RecordingConfig({ configUrl }: { configUrl: string }) {
  const { state, loadOnce, retry } = useLazyText(configUrl);
  const hasResolvedCredential =
    state.status === "ok" && containsResolvedCredential(state.text);

  if (hasResolvedCredential) {
    console.error("Recording config contains a resolved credential");
  }

  return (
    <Disclosure
      title="Recording config"
      onOpenChange={(open) => {
        if (open) loadOnce();
      }}
      trailing={
        <a
          href={configUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Download JSON
          <Download className="size-3.5" aria-hidden="true" />
        </a>
      }
    >
      {state.status === "idle" || state.status === "loading" ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading config">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : null}
      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Config unavailable</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{state.message}</p>
            <Button variant="outline" size="sm" onClick={() => void retry()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {state.status === "ok" && hasResolvedCredential ? (
        <Alert variant="destructive">
          <AlertTitle>Config unavailable</AlertTitle>
          <AlertDescription>
            This config was hidden because it contains a resolved credential.
          </AlertDescription>
        </Alert>
      ) : null}
      {state.status === "ok" && !hasResolvedCredential ? (
        <ConfigBody text={state.text} />
      ) : null}
    </Disclosure>
  );
}
