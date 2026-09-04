import type { MonitorKind, StatusSample } from "../contracts";

export const COLOR_RED = "#e61511";
export const COLOR_ORANGE = "#f79833";
export const COLOR_YELLOW = "#f7ec44";
export const COLOR_LIGHT_GREEN = "#bdf663";
export const COLOR_GREEN = "#41dd3f";
export const COLOR_DARK_GREEN = "#24aa1d";
export const COLOR_NEUTRAL_GRAY = "#d1d5db";

export const RED = COLOR_RED;
export const ORANGE = COLOR_ORANGE;
export const YELLOW = COLOR_YELLOW;
export const LIGHT_GREEN = COLOR_LIGHT_GREEN;
export const GREEN = COLOR_GREEN;
export const DARK_GREEN = COLOR_DARK_GREEN;
export const NEUTRAL_GRAY = COLOR_NEUTRAL_GRAY;

function isUsableLatency(sample: StatusSample): sample is StatusSample & { v: number } {
  return (
    sample.s === "ok" &&
    typeof sample.v === "number" &&
    Number.isFinite(sample.v) &&
    sample.v >= 0
  );
}

export function getSampleColor(
  kind: MonitorKind,
  sample: StatusSample,
): string {
  if (sample.s === "missing") {
    return COLOR_NEUTRAL_GRAY;
  }

  if (sample.s !== "ok") {
    return COLOR_RED;
  }

  if (!isUsableLatency(sample)) {
    return COLOR_NEUTRAL_GRAY;
  }

  if (kind === "tcping") {
    if (sample.v > 250) return COLOR_ORANGE;
    if (sample.v > 200) return COLOR_YELLOW;
    if (sample.v > 100) return COLOR_LIGHT_GREEN;
    if (sample.v > 50) return COLOR_GREEN;
    return COLOR_DARK_GREEN;
  }

  if (sample.v > 10_000) return COLOR_RED;
  if (sample.v > 3_000) return COLOR_ORANGE;
  if (sample.v > 1_000) return COLOR_LIGHT_GREEN;
  if (sample.v > 500) return COLOR_GREEN;
  return COLOR_DARK_GREEN;
}
