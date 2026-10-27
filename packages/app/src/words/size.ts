const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** A size as Finder says it (spec 047, D): in thousands, one decimal under 10, "4.1 GB", "850 MB". */
export function sizeText(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 999.5 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${unit > 0 && value < 9.95 ? value.toFixed(1) : String(Math.round(value))} ${units[unit] ?? 'TB'}`;
}
