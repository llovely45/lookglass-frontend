import { useCallback, useEffect, useRef, useState } from "react";

import {
  deleteMonitor,
  deletePanel,
  listMonitors,
  listPanels,
  saveMonitor,
  savePanel,
  type MonitorInput,
  type MonitorRecord,
  type PanelInput,
  type PanelRecord,
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

function panelInputFromRecord(
  panel: PanelRecord,
  sortOrder = panel.sort_order,
): PanelInput {
  return {
    name: panel.name,
    logo_url: panel.logo_url,
    sort_order: sortOrder,
    enabled: panel.enabled,
  };
}

function monitorInputFromRecord(
  monitor: MonitorRecord,
  sortOrder = monitor.sort_order,
): MonitorInput {
  return {
    panel_id: monitor.panel_id,
    name: monitor.name,
    logo_url: monitor.logo_url,
    kind: monitor.kind,
    target: monitor.target,
    port: monitor.port,
    sort_order: sortOrder,
    enabled: monitor.enabled,
  };
}

function nextSortOrder<T extends { sort_order: number }>(items: readonly T[]): number {
  return items.reduce(
    (highest, item) => Math.max(highest, item.sort_order),
    -1,
  ) + 1;
}

interface OrderedRecord {
  id: string;
  sort_order: number;
}

interface AppliedOrderUpdate<T extends OrderedRecord> {
  item: T;
  originalSortOrder: number;
}

class OrderPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderPersistenceError";
  }
}

async function persistOrderChange<
  T extends OrderedRecord,
  Input,
