import { useCallback, useEffect, useRef, useState } from "react";

import type { StatusSnapshot } from "../contracts";
import { SITE_TITLE } from "../env";
import {
  readDisplayMode,
  writeDisplayMode,
  type DisplayMode,
} from "../lib/displayMode";
import { isSnapshotStale, loadStatusSnapshot } from "../lib/statusApi";
import MonitorCard from "../components/MonitorCard";
import PanelTabs, {
  panelContentId,
  panelTabId,
} from "../components/PanelTabs";

const POLL_INTERVAL_MS = 60_000;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "无法加载公开状态快照。";
}

export default function DashboardPage() {
  const [snapshot, setSnapshot] = useState<StatusSnapshot | null>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() =>
    readDisplayMode(),
  );
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const mountedRef = useRef(true);

  const fetchSnapshot = useCallback(async (initialLoad: boolean) => {
    if (initialLoad) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const nextSnapshot = await loadStatusSnapshot();
      if (!mountedRef.current) return;

      setSnapshot(nextSnapshot);
      setError(null);
    } catch (caughtError) {
      if (!mountedRef.current) return;
      setError(errorMessage(caughtError));
    } finally {
      if (!mountedRef.current) return;
      if (initialLoad) {
        setIsLoading(false);
      } else {
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void fetchSnapshot(true);

    const intervalId = window.setInterval(() => {
      void fetchSnapshot(false);
    }, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);
    };
  }, [fetchSnapshot]);

  useEffect(() => {
    if (!snapshot) return;

    setSelectedPanelId((currentPanelId) => {
      if (
        currentPanelId &&
        snapshot.panels.some((panel) => panel.id === currentPanelId)
      ) {
        return currentPanelId;
      }

      return snapshot.panels[0]?.id ?? null;
    });
  }, [snapshot]);

  const siteTitle = SITE_TITLE?.trim() || "Lookglass";
  const snapshotIsStale = snapshot ? isSnapshotStale(snapshot) : false;

  function selectDisplayMode(nextMode: DisplayMode): void {
    setDisplayMode(nextMode);
    writeDisplayMode(nextMode);
  }

  return (
    <main
      className={`dashboard-shell dashboard-shell--public dashboard-shell--${displayMode}`}
    >
      <div className="page-container page-container--public">
        <header className="dashboard-header dashboard-header--public">
          <div className="dashboard-header__main">
            <div className="dashboard-brand">
              <span className="dashboard-brand__mark" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <div className="dashboard-brand__copy">
                <p className="eyebrow">{siteTitle}</p>
                <h1>网络状态</h1>
              </div>
            </div>
            <p className="dashboard-header__description">
              最近 24 小时的服务状态，一眼查看整体连通性。
            </p>
          </div>
          <div className="dashboard-header__side">
            <div className="display-mode-switch" role="group" aria-label="显示模式">
              <span className="display-mode-switch__label">显示模式</span>
              <button
                className={`display-mode-switch__button${displayMode === "lg" ? " display-mode-switch__button--selected" : ""}`}
                type="button"
                aria-pressed={displayMode === "lg"}
                onClick={() => selectDisplayMode("lg")}
              >
                LG
              </button>
              <button
                className={`display-mode-switch__button${displayMode === "nav" ? " display-mode-switch__button--selected" : ""}`}
                type="button"
                aria-pressed={displayMode === "nav"}
                onClick={() => selectDisplayMode("nav")}
              >
                NAV
              </button>
            </div>
            <div
              className={`live-status${snapshotIsStale ? " live-status--stale" : ""}`}
              role="status"
              aria-live="polite"
            >
              <span className="live-status__dot" aria-hidden="true" />
              <span>{snapshotIsStale ? "数据延迟" : "状态监测中"}</span>
            </div>
            {snapshot ? (
              <p className="last-updated" aria-live="polite">
                最近更新：{new Date(snapshot.generatedAt * 1_000).toLocaleString("zh-CN")}
                {isRefreshing ? " · 正在刷新…" : ""}
              </p>
            ) : null}
          </div>
        </header>

        {isLoading && !snapshot ? (
          <section className="state-card" data-testid="dashboard-loading" role="status">
            <span className="loading-indicator" aria-hidden="true" />
            <h2>正在加载状态</h2>
            <p>正在获取最新的公开状态快照。</p>
          </section>
        ) : null}

        {!isLoading && !snapshot ? (
          <section className="state-card state-card--error" data-testid="dashboard-error" role="alert">
            <p className="state-card__eyebrow">状态不可用</p>
            <h2>无法加载状态</h2>
            <p>{error ?? "无法加载公开状态快照。"}</p>
            <button
              className="button button--primary"
              type="button"
              onClick={() => void fetchSnapshot(true)}
            >
              重试
            </button>
          </section>
        ) : null}

        {snapshot && snapshot.panels.length === 0 ? (
          <section className="state-card" data-testid="dashboard-empty" role="status">
            <p className="state-card__eyebrow">暂无分栏</p>
            <h2>还没有公开监控</h2>
            <p>公开状态快照中还没有启用的分栏。</p>
          </section>
        ) : null}

        {snapshot && snapshot.panels.length > 0 ? (
          <section className="dashboard-content" data-testid="dashboard-content">
            {snapshotIsStale ? (
              <div className="status-banner status-banner--stale" data-testid="stale-banner" role="alert">
                <strong>数据已过期。</strong>正在显示最近一次状态，等待新的公开快照。
              </div>
            ) : null}

            {error && !snapshotIsStale ? (
              <div className="status-banner status-banner--warning" role="alert">
                <strong>刷新失败。</strong>正在显示最近一次状态。{error}
              </div>
            ) : null}

            <PanelTabs
              panels={snapshot.panels}
              selectedPanelId={selectedPanelId ?? snapshot.panels[0].id}
              onSelect={setSelectedPanelId}
            />

            {(() => {
              const selectedPanel =
                snapshot.panels.find((panel) => panel.id === selectedPanelId) ??
                snapshot.panels[0];

              return (
                <section
                  className="panel-content"
                  id={panelContentId(selectedPanel.id)}
                  role="tabpanel"
                  aria-labelledby={panelTabId(selectedPanel.id)}
                  tabIndex={0}
                >
                  {displayMode === "lg" ? (
                    <header className="panel-content__header">
                      <div>
                        <p className="eyebrow">状态概览</p>
                        <h2>{selectedPanel.name}</h2>
                      </div>
                      <p className="panel-content__count">
                        {selectedPanel.monitors.length} 项服务
                      </p>
                    </header>
                  ) : null}

                  {selectedPanel.monitors.length > 0 ? (
                    <div className="monitor-list">
                      {selectedPanel.monitors.map((monitor) => (
                        <MonitorCard
                          key={monitor.id}
                          monitor={monitor}
                          snapshotGeneratedAt={snapshot.generatedAt}
                          displayMode={displayMode}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="state-card state-card--nested" data-testid="panel-empty" role="status">
                      <h3>该分栏暂无监控</h3>
                      <p>该分栏中没有启用的监控。</p>
                    </div>
                  )}
                </section>
              );
            })()}
          </section>
        ) : null}
      </div>
    </main>
  );
}
