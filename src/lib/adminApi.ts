import { API_BASE_URL } from "../env";
import type { MonitorKind } from "../contracts";

export interface AdminSession {
  authenticated: true;
  expiresAt?: number;
}

export interface PanelRecord {
  id: string;
  name: string;
  logo_url: string | null;
  sort_order: number;
  enabled: boolean;
  created_at: number;
  updated_at: number;
}

export interface PanelInput {
  name: string;
  logo_url: string | null;
  sort_order: number;
  enabled: boolean;
}

export interface MonitorRecord {
  id: string;
  panel_id: string;
  name: string;
  logo_url: string | null;
  link_url: string | null;
  kind: MonitorKind;
  target: string;
  port: number | null;
  sort_order: number;
  enabled: boolean;
  created_at: number;
  updated_at: number;
}

export interface MonitorInput {
  panel_id: string;
  name: string;
  logo_url: string | null;
  link_url: string | null;
  kind: MonitorKind;
  target: string;
  port: number | null;
  sort_order: number;
  enabled: boolean;
}

export interface DeleteResponse {
  deleted: true;
}

export interface OrderItem {
  id: string;
  sort_order: number;
}

export interface ReorderResponse {
  reordered: true;
}

type JsonRecord = Record<string, unknown>;

export class AdminApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
  }
}

let sessionState: AdminSession | null = null;
const sessionListeners = new Set<(session: AdminSession | null) => void>();

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function setSessionState(nextSession: AdminSession | null): void {
  sessionState = nextSession;
  for (const listener of sessionListeners) {
    listener(sessionState);
  }
}

export function getSessionState(): AdminSession | null {
  return sessionState;
}

export function subscribeSession(
  listener: (session: AdminSession | null) => void,
): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

function requestUrl(path: string): string {
  if (typeof API_BASE_URL !== "string" || API_BASE_URL.trim().length === 0) {
    throw new AdminApiError(
      0,
      "configuration_error",
      "VITE_API_BASE_URL is not configured",
    );
  }

  try {
    const base = API_BASE_URL.endsWith("/") ? API_BASE_URL : `${API_BASE_URL}/`;
    return new URL(path.replace(/^\/+/u, ""), base).toString();
  } catch {
    throw new AdminApiError(
      0,
      "configuration_error",
      "VITE_API_BASE_URL must be an absolute URL",
    );
  }
}

function isSuccessful(response: Response): boolean {
  return response.status >= 200 && response.status < 300;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function errorDetails(payload: unknown, status: number): {
  code: string;
  message: string;
} {
  if (isRecord(payload)) {
    const code = typeof payload.code === "string" ? payload.code : undefined;
    const message =
      typeof payload.message === "string" ? payload.message : undefined;
    if (code && message) {
      return { code, message };
    }
    if (message) {
      return { code: code ?? "request_failed", message };
    }
  }

  return {
    code: "request_failed",
    message: `Worker request failed with HTTP ${status}`,
  };
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  let body: string | undefined;

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    const requestInit: RequestInit = {
      method: options.method ?? "GET",
      headers,
      credentials: "include",
    };
    if (body !== undefined) {
      requestInit.body = body;
    }
    response = await fetch(requestUrl(path), requestInit);
  } catch (caughtError) {
    if (caughtError instanceof Error && caughtError.message.trim()) {
      throw caughtError;
    }
    throw new Error("Unable to reach the Worker API");
  }

  const payload = await readJson(response);
  if (!isSuccessful(response)) {
    if (response.status === 401) {
      setSessionState(null);
    }
    const details = errorDetails(payload, response.status);
    throw new AdminApiError(response.status, details.code, details.message);
  }

  return payload as T;
}

function asSession(payload: unknown): AdminSession {
  if (!isRecord(payload) || payload.authenticated !== true) {
    throw new AdminApiError(
      502,
      "invalid_response",
      "Worker returned an invalid authentication response",
    );
  }

  const expiresAt = payload.expiresAt;
  if (
    expiresAt !== undefined &&
    (typeof expiresAt !== "number" || !Number.isFinite(expiresAt))
  ) {
    throw new AdminApiError(
      502,
      "invalid_response",
      "Worker returned an invalid session expiration",
    );
  }

  return {
    authenticated: true,
    ...(expiresAt === undefined ? {} : { expiresAt }),
  };
}

export async function login(token: string): Promise<AdminSession> {
  const session = asSession(
    await request<unknown>("/api/auth/login", {
      method: "POST",
      body: { token },
    }),
  );
  setSessionState(session);
  return session;
}

export async function logout(): Promise<void> {
  try {
    await request<unknown>("/api/auth/logout", { method: "POST" });
  } finally {
    setSessionState(null);
  }
}

export async function getSession(): Promise<AdminSession> {
  const session = asSession(await request<unknown>("/api/auth/me"));
  setSessionState(session);
  return session;
}

export function listPanels(): Promise<PanelRecord[]> {
  return request<PanelRecord[]>("/api/admin/panels");
}

export function reorderPanels(
  items: readonly OrderItem[],
): Promise<ReorderResponse> {
  return request<ReorderResponse>("/api/admin/panels/order", {
    method: "PATCH",
    body: { items },
  });
}

export function savePanel(
  input: PanelInput,
  id?: string,
): Promise<PanelRecord> {
  const path = id
    ? `/api/admin/panels/${encodeURIComponent(id)}`
    : "/api/admin/panels";
  return request<PanelRecord>(path, {
    method: id ? "PATCH" : "POST",
    body: input,
  });
}

export function deletePanel(id: string): Promise<DeleteResponse> {
  return request<DeleteResponse>(
    `/api/admin/panels/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export function listMonitors(panelId?: string): Promise<MonitorRecord[]> {
  const path = panelId
    ? `/api/admin/monitors?panel_id=${encodeURIComponent(panelId)}`
    : "/api/admin/monitors";
  return request<MonitorRecord[]>(path);
}

export function reorderMonitors(
  panelId: string,
  items: readonly OrderItem[],
): Promise<ReorderResponse> {
  return request<ReorderResponse>("/api/admin/monitors/order", {
    method: "PATCH",
    body: { panel_id: panelId, items },
  });
}

export function saveMonitor(
  input: MonitorInput,
  id?: string,
): Promise<MonitorRecord> {
  const path = id
    ? `/api/admin/monitors/${encodeURIComponent(id)}`
    : "/api/admin/monitors";
  return request<MonitorRecord>(path, {
    method: id ? "PATCH" : "POST",
    body: input,
  });
}

export function deleteMonitor(id: string): Promise<DeleteResponse> {
  return request<DeleteResponse>(
    `/api/admin/monitors/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}
