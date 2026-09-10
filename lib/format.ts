export function formatDuration(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1_000);
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** Reported Gateway spend, displayed at currency precision. */
export function formatCost(value: number | null): string {
  if (value === null) return "not reported";
  return `$${value.toFixed(2)}`;
}
