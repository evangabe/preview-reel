export interface LogLineView {
  at: string | null;
  data: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseLogLines(text: string): LogLineView[] {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();

  return lines.map((line) => {
    try {
      const parsed: unknown = JSON.parse(line);
      if (!isRecord(parsed) || typeof parsed.data !== "string") {
        return { at: null, data: line };
      }

      return {
        at: typeof parsed.at === "string" ? parsed.at : null,
        data: parsed.data,
      };
    } catch {
      return { at: null, data: line };
    }
  });
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

export function formatLogTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  return [
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`,
    `${pad(date.getUTCHours(), 2)}:${pad(date.getUTCMinutes(), 2)}:${pad(date.getUTCSeconds(), 2)}.${pad(date.getUTCMilliseconds(), 3)}`,
    "UTC",
  ].join(" ");
}
