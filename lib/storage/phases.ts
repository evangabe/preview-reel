import type { RunMode, RunStage } from "./runs";
import type { RunStatusView } from "./status";

export type Phase =
  | "scoping"
  | "provisioning"
  | "exploring"
  | "recording"
  | "uploading";

export type PhaseState = "pending" | "active" | "complete" | "failed";

export interface PhaseView {
  phase: Phase;
  state: PhaseState;
}

const ALL_PHASES: Phase[] = [
  "scoping",
  "provisioning",
  "exploring",
  "recording",
  "uploading",
];

function phaseForStage(stage: RunStage): Phase {
  switch (stage) {
    case "scope":
    case "comment":
      return "scoping";
    case "provision":
      return "provisioning";
    case "explore":
      return "exploring";
    case "record":
      return "recording";
    case "upload":
      return "uploading";
  }
}

export function phaseList(
  mode: RunMode,
  status: RunStatusView,
): PhaseView[] {
  const phases =
    mode === "record-only"
      ? ALL_PHASES.filter((phase) => phase !== "exploring")
      : ALL_PHASES;

  if (status.state === "done") {
    return phases.map((phase) => ({ phase, state: "complete" }));
  }

  const currentPhase = phaseForStage(
    status.state === "failed" ? status.failure.stage : status.stage,
  );
  const currentIndex = phases.indexOf(currentPhase);

  return phases.map((phase, index) => {
    if (index < currentIndex) return { phase, state: "complete" };
    if (index > currentIndex) return { phase, state: "pending" };
    return {
      phase,
      state: status.state === "failed" ? "failed" : "active",
    };
  });
}
