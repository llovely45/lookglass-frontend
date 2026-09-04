import { useEffect, useState, type FormEvent } from "react";

import {
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
  linkUrl: string;
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
    linkUrl: monitor?.link_url ?? "",
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
  return "监控保存失败。";
}

function isUnauthorized(error: unknown): boolean {
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
      setError("必须填写名称");
      return;
    }

    const logoUrl = form.logoUrl.trim();
    if (logoUrl && !isHttpsUrl(logoUrl)) {
      setError("Logo 地址必须使用 HTTPS");
      return;
    }

    const linkUrl = form.linkUrl.trim();
    if (linkUrl && !isHttpTarget(linkUrl)) {
      setError("跳转链接必须使用 http 或 https");
      return;
    }

    const sortOrder = Number(form.sortOrder);
    if (!Number.isSafeInteger(sortOrder)) {
      setError("排序必须是整数");
      return;
    }

    let target: string;
    let port: number | null;
    if (form.kind === "http_get") {
      target = form.target.trim();
      if (!target) {
        setError("必须填写 URL");
        return;
      }
      if (!isHttpTarget(target)) {
        setError("URL 必须使用 http 或 https");
        return;
      }
      port = null;
    } else {
      target = form.target.trim();
      if (!target) {
        setError("必须填写主机或 IP");
        return;
      }
      port = Number(form.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        setError("端口必须是 1 到 65535 之间的整数");
        return;
      }
    }

    const input: MonitorInput = {
      panel_id: panelId,
      name,
      logo_url: logoUrl || null,
      link_url: linkUrl || null,
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
          <p className="eyebrow">{isEditing ? "编辑监控" : "新建监控"}</p>
          <h3>{isEditing ? "更新监控" : "新增监控"}</h3>
        </div>
        {onCancel ? (
          <button className="button button--secondary" type="button" onClick={onCancel}>
            取消
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
          <span>名称</span>
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
          <span>Logo 地址</span>
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

        <label className="form-field form-field--wide">
          <span>跳转链接</span>
          <input
            autoComplete="url"
            name="link_url"
            placeholder="https://example.com/"
            type="url"
            value={form.linkUrl}
            onChange={(event) =>
              setForm((current) => ({ ...current, linkUrl: event.target.value }))
            }
          />
        </label>

        <label className="form-field">
          <span>类型</span>
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
              <span>主机/IP</span>
              <input
                autoComplete="off"
                name="target"
                placeholder="example.com 或 203.0.113.10"
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
              <span>端口</span>
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
          <span>排序</span>
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
          <span>已启用</span>
        </label>
      </div>

      {previewUrl && isHttpsUrl(previewUrl) ? (
        <div className="logo-preview">
          <span>Logo 预览</span>
          <img src={previewUrl} alt="监控 Logo 预览" />
        </div>
      ) : null}

      <div className="form-actions">
        <button className="button button--primary" type="submit" disabled={isSaving}>
          {isSaving ? "保存中…" : "保存监控"}
        </button>
      </div>
    </form>
  );
}
