import type { RunRecord } from "@/lib/storage/runs";
import type { RunStatusView } from "@/lib/storage/status";

function relativeTime(iso: string): string {
  const seconds = Math.round((Date.parse(iso) - Date.now()) / 1_000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

function statusLabel(status: RunStatusView): string {
  if (status.state === "done") return "Ready";
  if (status.state === "failed") return "Failed";

  switch (status.stage) {
    case "scope":
    case "comment":
      return "Scoping";
    case "provision":
      return "Provisioning";
    case "explore":
      return "Exploring";
    case "record":
      return "Recording";
    case "upload":
      return "Uploading";
  }
}

function statusColor(status: RunStatusView): string {
  if (status.state === "done") return "bg-emerald-400";
  if (status.state === "failed") return "bg-rose-400";
  return "bg-amber-400";
}

export function RunMetadata({
  record,
  status,
}: {
  record: RunRecord | null;
  status: RunStatusView;
}) {
  if (!record) {
    return (
      <p className="text-sm text-muted-foreground">
        Run details are being initialized.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${statusColor(status)}`}
          />
          <span className="text-foreground">{statusLabel(status)}</span>
        </span>
        <span>
          {record.mode === "record-only" ? "Record only" : "Full pipeline"}
        </span>
        <time
          dateTime={record.startedAt}
          title={new Date(record.startedAt).toISOString()}
          suppressHydrationWarning
        >
          Started {relativeTime(record.startedAt)}
        </time>
      </div>
      {record.thinInput ? (
        <p className="text-sm text-muted-foreground">
          PR body was empty; scoping used the title and diff only.
        </p>
      ) : null}
    </div>
  );
}
