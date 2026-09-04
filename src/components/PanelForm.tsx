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
  return "The panel could not be saved.";
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

    const input: PanelInput = {
      name,
      logo_url: logoUrl || null,
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
          <p className="eyebrow">{isEditing ? "Edit panel" : "New panel"}</p>
          <h3>{isEditing ? "Update panel" : "Add a panel"}</h3>
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
            required
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
          <img src={previewUrl} alt="Panel logo preview" />
        </div>
      ) : null}

      <div className="form-actions">
        <button className="button button--primary" type="submit" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save panel"}
        </button>
      </div>
    </form>
  );
}
