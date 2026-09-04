import type { StatusSnapshot } from "../contracts";
import type { DisplayMode } from "../lib/displayMode";
import SampleGrid from "./SampleGrid";

export type DashboardMonitor =
  StatusSnapshot["panels"][number]["monitors"][number];

interface MonitorCardProps {
  monitor: DashboardMonitor;
  snapshotGeneratedAt: number;
  displayMode?: DisplayMode;
}

type MonitorHealthTone = "ok" | "issue" | "unknown";

interface MonitorHealth {
  label: string;
  tone: MonitorHealthTone;
}

function getLatestSample(
  samples: readonly DashboardMonitor["samples"][number][],
): DashboardMonitor["samples"][number] | undefined {
  return samples.reduce<DashboardMonitor["samples"][number] | undefined>(
    (latest, sample) => (!latest || sample.t > latest.t ? sample : latest),
    undefined,
  );
}

function getMonitorHealth(monitor: DashboardMonitor): MonitorHealth {
  const latestSample = getLatestSample(monitor.samples);

  if (!latestSample || latestSample.s === "missing") {
    return { label: "暂无数据", tone: "unknown" };
  }

  if (latestSample.s === "ok" && latestSample.v !== null) {
    return { label: "运行正常", tone: "ok" };
  }

  return { label: "需要关注", tone: "issue" };
}

export default function MonitorCard({
  monitor,
  snapshotGeneratedAt,
  displayMode = "lg",
}: MonitorCardProps) {
  const health = getMonitorHealth(monitor);

  if (displayMode === "nav") {
    const identity = (
      <div className="monitor-card__nav-identity">
        {monitor.logoUrl ? (
          <img className="monitor-card__logo" src={monitor.logoUrl} alt="" />
        ) : (
          <span className="monitor-card__mark" aria-hidden="true">
            {monitor.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="monitor-card__nav-name">{monitor.name}</span>
      </div>
    );

    return (
      <article
        className="monitor-card monitor-card--nav"
        data-testid="monitor-card"
      >
        {monitor.linkUrl ? (
          <a className="monitor-card__nav-link" href={monitor.linkUrl}>
            {identity}
          </a>
        ) : (
          identity
        )}
      </article>
    );
  }

  return (
    <article
      className={`monitor-card monitor-card--${health.tone}`}
      data-testid="monitor-card"
    >
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
            <p className="monitor-card__subtitle">最近 24 小时状态</p>
          </div>
        </div>
        <div
          className={`monitor-card__health monitor-card__health--${health.tone}`}
          aria-label={`当前状态：${health.label}`}
        >
          <span className="monitor-card__health-dot" aria-hidden="true" />
          <span>{health.label}</span>
        </div>
      </header>

      <SampleGrid
        kind={monitor.kind}
        samples={monitor.samples}
        anchorSeconds={snapshotGeneratedAt}
      />
    </article>
  );
}
