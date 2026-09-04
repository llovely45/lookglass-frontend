import { useId } from "react";

import type { MonitorKind } from "../contracts";
import {
  COLOR_DARK_GREEN,
  COLOR_GREEN,
  COLOR_LIGHT_GREEN,
  COLOR_ORANGE,
  COLOR_RED,
  COLOR_YELLOW,
} from "../lib/status";

interface LegendEntry {
  label: string;
  color: string;
  className: string;
}

const HTTP_ENTRIES: readonly LegendEntry[] = [
  { label: ">10s", color: COLOR_RED, className: "http-over-10s" },
  { label: "3s-10s", color: COLOR_ORANGE, className: "http-3s-10s" },
  { label: "1s-3s", color: COLOR_LIGHT_GREEN, className: "http-1s-3s" },
  { label: "0.5s-1s", color: COLOR_GREEN, className: "http-0-5s-1s" },
  { label: "<=0.5s", color: COLOR_DARK_GREEN, className: "http-up-to-0-5s" },
];

const TCPING_ENTRIES: readonly LegendEntry[] = [
  { label: "超时", color: COLOR_RED, className: "tcping-timeout" },
  { label: ">250ms", color: COLOR_ORANGE, className: "tcping-over-250ms" },
  {
    label: "201ms-250ms",
    color: COLOR_YELLOW,
    className: "tcping-201ms-250ms",
  },
  {
    label: "101ms-200ms",
    color: COLOR_LIGHT_GREEN,
    className: "tcping-101ms-200ms",
  },
  {
    label: "51ms-100ms",
    color: COLOR_GREEN,
    className: "tcping-51ms-100ms",
  },
  { label: "<=50ms", color: COLOR_DARK_GREEN, className: "tcping-up-to-50ms" },
];

interface StatusLegendProps {
  kind: MonitorKind;
}

export default function StatusLegend({ kind }: StatusLegendProps) {
  const headingId = useId();
  const entries = kind === "tcping" ? TCPING_ENTRIES : HTTP_ENTRIES;
  const heading = kind === "tcping" ? "TCPing 延迟" : "HTTP GET 延迟";

  return (
    <section
      className="status-legend"
      data-testid={`${kind}-legend`}
      aria-labelledby={headingId}
    >
      <h3 id={headingId}>{heading}</h3>
      <ul className="status-legend__list">
        {entries.map((entry) => (
          <li key={entry.label} className="status-legend__item">
            <span
              className={`status-legend__swatch status-legend__swatch--${entry.className}`}
              aria-hidden="true"
              data-color={entry.color}
              style={{ backgroundColor: entry.color }}
            />
            <span>{entry.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
