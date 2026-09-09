export type RunnerStage = "provision" | "explore" | "record" | "upload";

export class RunnerFailure extends Error {
  constructor(
    readonly stage: RunnerStage,
    readonly reason: string,
    readonly detail: string,
  ) {
    super(`${stage}/${reason}: ${detail}`);
    this.name = "RunnerFailure";
  }
}

export function isRunnerFailure(error: unknown): error is RunnerFailure {
  return error instanceof RunnerFailure;
}
