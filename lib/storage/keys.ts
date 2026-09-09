export type DemoArtifactName =
  | "config.json"
  | "video.mp4"
  | "poster.png"
  | "metadata.json";

export interface DemoIdentity {
  owner: string;
  repo: string;
  prNumber: number;
  deploymentId: string;
}

export interface PrIdentity {
  owner: string;
  repo: string;
  prNumber: number;
}

function component(value: string, label: string): string {
  if (
    value.length === 0 ||
    value === "." ||
    value === ".." ||
    value === "by-pr" ||
    /[/\\\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`${label} is not a safe Blob path component`);
  }
  return value;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

export function demoPrefix(identity: DemoIdentity): string {
  const owner = component(identity.owner, "owner");
  const repo = component(identity.repo, "repo");
  const prNumber = positiveInteger(identity.prNumber, "prNumber");
  const deploymentId = component(identity.deploymentId, "deploymentId");
  return `demos/${owner}/${repo}/pr-${prNumber}/${deploymentId}`;
}

export function demoArtifactKey(
  identity: DemoIdentity,
  artifact: DemoArtifactName,
): string {
  return `${demoPrefix(identity)}/${artifact}`;
}

export function demoArtifactKeys(identity: DemoIdentity) {
  return {
    config: demoArtifactKey(identity, "config.json"),
    video: demoArtifactKey(identity, "video.mp4"),
    poster: demoArtifactKey(identity, "poster.png"),
    metadata: demoArtifactKey(identity, "metadata.json"),
  } as const;
}

export function prDemosPrefix(identity: PrIdentity): string {
  const owner = component(identity.owner, "owner");
  const repo = component(identity.repo, "repo");
  const prNumber = positiveInteger(identity.prNumber, "prNumber");
  return `demos/${owner}/${repo}/pr-${prNumber}/`;
}

export function prRunsPrefix(identity: PrIdentity): string {
  const owner = component(identity.owner, "owner");
  const repo = component(identity.repo, "repo");
  const prNumber = positiveInteger(identity.prNumber, "prNumber");
  return `runs/by-pr/${owner}/${repo}/pr-${prNumber}/`;
}

export function prRunIndexKey(
  identity: PrIdentity,
  runId: string,
): string {
  return `${prRunsPrefix(identity)}${component(runId, "runId")}.json`;
}

export function deploymentSentinelKey(deploymentId: string): string {
  return `runs/${component(deploymentId, "deploymentId")}/sentinel.json`;
}

export function runRecordKey(runId: string): string {
  return `runs/${component(runId, "runId")}/run.json`;
}

export function runEventsPrefix(runId: string): string {
  return `runs/${component(runId, "runId")}/events/`;
}

export function runEventKey(
  runId: string,
  sequence: number,
  stage: string,
): string {
  const safeRunId = component(runId, "runId");
  if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > 9_999) {
    throw new Error("sequence must be an integer between 0 and 9999");
  }
  if (!/^[a-z][a-z0-9-]*$/.test(stage)) {
    throw new Error("stage must be a lowercase slug");
  }
  return `runs/${safeRunId}/events/${String(sequence).padStart(4, "0")}-${stage}.json`;
}

export function runLogsKey(runId: string): string {
  return `runs/${component(runId, "runId")}/logs.jsonl`;
}

export function runExploreTranscriptKey(runId: string): string {
  return `runs/${component(runId, "runId")}/explore-transcript.jsonl`;
}
