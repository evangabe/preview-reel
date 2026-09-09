import type { RunFailure } from "@/lib/storage/runs";

export const COMMENT_MARKER_PREFIX = "<!-- preview-reel:pr-";

export function commentMarker(prNumber: number): string {
  return `${COMMENT_MARKER_PREFIX}${prNumber} -->`;
}

export type CommentState =
  | { state: "in_progress"; title: string; statusUrl: string }
  | {
      state: "done";
      title: string;
      statusUrl: string;
      posterUrl: string;
      configUrl: string;
    }
  | {
      state: "failed";
      title: string;
      statusUrl: string;
      failure: RunFailure;
    };

export function renderComment(
  prNumber: number,
  state: CommentState,
): string {
  const marker = commentMarker(prNumber);

  if (state.state === "in_progress") {
    return [
      marker,
      "",
      `Recording a demo of **${state.title}** on this preview. Usually takes about three minutes. [Watch progress](${state.statusUrl})`,
    ].join("\n");
  }

  if (state.state === "done") {
    return [
      marker,
      "",
      `[![${state.title}](${state.posterUrl})](${state.statusUrl})`,
      "",
      `**${state.title}**`,
      "",
      `[Watch the demo](${state.statusUrl}) · [View the recording config](${state.configUrl})`,
    ].join("\n");
  }

  return [
    marker,
    "",
    `Demo recording failed during **${state.failure.stage}**: ${state.failure.reason}. ${state.failure.detail} [Run log and re-run](${state.statusUrl})`,
  ].join("\n");
}
