import type { StatusSnapshot } from "../contracts";
import SampleGrid from "./SampleGrid";
import StatusLegend from "./StatusLegend";

export type DashboardMonitor =
  StatusSnapshot["panels"][number]["monitors"][number];

interface MonitorCardProps {
  monitor: DashboardMonitor;
  snapshotGeneratedAt: number;
}

function monitorKindLabel(kind: DashboardMonitor["kind"]): string {
  return kind === "tcping" ? "TCPing" : "HTTP GET";
}

export default function MonitorCard({
  monitor,
  snapshotGeneratedAt,
}: MonitorCardProps) {
  return (
    <article className="monitor-card" data-testid="monitor-card">
      <header className="monitor-card__header">
        <div className="monitor-card__identity">
          {monitor.logoUrl ? (
            <img className="monitor-card__logo" src={monitor.logoUrl} alt="" />
          ) : (
            <span className="monitor-card__mark" aria-hidden="true">
              {monitor.name.charAt(0).toUpperCase()}
            </span>
          )}
          <div>
            <h3 className="monitor-card__name">{monitor.name}</h3>
            <p className="monitor-card__kind">{monitorKindLabel(monitor.kind)}</p>
          </div>
        </div>
        <p className="monitor-card__target">
          <span className="sr-only">Target: </span>
          <code>{monitor.target}</code>
        </p>
      </header>

      <SampleGrid
        kind={monitor.kind}
        samples={monitor.samples}
        anchorSeconds={snapshotGeneratedAt}
      />
      <StatusLegend kind={monitor.kind} />
    </article>
  );
}
