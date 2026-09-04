import { useId } from "react";

import type { MonitorKind, StatusSample } from "../contracts";
import { COLOR_NEUTRAL_GRAY, getSampleColor } from "../lib/status";

export const SAMPLE_SLOT_COUNT = 48;
export const HALF_HOUR_SECONDS = 1_800;

const SAMPLE_STATE_LABELS: Record<StatusSample["s"], string> = {
  ok: "OK",
  http_error: "HTTP error",
  timeout: "Timeout",
  error: "Error",
  missing: "Missing",
};

function currentHalfHourSeconds(): number {
  return (
    Math.floor(Date.now() / 1_000 / HALF_HOUR_SECONDS) * HALF_HOUR_SECONDS
  );
}

export function normalizeSamples(
  samples: readonly StatusSample[],
  anchorSeconds: number = currentHalfHourSeconds(),
): StatusSample[] {
  const safeAnchor = Number.isFinite(anchorSeconds)
    ? Math.floor(anchorSeconds / HALF_HOUR_SECONDS) * HALF_HOUR_SECONDS
    : currentHalfHourSeconds();
  const latestSampleSeconds = samples.reduce(
    (latest, sample) => Math.max(latest, sample.t),
    Number.NEGATIVE_INFINITY,
  );
  const latestSampleBucket = Number.isFinite(latestSampleSeconds)
    ? Math.floor(latestSampleSeconds / HALF_HOUR_SECONDS) * HALF_HOUR_SECONDS
    : Number.NEGATIVE_INFINITY;
  const latestBucket = Math.max(safeAnchor, latestSampleBucket);
  const samplesByBucket = new Map<number, StatusSample>();

  for (const sample of samples) {
    const bucket =
      Math.floor(sample.t / HALF_HOUR_SECONDS) * HALF_HOUR_SECONDS;
    const existingSample = samplesByBucket.get(bucket);
    if (!existingSample || sample.t > existingSample.t) {
      samplesByBucket.set(bucket, sample);
    }
  }

  return Array.from({ length: SAMPLE_SLOT_COUNT }, (_, index) => {
    const timestamp =
      latestBucket -
      (SAMPLE_SLOT_COUNT - 1 - index) * HALF_HOUR_SECONDS;
    const sample = samplesByBucket.get(timestamp);
    return sample
      ? { ...sample, t: timestamp }
      : { t: timestamp, s: "missing", v: null };
  });
}

function localTimeLabel(timestamp: number): string {
  return new Date(timestamp * 1_000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sampleLabel(sample: StatusSample): string {
  const details = [
    `Local time: ${localTimeLabel(sample.t)}`,
    `State: ${SAMPLE_STATE_LABELS[sample.s]}`,
    `Latency: ${sample.v === null ? "unavailable" : `${sample.v} ms`}`,
  ];

  if (typeof sample.code === "number") {
    details.push(`HTTP code: ${sample.code}`);
  }

  return details.join("; ");
}

interface SampleGridProps {
  kind: MonitorKind;
  samples: readonly StatusSample[];
  anchorSeconds?: number;
}

export default function SampleGrid({
  kind,
  samples,
  anchorSeconds,
}: SampleGridProps) {
  const headingId = useId();
  const normalizedSamples = normalizeSamples(samples, anchorSeconds);

  return (
    <section className="sample-grid-section" aria-labelledby={headingId}>
      <div className="sample-grid-heading-row">
        <h3 id={headingId}>Last 48 half-hour checks</h3>
        <span className="sample-grid-range">Newest on the right</span>
      </div>
      <div className="sample-grid-scroll" tabIndex={0}>
        <div className="sample-grid" role="group" aria-label="48 status samples">
          {normalizedSamples.map((sample) => {
            const color =
              sample.s === "missing"
                ? COLOR_NEUTRAL_GRAY
                : getSampleColor(kind, sample);
            const label = sampleLabel(sample);

            return (
              <button
                key={`${sample.t}-${sample.s}`}
                className="sample-cell"
                type="button"
                data-testid="sample-cell"
                data-status={sample.s}
                data-timestamp={sample.t}
                data-color={color}
                aria-label={label}
                title={label}
                style={{ backgroundColor: color }}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
