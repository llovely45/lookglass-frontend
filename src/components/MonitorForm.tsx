import { useEffect, useState, type FormEvent } from "react";

import {
  AdminApiError,
  saveMonitor,
  type MonitorInput,
  type MonitorRecord,
} from "../lib/adminApi";

interface MonitorFormProps {
  panelId: string;
  monitor?: MonitorRecord;
  defaultSortOrder?: number;
  onSaved: (monitor: MonitorRecord) => void | Promise<void>;
  onCancel?: () => void;
  onUnauthenticated?: () => void;
}

interface MonitorFormState {
  name: string;
  logoUrl: string;
  kind: MonitorInput["kind"];
  target: string;
  port: string;
  sortOrder: string;
  enabled: boolean;
}

function formStateFromMonitor(
  monitor: MonitorRecord | undefined,
  defaultSortOrder: number,
): MonitorFormState {
  return {
    name: monitor?.name ?? "",
    logoUrl: monitor?.logo_url ?? "",
    kind: monitor?.kind ?? "http_get",
    target: monitor?.target ?? "",
    port: monitor?.port === null || monitor?.port === undefined ? "" : String(monitor.port),
    sortOrder: String(monitor?.sort_order ?? defaultSortOrder),
    enabled: monitor?.enabled ?? true,
  };
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function isHttpTarget(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname.length > 0
    );
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "The monitor could not be saved.";
}

function isUnauthorized(error: unknown): boolean {
  if (error instanceof AdminApiError) {
    return error.status === 401;
  }
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: unknown }).status === 401
  );
}

export default function MonitorForm({
  panelId,
  monitor,
  defaultSortOrder = 0,
  onSaved,
  onCancel,
  onUnauthenticated,
}: MonitorFormProps) {
  const [form, setForm] = useState<MonitorFormState>(() =>
    formStateFromMonitor(monitor, defaultSortOrder),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setForm(formStateFromMonitor(monitor, defaultSortOrder));
    setError(null);
  }, [defaultSortOrder, monitor]);

  const isEditing = Boolean(monitor);
  const previewUrl = form.logoUrl.trim();

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const name = form.name.trim();
    if (!name) {
      setError("Name is required");
      return;
    }

    const logoUrl = form.logoUrl.trim();
    if (logoUrl && !isHttpsUrl(logoUrl)) {
      setError("Logo URL must use HTTPS");
      return;
    }

    const sortOrder = Number(form.sortOrder);
    if (!Number.isSafeInteger(sortOrder)) {
      setError("Sort order must be an integer");
      return;
    }

    let target: string;
    let port: number | null;
    if (form.kind === "http_get") {
      target = form.target.trim();
      if (!target) {
        setError("URL is required");
        return;
      }
      if (!isHttpTarget(target)) {
        setError("URL must use http or https");
        return;
      }
      port = null;
    } else {
      target = form.target.trim();
      if (!target) {
        setError("Host/IP is required");
        return;
      }
      port = Number(form.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        setError("Port must be an integer from 1 through 65535");
        return;
      }
    }

    const input: MonitorInput = {
      panel_id: panelId,
      name,
      logo_url: logoUrl || null,
      kind: form.kind,
      target,
      port,
      sort_order: sortOrder,
      enabled: form.enabled,
    };

    setIsSaving(true);
    try {
      const saved = await saveMonitor(input, monitor?.id);
      await onSaved(saved);
      if (!monitor) {
        setForm(formStateFromMonitor(undefined, defaultSortOrder));
      }
    } catch (caughtError) {
      if (isUnauthorized(caughtError)) {
        onUnauthenticated?.();
        return;
      }
      setError(errorMessage(caughtError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={(event) => void submit(event)}>
      <div className="admin-form__header">
        <div>
          <p className="eyebrow">{isEditing ? "Edit monitor" : "New monitor"}</p>
          <h3>{isEditing ? "Update monitor" : "Add a monitor"}</h3>
        </div>
        {onCancel ? (
          <button className="button button--secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="form-grid">
        <label className="form-field">
          <span>Name</span>
          <input
            autoComplete="off"
            name="name"
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
          />
        </label>

        <label className="form-field">
          <span>Logo URL</span>
          <input
            autoComplete="url"
            name="logo_url"
            placeholder="https://…"
            type="url"
            value={form.logoUrl}
            onChange={(event) =>
              setForm((current) => ({ ...current, logoUrl: event.target.value }))
            }
          />
        </label>

        <label className="form-field">
          <span>Kind</span>
          <select
            name="kind"
            value={form.kind}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                kind: event.target.value as MonitorFormState["kind"],
                target: "",
                port: "",
              }))
            }
          >
            <option value="http_get">HTTP GET</option>
            <option value="tcping">TCPing</option>
          </select>
        </label>

        {form.kind === "http_get" ? (
          <label className="form-field form-field--wide">
            <span>URL</span>
            <input
              autoComplete="url"
              name="target"
              placeholder="https://example.com/health"
              type="url"
              value={form.target}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  target: event.target.value,
                }))
              }
            />
          </label>
        ) : (
          <>
            <label className="form-field">
              <span>Host/IP</span>
              <input
                autoComplete="off"
                name="target"
                placeholder="example.com or 203.0.113.10"
                type="text"
                value={form.target}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    target: event.target.value,
                  }))
                }
              />
            </label>
            <label className="form-field form-field--compact">
              <span>Port</span>
              <input
                inputMode="numeric"
                max="65535"
                min="1"
                name="port"
                type="number"
                value={form.port}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    port: event.target.value,
                  }))
                }
              />
            </label>
          </>
        )}

        <label className="form-field form-field--compact">
          <span>Sort order</span>
          <input
            inputMode="numeric"
            min="0"
            name="sort_order"
            type="number"
            value={form.sortOrder}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                sortOrder: event.target.value,
              }))
            }
          />
        </label>

        <label className="checkbox-field">
          <input
            name="enabled"
            type="checkbox"
            checked={form.enabled}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                enabled: event.target.checked,
              }))
            }
          />
          <span>Enabled</span>
        </label>
      </div>

      {previewUrl && isHttpsUrl(previewUrl) ? (
        <div className="logo-preview">
          <span>Logo preview</span>
          <img src={previewUrl} alt="Monitor logo preview" />
        </div>
      ) : null}

      <div className="form-actions">
        <button className="button button--primary" type="submit" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save monitor"}
        </button>
      </div>
    </form>
  );
}
