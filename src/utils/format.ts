/**
 * Formats a hashrate value (in H/s) into adaptive value and unit parts.
 */
export function formatHashrateParts(hr: number): { value: string; unit: string } {
  if (!Number.isFinite(hr) || hr <= 0) {
    return { value: "0.00", unit: "H/s" };
  }
  if (hr >= 1_000_000) {
    return { value: (hr / 1_000_000).toFixed(2), unit: "MH/s" };
  }
  if (hr >= 1_000) {
    return { value: (hr / 1_000).toFixed(2), unit: "kH/s" };
  }
  return {
    value: hr < 1 ? hr.toFixed(2) : Math.round(hr).toString(),
    unit: "H/s",
  };
}

/**
 * Formats a hashrate value (in H/s) as a single display string.
 */
export function formatHashrate(hr: number): string {
  const { value, unit } = formatHashrateParts(hr);
  return `${value} ${unit}`;
}

