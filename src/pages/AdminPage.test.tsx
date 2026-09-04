import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../lib/adminApi", () => ({
  deleteMonitor: vi.fn(),
  deletePanel: vi.fn(),
  getSession: vi.fn(),
  getSessionState: vi.fn(() => null),
  listMonitors: vi.fn(),
  listPanels: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  reorderMonitors: vi.fn(),
  reorderPanels: vi.fn(),
  saveMonitor: vi.fn(),
  savePanel: vi.fn(),
  subscribeSession: vi.fn(() => () => undefined),
}));

import {
  deletePanel,
  listMonitors,
  listPanels,
  login,
  reorderMonitors,
  reorderPanels,
  saveMonitor,
  savePanel,
} from "../lib/adminApi";
import MonitorForm from "../components/MonitorForm";
import PanelForm from "../components/PanelForm";
import AdminPage from "./AdminPage";
import LoginPage from "./LoginPage";

const loginMock = vi.mocked(login);
const listPanelsMock = vi.mocked(listPanels);
const listMonitorsMock = vi.mocked(listMonitors);
const savePanelMock = vi.mocked(savePanel);
const saveMonitorMock = vi.mocked(saveMonitor);
const deletePanelMock = vi.mocked(deletePanel);
const reorderPanelsMock = vi.mocked(reorderPanels);
const reorderMonitorsMock = vi.mocked(reorderMonitors);

const panel = {
  id: "panel-1",
  name: "Main panel",
  logo_url: null,
  sort_order: 0,
  enabled: true,
  created_at: 1,
  updated_at: 1,
};

