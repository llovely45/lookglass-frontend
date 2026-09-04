import { useEffect, useState, type FormEvent } from "react";

import {
  savePanel,
  type PanelInput,
  type PanelRecord,
} from "../lib/adminApi";

interface PanelFormProps {
  panel?: PanelRecord;
  defaultSortOrder?: number;
  onSaved: (panel: PanelRecord) => void | Promise<void>;
  onCancel?: () => void;
  onUnauthenticated?: () => void;
}

interface PanelFormState {
  name: string;
  logoUrl: string;
  navOnly: boolean;
  sortOrder: string;
  enabled: boolean;
}

function formStateFromPanel(
  panel: PanelRecord | undefined,
  defaultSortOrder: number,
): PanelFormState {
  return {
    name: panel?.name ?? "",
    logoUrl: panel?.logo_url ?? "",
    navOnly: panel?.nav_only ?? false,
    sortOrder: String(panel?.sort_order ?? defaultSortOrder),
    enabled: panel?.enabled ?? true,
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

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "分栏保存失败。";
}

function isUnauthorized(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: unknown }).status === 401
  );
}

export default function PanelForm({
  panel,
  defaultSortOrder = 0,
  onSaved,
  onCancel,
  onUnauthenticated,
}: PanelFormProps) {
  const [form, setForm] = useState<PanelFormState>(() =>
    formStateFromPanel(panel, defaultSortOrder),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setForm(formStateFromPanel(panel, defaultSortOrder));
    setError(null);
  }, [defaultSortOrder, panel]);

  const isEditing = Boolean(panel);
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

    const sortOrder = Number(form.sortOrder);
    if (!Number.isSafeInteger(sortOrder)) {
      setError("排序必须是整数");
      return;
    }

    const input: PanelInput = {
      name,
      logo_url: logoUrl || null,
      nav_only: form.navOnly,
      sort_order: sortOrder,
      enabled: form.enabled,
    };

    setIsSaving(true);
    try {
      const saved = await savePanel(input, panel?.id);
      await onSaved(saved);
      if (!panel) {
        setForm(formStateFromPanel(undefined, defaultSortOrder));
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
          <p className="eyebrow">{isEditing ? "编辑分栏" : "新建分栏"}</p>
          <h3>{isEditing ? "更新分栏" : "新增分栏"}</h3>
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
            required
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

        <label className="checkbox-field">
          <input
            name="nav_only"
            type="checkbox"
            checked={form.navOnly}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                navOnly: event.target.checked,
              }))
            }
          />
          <span>仅 NAV 模式</span>
        </label>
      </div>

      {previewUrl && isHttpsUrl(previewUrl) ? (
        <div className="logo-preview">
          <span>Logo 预览</span>
          <img src={previewUrl} alt="分栏 Logo 预览" />
        </div>
      ) : null}

      <div className="form-actions">
        <button className="button button--primary" type="submit" disabled={isSaving}>
          {isSaving ? "保存中…" : "保存分栏"}
        </button>
      </div>
    </form>
  );
}