>(
  items: readonly T[],
  fromIndex: number,
  toIndex: number,
  save: (input: Input, id?: string) => Promise<unknown>,
  inputFromRecord: (item: T, sortOrder: number) => Input,
): Promise<void> {
  const moving = items[fromIndex];
  const target = items[toIndex];
  if (!moving || !target || fromIndex === toIndex) return;

  const reordered = [...items];
  reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moving);
  const forcedIds = new Set([moving.id, target.id]);
  const applied: AppliedOrderUpdate<T>[] = [];

  try {
    for (const [sortOrder, item] of reordered.entries()) {
      if (item.sort_order === sortOrder && !forcedIds.has(item.id)) {
        continue;
      }

      await save(inputFromRecord(item, sortOrder), item.id);
      applied.push({ item, originalSortOrder: item.sort_order });
    }
  } catch (writeError) {
    let authenticationError: unknown =
      isUnauthorized(writeError) ? writeError : undefined;
    let compensationFailed = false;

    for (const update of applied.reverse()) {
      try {
        await save(
          inputFromRecord(update.item, update.originalSortOrder),
          update.item.id,
        );
      } catch (compensationError) {
        compensationFailed = true;
        if (!authenticationError && isUnauthorized(compensationError)) {
          authenticationError = compensationError;
        }
      }
    }

    if (authenticationError) {
      throw authenticationError;
    }

    throw new OrderPersistenceError(
      compensationFailed
        ? "Order could not be saved, and the previous order could not be fully restored."
        : "Order could not be saved; the previous order was restored.",
    );
  }
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
      handleError(caughtError, "The panels could not be loaded.");
      return false;
    } finally {
      setIsLoadingPanels(false);
    }
  }, [handleError]);

  const loadMonitors = useCallback(
    async (panelId: string): Promise<boolean> => {
      const requestId = monitorRequestIdRef.current + 1;
      monitorRequestIdRef.current = requestId;
      setIsLoadingMonitors(true);
      try {
        const nextMonitors = await listMonitors(panelId);
        if (requestId !== monitorRequestIdRef.current) {
          return false;
        }
        setMonitors(nextMonitors);
        return true;
      } catch (caughtError) {
        if (requestId !== monitorRequestIdRef.current) {
          return false;
        }
        handleError(caughtError, "The monitors could not be loaded.");
        return false;
      } finally {
        if (requestId === monitorRequestIdRef.current) {
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
    setNotice("Panel saved. Configuration changes are used on the next minute boundary.");
    await loadPanels();
  }

  async function handleMonitorSaved(): Promise<void> {
    const panelId = selectedPanelId;
    setMonitorFormMode(null);
    setNotice("Monitor saved. Configuration changes are used on the next minute boundary.");
    if (panelId) {
      await loadMonitors(panelId);
    }
  }

  async function movePanel(fromIndex: number, toIndex: number): Promise<void> {
    setError(null);
    setNotice(null);
    try {
      await persistOrderChange(
        panels,
        fromIndex,
        toIndex,
        savePanel,
        panelInputFromRecord,
      );
      setNotice("Panel order saved. Configuration changes are used on the next minute boundary.");
      await loadPanels();
    } catch (caughtError) {
      handleError(caughtError, "The panel order could not be saved.");
    }
  }

  async function moveMonitor(fromIndex: number, toIndex: number): Promise<void> {
    setError(null);
    setNotice(null);
    try {
      await persistOrderChange(
        monitors,
        fromIndex,
        toIndex,
        saveMonitor,
        monitorInputFromRecord,
      );
      setNotice("Monitor order saved. Configuration changes are used on the next minute boundary.");
      if (selectedPanelId) {
        await loadMonitors(selectedPanelId);
      }
    } catch (caughtError) {
      handleError(caughtError, "The monitor order could not be saved.");
    }
  }

  async function handlePanelDelete(panel: PanelRecord): Promise<void> {
    const confirmed = window.confirm(
      `Delete panel ${panel.name}? This also deletes its monitors and results.`,
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
      setNotice("Panel deleted. Configuration changes are used on the next minute boundary.");
      await loadPanels();
    } catch (caughtError) {
      handleError(caughtError, "The panel could not be deleted.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleMonitorDelete(monitor: MonitorRecord): Promise<void> {
    const confirmed = window.confirm(
      `Delete monitor ${monitor.name}? This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeletingId(monitor.id);
    setError(null);
    try {
      await deleteMonitor(monitor.id);
      setMonitorFormMode(null);
      setNotice("Monitor deleted. Configuration changes are used on the next minute boundary.");
      if (selectedPanelId) {
        await loadMonitors(selectedPanelId);
      }
    } catch (caughtError) {
      handleError(caughtError, "The monitor could not be deleted.");
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
            <h1>Admin configuration</h1>
            <p className="dashboard-header__description">
              Manage the panels and public monitoring targets used by the next scheduled check.
            </p>
          </div>
          <a className="text-link" href="/">
            Public status
          </a>
        </header>

        <div className="status-banner admin-boundary-note" role="status">
          Configuration changes are used on the next minute boundary; this page does not claim an
          immediate Cron run.
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
              <p className="state-card__eyebrow">Configuration</p>
              <h2 id="panels-heading">Panels</h2>
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
              Add panel
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
              Loading panels…
            </p>
          ) : (
            <SortableList
              items={panels}
              getItemLabel={(panel) => panel.name}
              onMove={movePanel}
              emptyMessage="No panels configured yet."
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
                        {panel.enabled ? "Enabled" : "Disabled"} · sort {panel.sort_order}
                      </small>
                    </span>
                  </button>
                  <span className="admin-list-row__actions">
                    <button
                      className="button button--secondary"
                      type="button"
                      aria-label={`Edit panel ${panel.name}`}
                      onClick={() => {
                        setError(null);
                        setPanelFormMode(panel.id);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="button button--danger"
                      type="button"
                      aria-label={`Delete panel ${panel.name}`}
                      disabled={deletingId === panel.id}
                      onClick={() => void handlePanelDelete(panel)}
                    >
                      {deletingId === panel.id ? "Deleting…" : "Delete"}
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
              <p className="state-card__eyebrow">Selected panel</p>
              <h2 id="monitors-heading">
                {selectedPanel ? `${selectedPanel.name} monitors` : "Monitors"}
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
              Add monitor
            </button>
          </div>

          {!selectedPanel ? (
            <p className="empty-list">Select or create a panel to manage its monitors.</p>
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
              Loading monitors…
            </p>
          ) : null}

          {selectedPanel && !isLoadingMonitors ? (
            <SortableList
              items={monitors}
              getItemLabel={(monitor) => monitor.name}
              onMove={moveMonitor}
              emptyMessage="No monitors configured for this panel yet."
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
                        {monitor.enabled ? " · Enabled" : " · Disabled"}
                      </small>
                    </span>
                  </div>
                  <span className="admin-list-row__actions">
                    <button
                      className="button button--secondary"
                      type="button"
                      aria-label={`Edit monitor ${monitor.name}`}
                      onClick={() => {
                        setError(null);
                        setMonitorFormMode(monitor.id);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="button button--danger"
                      type="button"
                      aria-label={`Delete monitor ${monitor.name}`}
                      disabled={deletingId === monitor.id}
                      onClick={() => void handleMonitorDelete(monitor)}
                    >
                      {deletingId === monitor.id ? "Deleting…" : "Delete"}
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
