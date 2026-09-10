/**
 * Read-only helpers for presenting a persisted WebReel config as a step list.
 *
 * The config is whatever the explorer emitted, so nothing here validates or
 * filters. Labels are a lookup over the step contract the repo asks the model
 * for (`lib/scope/schema.ts`); any other action falls back to its raw name and
 * stays fully inspectable.
 */

export interface VideoSteps {
  name: string;
  /** Resolved against the config's baseUrl when the video URL is relative. */
  entryUrl: string | null;
  steps: unknown[];
}

/** `${NAME}` tokens that webreel substitutes from environment variables. */
export const PLACEHOLDER = /\$\{[A-Z0-9_]+\}/g;

/** Splits text into literal runs and placeholder tokens, in order. */
export function splitPlaceholders(
  text: string,
): Array<{ text: string; placeholder: boolean }> {
  const parts: Array<{ text: string; placeholder: boolean }> = [];
  let last = 0;
  for (const match of text.matchAll(PLACEHOLDER)) {
    if (match.index > last) {
      parts.push({ text: text.slice(last, match.index), placeholder: false });
    }
    parts.push({ text: match[0], placeholder: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    parts.push({ text: text.slice(last), placeholder: false });
  }
  return parts;
}

export function entryUrl(video: unknown, baseUrl: unknown): string | null {
  const url = isRecord(video) && typeof video.url === "string" ? video.url : null;
  const base = typeof baseUrl === "string" && baseUrl.length > 0 ? baseUrl : null;
  if (url === null) return base;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || base === null) return url;
  return `${base.replace(/\/+$/, "")}/${url.replace(/^\/+/, "")}`;
}

export type ExtractStepsResult =
  | { ok: true; videos: VideoSteps[] }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractSteps(text: string): ExtractStepsResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "Config is not valid JSON." };
  }
  if (!isRecord(parsed) || !isRecord(parsed.videos)) {
    return { ok: false, reason: "Config has no videos object." };
  }

  const videos: VideoSteps[] = [];
  for (const [name, video] of Object.entries(parsed.videos)) {
    if (!isRecord(video) || !Array.isArray(video.steps)) {
      return { ok: false, reason: `Video "${name}" has no steps array.` };
    }
    videos.push({
      name,
      entryUrl: entryUrl(video, parsed.baseUrl),
      steps: video.steps,
    });
  }
  return { ok: true, videos };
}

const ACTION_LABELS: Record<string, string> = {
  pause: "Pause",
  click: "Click",
  key: "Press key",
  drag: "Drag",
  type: "Type text",
  scroll: "Scroll",
  moveTo: "Move to",
  screenshot: "Take screenshot",
  navigate: "Navigate",
  hover: "Hover",
  select: "Select",
};

export function actionLabel(step: unknown): { label: string; known: boolean } {
  const action = isRecord(step) ? step.action : undefined;
  if (typeof action !== "string" || action.length === 0) {
    return { label: "Unknown action", known: false };
  }
  if (action === "wait") {
    const byText = isRecord(step) && typeof step.text === "string";
    return { label: byText ? "Wait for text" : "Wait for element", known: true };
  }
  const label = ACTION_LABELS[action];
  return label ? { label, known: true } : { label: action, known: false };
}

/** Fields most likely to identify a step at a glance, in preference order. */
const PRIMARY_FIELDS = ["key", "text", "value", "selector", "output", "url"];

export function primaryValue(step: unknown): string {
  if (!isRecord(step)) return "";
  for (const field of PRIMARY_FIELDS) {
    const value = step[field];
    if (typeof value === "string" && value.length > 0) return value;
  }
  if (typeof step.ms === "number") return `${step.ms} ms`;
  if (typeof step.timeout === "number") return `${step.timeout} ms`;
  if (typeof step.x === "number" || typeof step.y === "number") {
    return `${step.x ?? 0}, ${step.y ?? 0}`;
  }
  return "";
}

export function stepDescription(step: unknown): string | null {
  const description = isRecord(step) ? step.description : undefined;
  return typeof description === "string" && description.length > 0
    ? description
    : null;
}
