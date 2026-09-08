/** Calendar days in WITA, regardless of the device's time zone. */
export function daysUntilTrainingEnd(
  endDate?: string,
  now = Date.now(),
): number | null {
  if (!endDate) return null;
  const end = new Date(endDate).getTime();
  if (!Number.isFinite(end)) return null;
  const witaOffset = 8 * 60 * 60 * 1000;
  return Math.max(
    0,
    Math.floor((end + witaOffset) / 86400000) -
      Math.floor((now + witaOffset) / 86400000),
  );
}

export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  // Quoting alone does not stop spreadsheet formula interpretation.
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function formatScoreChange(value: number | null): string {
  return value === null ? "—" : `${value > 0 ? "+" : ""}${value}`;
}
