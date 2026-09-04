import { useCallback, useEffect, useRef, useState } from "react";

import {
  deleteMonitor,
  deletePanel,
  listMonitors,
  listPanels,
  type MonitorRecord,
  type PanelRecord,
  reorderMonitors,
  reorderPanels,
} from "../lib/adminApi";
import MonitorForm from "../components/MonitorForm";
import PanelForm from "../components/PanelForm";
import SortableList from "../components/SortableList";

interface AdminPageProps {
  onUnauthenticated?: () => void;
}

type FormMode = "new" | string | null;

const noop = (): void => undefined;

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function isUnauthorized(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "status" in error) {
    return (error as { status?: unknown }).status === 401;
  }
  return false;
}

function nextSortOrder<T extends { sort_order: number }>(items: readonly T[]): number {
  return items.reduce(
    (highest, item) => Math.max(highest, item.sort_order),
    -1,
  ) + 1;
}

export default function AdminPage({ onUnauthenticated }: AdminPageProps) {
  const handleUnauthenticated = onUnauthenticated ?? noop;
  const [panels, setPanels] = useState<PanelRecord[]>([]);
  const [monitors, setMonitors] = useState<MonitorRecord[]>([]);
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [panelFormMode, setPanelFormMode] = useState<FormMode>(null);
  const [monitorFormMode, setMonitorFormMode] = useState<FormMode>(null);
  const [isLoadingPanels, setIsLoadingPanels] = useState(true);
  const [isLoadingMonitors, setIsLoadingMonitors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const monitorRequestIdRef = useRef(0);
  const selectedPanelIdRef = useRef<string | null>(selectedPanelId);
  selectedPanelIdRef.current = selectedPanelId;

  const handleError = useCallback(
    (caughtError: unknown, fallback: string): void => {
      if (isUnauthorized(caughtError)) {
        handleUnauthenticated();
        return;
      }
      setError(errorMessage(caughtError, fallback));
    },
    [handleUnauthenticated],
  );

  const loadPanels = useCallback(async (): Promise<boolean> => {
    setIsLoadingPanels(true);
    try {
      const nextPanels = await listPanels();
      setPanels(nextPanels);
      setSelectedPanelId((currentPanelId) => {
        if (
          currentPanelId &&
          nextPanels.some((panel) => panel.id === currentPanelId)
        ) {
          return currentPanelId;
        }
        return nextPanels[0]?.id ?? null;
      });
      return true;
    } catch (caughtError) {
      handleError(caughtError, "无法加载分栏。");
      return false;
    } finally {
      setIsLoadingPanels(false);
    }
  }, [handleError]);

  const loadMonitors = useCallback(
    async (panelId: string): Promise<boolean> => {
      if (selectedPanelIdRef.current !== panelId) {
        return false;
      }

      const requestId = monitorRequestIdRef.current + 1;
      monitorRequestIdRef.current = requestId;
      setIsLoadingMonitors(true);
      try {
        const nextMonitors = await listMonitors(panelId);
        if (
          requestId !== monitorRequestIdRef.current ||
          selectedPanelIdRef.current !== panelId
        ) {
          return false;
        }
        setMonitors(nextMonitors);
        return true;
      } catch (caughtError) {
        if (
          requestId !== monitorRequestIdRef.current ||
          selectedPanelIdRef.current !== panelId
        ) {
          return false;
        }
        handleError(caughtError, "无法加载监控。");
        return false;
      } finally {
        if (
          requestId === monitorRequestIdRef.current &&
          selectedPanelIdRef.current === panelId
        ) {
          setIsLoadingMonitors(false);
        }
      }
    },
    [handleError],
  );

  useEffect(() => {
    void loadPanels();
  }, [loadPanels]);

  useEffect(() => {
    monitorRequestIdRef.current += 1;
    setMonitorFormMode(null);
    setNotice(null);
    if (!selectedPanelId) {
      setMonitors([]);
      setIsLoadingMonitors(false);
      return;
    }
    setMonitors([]);
    void loadMonitors(selectedPanelId);
    return () => {
      monitorRequestIdRef.current += 1;
    };
  }, [loadMonitors, selectedPanelId]);

  const selectedPanel = panels.find((panel) => panel.id === selectedPanelId) ?? null;
  const editingPanel =
    panelFormMode && panelFormMode !== "new"
      ? panels.find((panel) => panel.id === panelFormMode)
      : undefined;
  const editingMonitor =
    monitorFormMode && monitorFormMode !== "new"
      ? monitors.find((monitor) => monitor.id === monitorFormMode)
      : undefined;

  async function handlePanelSaved(): Promise<void> {
    setPanelFormMode(null);
    setNotice("分栏已保存，配置将在下一分钟边界生效。");
    await loadPanels();
  }

  async function handleMonitorSaved(): Promise<void> {
    const panelId = selectedPanelId;
    setMonitorFormMode(null);
    setNotice("监控已保存，配置将在下一分钟边界生效。");
    if (panelId) {
      await loadMonitors(panelId);
    }
  }

  async function movePanel(fromIndex: number, toIndex: number): Promise<void> {
    const reordered = [...panels];
    const moving = reordered[fromIndex];
    if (!moving || !reordered[toIndex] || fromIndex === toIndex) return;
    reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moving);

    setError(null);
    setNotice(null);
    try {
      await reorderPanels(
        reordered.map((panel, sortOrder) => ({ id: panel.id, sort_order: sortOrder })),
      );
      setNotice("分栏排序已保存，配置将在下一分钟边界生效。");
      await loadPanels();
    } catch (caughtError) {
      handleError(caughtError, "无法保存分栏排序。");
    }
  }

  async function moveMonitor(fromIndex: number, toIndex: number): Promise<void> {
    const panelId = selectedPanelId;
    const reordered = [...monitors];
    const moving = reordered[fromIndex];
    if (!panelId || !moving || !reordered[toIndex] || fromIndex === toIndex) return;
    reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moving);

    setError(null);
    setNotice(null);
    try {
      await reorderMonitors(
        panelId,
        reordered.map((monitor, sortOrder) => ({ id: monitor.id, sort_order: sortOrder })),
      );
      setNotice("监控排序已保存，配置将在下一分钟边界生效。");
      await loadMonitors(panelId);
    } catch (caughtError) {
      handleError(caughtError, "无法保存监控排序。");
    }
  }

  async function handlePanelDelete(panel: PanelRecord): Promise<void> {
    const confirmed = window.confirm(
      `确定删除分栏“${panel.name}”吗？该操作也会删除其中的监控和检查结果。`,
    );
    if (!confirmed) return;

    setDeletingId(panel.id);
    setError(null);
    try {
      await deletePanel(panel.id);
      if (selectedPanelId === panel.id) {
        setSelectedPanelId(null);
        setMonitors([]);
      }
      setPanelFormMode(null);
      setNotice("分栏已删除，配置将在下一分钟边界生效。");
      await loadPanels();
    } catch (caughtError) {
      handleError(caughtError, "无法删除分栏。");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleMonitorDelete(monitor: MonitorRecord): Promise<void> {
    const confirmed = window.confirm(
      `确定删除监控“${monitor.name}”吗？该操作无法撤销。`,
    );
    if (!confirmed) return;

    setDeletingId(monitor.id);
    setError(null);
    try {
      await deleteMonitor(monitor.id);
      setMonitorFormMode(null);
      setNotice("监控已删除，配置将在下一分钟边界生效。");
      if (selectedPanelId) {
        await loadMonitors(selectedPanelId);
      }
    } catch (caughtError) {
      handleError(caughtError, "无法删除监控。");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="dashboard-shell">
      <div className="page-container admin-page">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Lookglass</p>
            <h1>管理配置</h1>
            <p className="dashboard-header__description">
              管理分栏和公开监控目标，配置将在下一次定时检查时生效。
            </p>
          </div>
          <a className="text-link" href="/">
            公开状态
          </a>
        </header>

        <div className="status-banner admin-boundary-note" role="status">
          配置将在下一分钟边界生效；此页面不会声称会立即触发 Cron。
        </div>

        {error ? (
          <div className="status-banner status-banner--warning" role="alert">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="status-banner" role="status">
            {notice}
          </div>
        ) : null}

        <section className="admin-section" aria-labelledby="panels-heading">
          <div className="admin-section__header">
            <div>
              <p className="state-card__eyebrow">配置</p>
              <h2 id="panels-heading">分栏</h2>
            </div>
            <button
              className="button button--primary"
              type="button"
              onClick={() => {
                setError(null);
                setNotice(null);
                setPanelFormMode("new");
              }}
            >
              新增分栏
            </button>
          </div>

          {panelFormMode ? (
            <PanelForm
              panel={editingPanel}
              defaultSortOrder={nextSortOrder(panels)}
              onSaved={handlePanelSaved}
              onCancel={() => setPanelFormMode(null)}
              onUnauthenticated={handleUnauthenticated}
            />
          ) : null}

          {isLoadingPanels ? (
            <p className="loading-copy" role="status">
              正在加载分栏…
            </p>
          ) : (
            <SortableList
              items={panels}
              getItemLabel={(panel) => panel.name}
              onMove={movePanel}
              emptyMessage="还没有配置分栏。"
              renderItem={(panel) => (
                <div className="admin-list-row">
                  <button
                    className="admin-list-row__select"
                    type="button"
                    aria-pressed={panel.id === selectedPanelId}
                    onClick={() => setSelectedPanelId(panel.id)}
                  >
                    {panel.logo_url ? (
                      <img className="admin-list-row__logo" src={panel.logo_url} alt="" />
                    ) : (
                      <span className="admin-list-row__mark" aria-hidden="true">
                        {panel.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span>
                      <strong>{panel.name}</strong>
                      <small>
                        {panel.enabled ? "已启用" : "已停用"} · 排序 {panel.sort_order}
                      </small>
                    </span>
                  </button>
                  <span className="admin-list-row__actions">
                    <button
                      className="button button--secondary"
                      type="button"
                      aria-label={`编辑分栏 ${panel.name}`}
                      onClick={() => {
                        setError(null);
                        setPanelFormMode(panel.id);
                      }}
                    >
                      编辑
                    </button>
                    <button
                      className="button button--danger"
                      type="button"
                      aria-label={`删除分栏 ${panel.name}`}
                      disabled={deletingId === panel.id}
                      onClick={() => void handlePanelDelete(panel)}
                    >
                      {deletingId === panel.id ? "删除中…" : "删除"}
                    </button>
                  </span>
                </div>
              )}
            />
          )}
        </section>

        <section className="admin-section" aria-labelledby="monitors-heading">
          <div className="admin-section__header">
            <div>
              <p className="state-card__eyebrow">当前分栏</p>
              <h2 id="monitors-heading">
                {selectedPanel ? `${selectedPanel.name} 的监控` : "监控"}
              </h2>
            </div>
            <button
              className="button button--primary"
              type="button"
              disabled={!selectedPanel}
              onClick={() => {
                setError(null);
                setNotice(null);
                setMonitorFormMode("new");
              }}
            >
              新增监控
            </button>
          </div>

          {!selectedPanel ? (
            <p className="empty-list">请选择或创建一个分栏来管理监控。</p>
          ) : null}

          {selectedPanel && monitorFormMode ? (
            <MonitorForm
              panelId={selectedPanel.id}
              monitor={editingMonitor}
              defaultSortOrder={nextSortOrder(monitors)}
              onSaved={handleMonitorSaved}
              onCancel={() => setMonitorFormMode(null)}
              onUnauthenticated={handleUnauthenticated}
            />
          ) : null}

          {selectedPanel && isLoadingMonitors ? (
            <p className="loading-copy" role="status">
              正在加载监控…
            </p>
          ) : null}

          {selectedPanel && !isLoadingMonitors ? (
            <SortableList
              items={monitors}
              getItemLabel={(monitor) => monitor.name}
              onMove={moveMonitor}
              emptyMessage="该分栏还没有配置监控。"
              renderItem={(monitor) => (
                <div className="admin-list-row">
                  <div className="admin-list-row__identity">
                    {monitor.logo_url ? (
                      <img className="admin-list-row__logo" src={monitor.logo_url} alt="" />
                    ) : (
                      <span className="admin-list-row__mark" aria-hidden="true">
                        {monitor.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span>
                      <strong>{monitor.name}</strong>
                      <small>
                        {monitor.kind === "http_get"
                          ? `HTTP GET · ${monitor.target}`
                          : `TCPing · ${monitor.target}:${monitor.port ?? ""}`}
                        {monitor.enabled ? " · 已启用" : " · 已停用"}
                      </small>
                    </span>
                  </div>
                  <span className="admin-list-row__actions">
                    <button
                      className="button button--secondary"
                      type="button"
                      aria-label={`编辑监控 ${monitor.name}`}
                      onClick={() => {
                        setError(null);
                        setMonitorFormMode(monitor.id);
                      }}
                    >
                      编辑
                    </button>
                    <button
                      className="button button--danger"
                      type="button"
                      aria-label={`删除监控 ${monitor.name}`}
                      disabled={deletingId === monitor.id}
                      onClick={() => void handleMonitorDelete(monitor)}
                    >
                      {deletingId === monitor.id ? "删除中…" : "删除"}
                    </button>
                  </span>
                </div>
              )}
            />
          ) : null}
        </section>
      </div>
    </main>
  );
}