const monitor = {
  id: "monitor-1",
  panel_id: "panel-1",
  name: "Homepage",
  logo_url: null,
  link_url: null,
  kind: "http_get" as const,
  target: "https://example.test/health",
  port: null,
  sort_order: 0,
  enabled: true,
  created_at: 1,
  updated_at: 1,
};

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe("admin UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listPanelsMock.mockResolvedValue([panel]);
    listMonitorsMock.mockResolvedValue([monitor]);
    savePanelMock.mockResolvedValue(panel);
    saveMonitorMock.mockResolvedValue(monitor);
    reorderPanelsMock.mockResolvedValue({ reordered: true });
    reorderMonitorsMock.mockResolvedValue({ reordered: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits a password-type token and reports a successful login", async () => {
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    loginMock.mockResolvedValue({ authenticated: true });

    render(<LoginPage onAuthenticated={onAuthenticated} />);

    const tokenInput = screen.getByLabelText("管理 Token");
    expect(tokenInput).toHaveAttribute("type", "password");
    await user.type(tokenInput, "admin-token");
    await user.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => expect(loginMock).toHaveBeenCalledWith("admin-token"));
    expect(onAuthenticated).toHaveBeenCalledOnce();
  });

  it("shows the Worker login error when authentication fails", async () => {
    const user = userEvent.setup();
    loginMock.mockRejectedValue(new Error("invalid credentials"));

    render(<LoginPage />);
    await user.type(screen.getByLabelText("管理 Token"), "wrong-token");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "invalid credentials",
    );
  });

  it("shows an HTTP URL and hides the TCP port until tcping is selected", async () => {
    const user = userEvent.setup();

    render(
      <MonitorForm
        panelId="panel-1"
        defaultSortOrder={0}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("URL")).toBeInTheDocument();
    expect(screen.queryByLabelText("端口")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("类型"), "tcping");

    expect(screen.getByLabelText("主机/IP")).toBeInTheDocument();
    expect(screen.getByLabelText("端口")).toBeInTheDocument();
    expect(screen.queryByLabelText("URL")).not.toBeInTheDocument();
  });

  it("submits an optional navigation link with a monitor", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();

    render(
      <MonitorForm
        panelId="panel-1"
        defaultSortOrder={0}
        onSaved={onSaved}
      />,
    );

    await user.type(screen.getByLabelText("名称"), "Homepage");
    await user.type(screen.getByLabelText("URL"), "https://example.com/health");
    await user.type(
      screen.getByLabelText("跳转链接"),
      "https://www.example.com/",
    );
    await user.click(screen.getByRole("button", { name: "保存监控" }));

    await waitFor(() =>
      expect(saveMonitorMock).toHaveBeenCalledWith(
        expect.objectContaining({
          panel_id: "panel-1",
          link_url: "https://www.example.com/",
        }),
        undefined,
      ),
    );
  });

  it("renders the administration page copy in Chinese", async () => {
    render(<AdminPage />);

    expect(await screen.findByRole("heading", { name: "管理配置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增分栏" })).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Main panel 的监控" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增监控" })).toBeInTheDocument();
  });

  it("rejects non-HTTPS logo URLs before saving a panel", async () => {
    const user = userEvent.setup();

    render(
      <PanelForm
        defaultSortOrder={0}
        onSaved={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("名称"), "Main panel");
    await user.type(
      screen.getByLabelText("Logo 地址"),
      "http://assets.example.test/logo.svg",
    );
    await user.click(screen.getByRole("button", { name: "保存分栏" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Logo 地址必须使用 HTTPS",
    );
    expect(savePanelMock).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before deleting a panel", async () => {
    const user = userEvent.setup();
    const confirmMock = vi
      .spyOn(window, "confirm")
      .mockReturnValue(false);

    render(<AdminPage />);

    const deleteButton = await screen.findByRole("button", {
      name: "删除分栏 Main panel",
    });
    await user.click(deleteButton);

    expect(confirmMock).toHaveBeenCalledWith(
      expect.stringContaining("Main panel"),
    );
    expect(deletePanelMock).not.toHaveBeenCalled();
  });

  it("ignores an older monitor response after switching panels", async () => {
    const user = userEvent.setup();
    const secondPanel = {
      ...panel,
      id: "panel-2",
      name: "Backup panel",
      sort_order: 1,
    };
    const secondMonitor = {
      ...monitor,
      id: "monitor-2",
      panel_id: secondPanel.id,
      name: "Backup monitor",
    };
    const firstRequest = deferred<Array<typeof monitor>>();
    const secondRequest = deferred<Array<typeof secondMonitor>>();

    listPanelsMock.mockResolvedValueOnce([panel, secondPanel]);
    listMonitorsMock.mockImplementation((panelId) =>
      panelId === panel.id ? firstRequest.promise : secondRequest.promise,
    );

    render(<AdminPage />);

    await waitFor(() =>
      expect(listMonitorsMock).toHaveBeenCalledWith(panel.id),
    );
    await user.click(screen.getByRole("button", { name: /^Backup panel\b/ }));
    await waitFor(() =>
      expect(listMonitorsMock).toHaveBeenCalledWith(secondPanel.id),
    );

    await act(async () => {
      secondRequest.resolve([secondMonitor]);
      await secondRequest.promise;
    });
    expect(await screen.findByText("Backup monitor")).toBeInTheDocument();

    await act(async () => {
      firstRequest.resolve([monitor]);
      await firstRequest.promise;
    });

    await waitFor(() =>
      expect(screen.queryByText("Homepage")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Backup monitor")).toBeInTheDocument();
  });

  it("persists distinct sort orders when adjacent panels start tied", async () => {
    const user = userEvent.setup();
    const secondPanel = {
      ...panel,
      id: "panel-2",
      name: "Backup panel",
      sort_order: 0,
    };
    listPanelsMock.mockResolvedValueOnce([panel, secondPanel]);
    listMonitorsMock.mockResolvedValue([]);

    render(<AdminPage />);
    await screen.findByRole("button", { name: /^Backup panel\b/ });
    await user.click(
      screen.getByRole("button", { name: "上移 Backup panel" }),
    );

    await waitFor(() => expect(reorderPanelsMock).toHaveBeenCalledOnce());
    expect(reorderPanelsMock).toHaveBeenCalledWith([
      { id: secondPanel.id, sort_order: 0 },
      { id: panel.id, sort_order: 1 },
    ]);
    expect(savePanelMock).not.toHaveBeenCalled();
  });

  it("reports a failed bulk order write without issuing CRUD order writes", async () => {
    const user = userEvent.setup();
    const secondPanel = {
      ...panel,
      id: "panel-2",
      name: "Backup panel",
      sort_order: 0,
    };
    listPanelsMock.mockResolvedValueOnce([panel, secondPanel]);
    listMonitorsMock.mockResolvedValue([]);
    reorderPanelsMock.mockRejectedValueOnce(new Error("bulk order write failed"));

    render(<AdminPage />);
    await screen.findByRole("button", { name: /^Backup panel\b/ });
    await user.click(
      screen.getByRole("button", { name: "上移 Backup panel" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "bulk order write failed",
    );
    expect(reorderPanelsMock).toHaveBeenCalledOnce();
    expect(savePanelMock).not.toHaveBeenCalled();
  });

  it("rejects a stale panel-A refresh callback after panel B is selected", async () => {
    const user = userEvent.setup();
    const secondPanel = {
      ...panel,
      id: "panel-2",
      name: "Backup panel",
      sort_order: 1,
    };
    const secondMonitor = {
      ...monitor,
      id: "monitor-2",
      panel_id: secondPanel.id,
      name: "Backup monitor",
    };
    const panelARefresh = deferred<Array<typeof monitor>>();
    const panelBRequest = deferred<Array<typeof secondMonitor>>();
    let panelAListCalls = 0;

    listPanelsMock.mockResolvedValueOnce([panel, secondPanel]);
    listMonitorsMock.mockImplementation((panelId) => {
      if (panelId === panel.id) {
        panelAListCalls += 1;
        return panelAListCalls === 1
          ? Promise.resolve([monitor])
          : panelARefresh.promise;
      }
      return panelBRequest.promise;
    });
    saveMonitorMock.mockResolvedValue(monitor);

    render(<AdminPage />);
    await screen.findByText("Homepage");
    await user.click(screen.getByRole("button", { name: "编辑监控 Homepage" }));
    await user.click(screen.getByRole("button", { name: "保存监控" }));
    await waitFor(() => expect(panelAListCalls).toBe(2));

    await user.click(screen.getByRole("button", { name: /^Backup panel\b/ }));
    await waitFor(() =>
      expect(listMonitorsMock).toHaveBeenCalledWith(secondPanel.id),
    );

    await act(async () => {
      panelBRequest.resolve([secondMonitor]);
      await panelBRequest.promise;
    });
    expect(await screen.findByText("Backup monitor")).toBeInTheDocument();

    await act(async () => {
      panelARefresh.resolve([monitor]);
      await panelARefresh.promise;
    });

    expect(screen.queryByText("Homepage")).not.toBeInTheDocument();
    expect(screen.getByText("Backup monitor")).toBeInTheDocument();
  });
});
