import { STATUS_URL } from "../env";
import type {
  MonitorKind,
  StatusSample,
  StatusSnapshot,
} from "../contracts";

const HALF_HOUR_SECONDS = 1_800;
const STALE_AFTER_SECONDS = 90 * 60;
const CURRENT_MINUTE_PARAMETER = "minute";

const MONITOR_KINDS: readonly MonitorKind[] = ["http_get", "tcping"];
const SAMPLE_STATUSES: readonly StatusSample["s"][] = [
  "ok",
  "http_error",
  "timeout",
  "error",
  "missing",
];

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(path: string, expectation: string): never {
  throw new Error(`Invalid status snapshot: ${path} ${expectation}`);
}

function recordAt(value: unknown, path: string): JsonRecord {
  if (!isRecord(value)) {
    invalid(path, "must be an object");
  }

  return value;
}

function arrayAt(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    invalid(path, "must be an array");
  }

  return value;
}

function nonEmptyStringAt(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    invalid(path, "must be a non-empty string");
  }

  return value;
}

function stringOrNullAt(value: unknown, path: string): string | null {
  if (value !== null && typeof value !== "string") {
    invalid(path, "must be a string or null");
  }

  return value;
}

function unixSecondsAt(value: unknown, path: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    invalid(path, "must be a non-negative integer Unix timestamp");
  }

  return value;
}

function nonNegativeNumberAt(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    invalid(path, "must be a non-negative number");
  }

  return value;
}

function validateSample(value: unknown, path: string): void {
  const sample = recordAt(value, path);
  unixSecondsAt(sample.t, `${path}.t`);

  if (
    typeof sample.s !== "string" ||
    !SAMPLE_STATUSES.includes(sample.s as StatusSample["s"])
  ) {
    invalid(`${path}.s`, "must be a recognized status");
  }

  if (sample.s === "ok") {
    nonNegativeNumberAt(sample.v, `${path}.v`);
  } else if (sample.v !== null) {
    invalid(`${path}.v`, "must be null for a non-ok sample");
  }

  if ("code" in sample) {
    if (
      typeof sample.code !== "number" ||
      !Number.isFinite(sample.code) ||
      !Number.isInteger(sample.code) ||
      sample.code < 100 ||
      sample.code > 599
    ) {
      invalid(`${path}.code`, "must be an HTTP status code");
    }
  }
}

function validateSnapshotShape(value: unknown): StatusSnapshot {
  const snapshot = recordAt(value, "snapshot");
  unixSecondsAt(snapshot.generatedAt, "generatedAt");
  unixSecondsAt(snapshot.expiresAt, "expiresAt");

  if (snapshot.intervalSeconds !== HALF_HOUR_SECONDS) {
    invalid("intervalSeconds", `must be ${HALF_HOUR_SECONDS}`);
  }

  const panels = arrayAt(snapshot.panels, "panels");
  const panelIds = new Set<string>();
  const monitorIds = new Set<string>();

  panels.forEach((panelValue, panelIndex) => {
    const panelPath = `panels[${panelIndex}]`;
    const panel = recordAt(panelValue, panelPath);
    const panelId = nonEmptyStringAt(panel.id, `${panelPath}.id`);

    if (panelIds.has(panelId)) {
      invalid(`${panelPath}.id`, "must be unique");
    }
    panelIds.add(panelId);

    nonEmptyStringAt(panel.name, `${panelPath}.name`);
    stringOrNullAt(panel.logoUrl, `${panelPath}.logoUrl`);

    const monitors = arrayAt(panel.monitors, `${panelPath}.monitors`);
    monitors.forEach((monitorValue, monitorIndex) => {
      const monitorPath = `${panelPath}.monitors[${monitorIndex}]`;
      const monitor = recordAt(monitorValue, monitorPath);
      const monitorId = nonEmptyStringAt(monitor.id, `${monitorPath}.id`);

      if (monitorIds.has(monitorId)) {
        invalid(`${monitorPath}.id`, "must be unique");
      }
      monitorIds.add(monitorId);

      nonEmptyStringAt(monitor.name, `${monitorPath}.name`);
      stringOrNullAt(monitor.logoUrl, `${monitorPath}.logoUrl`);
      if (
        typeof monitor.kind !== "string" ||
        !MONITOR_KINDS.includes(monitor.kind as MonitorKind)
      ) {
        invalid(`${monitorPath}.kind`, "must be http_get or tcping");
      }
      nonEmptyStringAt(monitor.target, `${monitorPath}.target`);

      const samples = arrayAt(monitor.samples, `${monitorPath}.samples`);
      samples.forEach((sample, sampleIndex) =>
        validateSample(sample, `${monitorPath}.samples[${sampleIndex}]`),
      );
    });
  });

  return snapshot as unknown as StatusSnapshot;
}

export function validateStatusSnapshot(value: unknown): StatusSnapshot {
  return validateSnapshotShape(value);
}

export async function loadStatusSnapshot(
  configuredUrl: string = STATUS_URL,
): Promise<StatusSnapshot> {
  if (typeof configuredUrl !== "string" || configuredUrl.trim().length === 0) {
    throw new Error("VITE_STATUS_URL is not configured");
  }

  let requestUrl: URL;
  try {
    requestUrl = new URL(configuredUrl);
  } catch {
    throw new Error("VITE_STATUS_URL must be an absolute URL");
  }

  if (requestUrl.protocol !== "http:" && requestUrl.protocol !== "https:") {
    throw new Error("VITE_STATUS_URL must use http or https");
  }

  requestUrl.searchParams.set(
    CURRENT_MINUTE_PARAMETER,
    String(Math.floor(Date.now() / 60_000)),
  );

  const response = await fetch(requestUrl.toString(), { cache: "no-store" });
  const isSuccessfulResponse =
    typeof response.status === "number"
      ? response.status >= 200 && response.status < 300
      : response.ok === true;
  if (!isSuccessfulResponse) {
    throw new Error(`Status snapshot request failed with HTTP ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Status snapshot response was not valid JSON");
  }

  return validateSnapshotShape(payload);
}

export function isSnapshotStale(
  snapshot: StatusSnapshot,
  nowSeconds: number = Math.floor(Date.now() / 1_000),
): boolean {
  return (
    nowSeconds > snapshot.expiresAt ||
    nowSeconds - snapshot.generatedAt > STALE_AFTER_SECONDS
  );
}
