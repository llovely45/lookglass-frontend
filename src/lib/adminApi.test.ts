import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../env", () => ({
  API_BASE_URL: "https://worker.example.test",
}));

import {
  AdminApiError,
  deleteMonitor,
  deletePanel,
  getSession,
  getSessionState,
  listMonitors,
  listPanels,
  login,
  logout,
  reorderMonitors,
  reorderPanels,
  saveMonitor,
  savePanel,
} from "./adminApi";

const SUPPLIED_TOKEN = "token-that-must-stay-in-memory-only";
const fetchMock = vi.fn<typeof fetch>();

const panelInput = {
  name: "Main panel",
  logo_url: "https://assets.example.test/panel.svg",
  nav_only: false,
  sort_order: 2,
  enabled: true,
};

const monitorInput = {
  panel_id: "panel-1",
  name: "Homepage",
  logo_url: null,
  kind: "http_get" as const,
  target: "https://example.test/health",
  port: null,
  link_url: "https://www.example.com/",
  sort_order: 3,
  enabled: false,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function expectRequest(
  callIndex: number,
  path: string,
  method = "GET",
): RequestInit & { url: string } {
  const [url, options] = fetchMock.mock.calls[callIndex] as [
    string,
    RequestInit,
  ];
  expect(new URL(url).origin).toBe("https://worker.example.test");
  expect(new URL(url).pathname + new URL(url).search).toBe(path);
  expect(options.credentials).toBe("include");
  expect(options.method ?? "GET").toBe(method);
  return { ...options, url };
}

async function authenticate(): Promise<void> {
  fetchMock.mockResolvedValueOnce(jsonResponse({ authenticated: true }));
  await login(SUPPLIED_TOKEN);
  fetchMock.mockClear();
}

describe("admin API client", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(async () => {
    if (getSessionState()) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ authenticated: false }),
      );
      await logout();
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("logs in with the Worker URL, JSON token body, and cookie credentials without storing the token", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ authenticated: true }));
    const localStorageSetItem = vi.spyOn(window.localStorage, "setItem");
    const sessionStorageSetItem = vi.spyOn(window.sessionStorage, "setItem");

    await expect(login(SUPPLIED_TOKEN)).resolves.toEqual({
      authenticated: true,
    });

    const options = expectRequest(0, "/api/auth/login", "POST");
    expect(options.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    expect(options.body).toBe(JSON.stringify({ token: SUPPLIED_TOKEN }));
    expect(localStorageSetItem).not.toHaveBeenCalled();
    expect(sessionStorageSetItem).not.toHaveBeenCalled();
  });

  it("loads the session and lists panels with credentials included", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ authenticated: true, expiresAt: 1_735_776_000 }),
    );
    await expect(getSession()).resolves.toEqual({
      authenticated: true,
      expiresAt: 1_735_776_000,
    });
    expectRequest(0, "/api/auth/me");

    const panels = [
      {
        id: "panel-1",
        ...panelInput,
        created_at: 1,
        updated_at: 2,
      },
    ];
    fetchMock.mockResolvedValueOnce(jsonResponse(panels));
    await expect(listPanels()).resolves.toEqual(panels);
    expectRequest(1, "/api/admin/panels");
  });

  it("sends exact panel and monitor fields for JSON writes", async () => {
    await authenticate();

    const panel = {
      id: "panel-new",
      ...panelInput,
      created_at: 1,
      updated_at: 1,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(panel, 201));
    await expect(savePanel(panelInput)).resolves.toEqual(panel);
    const panelOptions = expectRequest(0, "/api/admin/panels", "POST");
    expect(panelOptions.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    expect(panelOptions.body).toBe(JSON.stringify(panelInput));

    const monitor = {
      id: "monitor-new",
      ...monitorInput,
      created_at: 1,
      updated_at: 1,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(monitor, 201));
    await expect(saveMonitor(monitorInput)).resolves.toEqual(monitor);
    const monitorOptions = expectRequest(1, "/api/admin/monitors", "POST");
    expect(monitorOptions.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    expect(monitorOptions.body).toBe(JSON.stringify(monitorInput));

    fetchMock.mockResolvedValueOnce(jsonResponse({ reordered: true }));
    await expect(
      reorderPanels([
        { id: "panel-2", sort_order: 0 },
        { id: "panel-1", sort_order: 1 },
      ]),
    ).resolves.toEqual({ reordered: true });
    const panelOrderOptions = expectRequest(2, "/api/admin/panels/order", "PATCH");
    expect(panelOrderOptions.body).toBe(
      JSON.stringify({
        items: [
          { id: "panel-2", sort_order: 0 },
          { id: "panel-1", sort_order: 1 },
        ],
      }),
    );

    fetchMock.mockResolvedValueOnce(jsonResponse({ reordered: true }));
    await expect(
      reorderMonitors("panel-1", [
        { id: "monitor-2", sort_order: 0 },
        { id: "monitor-1", sort_order: 1 },
      ]),
    ).resolves.toEqual({ reordered: true });
    const monitorOrderOptions = expectRequest(3, "/api/admin/monitors/order", "PATCH");
    expect(monitorOrderOptions.body).toBe(
      JSON.stringify({
        panel_id: "panel-1",
        items: [
          { id: "monitor-2", sort_order: 0 },
          { id: "monitor-1", sort_order: 1 },
        ],
      }),
    );
  });

  it("uses panel-scoped monitor listing and PATCH/DELETE resource URLs", async () => {
    await authenticate();

    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    await expect(listMonitors("panel-1")).resolves.toEqual([]);
    expectRequest(0, "/api/admin/monitors?panel_id=panel-1");

    const savedPanel = {
      id: "panel-1",
      ...panelInput,
      created_at: 1,
      updated_at: 2,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(savedPanel));
    await expect(savePanel({ ...panelInput, sort_order: 4 }, "panel-1")).resolves.toEqual(
      savedPanel,
    );
    const patchOptions = expectRequest(1, "/api/admin/panels/panel-1", "PATCH");
    expect(patchOptions.body).toBe(
      JSON.stringify({ ...panelInput, sort_order: 4 }),
    );

    fetchMock.mockResolvedValueOnce(jsonResponse({ deleted: true }));
    await expect(deletePanel("panel-1")).resolves.toEqual({ deleted: true });
    expectRequest(2, "/api/admin/panels/panel-1", "DELETE");

    fetchMock.mockResolvedValueOnce(jsonResponse({ deleted: true }));
    await expect(deleteMonitor("monitor-1")).resolves.toEqual({ deleted: true });
    expectRequest(3, "/api/admin/monitors/monitor-1", "DELETE");
  });

  it("clears the in-memory session after a 401 and exposes JSON error code and message", async () => {
    await authenticate();
    expect(getSessionState()).toEqual({ authenticated: true });

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { code: "unauthorized", message: "authentication required" },
        401,
      ),
    );

    await expect(listPanels()).rejects.toMatchObject({
      code: "unauthorized",
      message: "authentication required",
      status: 401,
    } satisfies Partial<AdminApiError>);
    expect(getSessionState()).toBeNull();
  });

  it("returns a structured error for a non-authenticated JSON failure", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { code: "invalid_input", message: "name is required" },
        422,
      ),
    );

    await expect(listPanels()).rejects.toMatchObject({
      code: "invalid_input",
      message: "name is required",
      status: 422,
    });
  });
});
