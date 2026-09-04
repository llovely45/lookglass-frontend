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
  saveMonitor: vi.fn(),
  savePanel: vi.fn(),
  subscribeSession: vi.fn(() => () => undefined),
}));

import {
  deletePanel,
  listMonitors,
  listPanels,
  login,
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits a password-type token and reports a successful login", async () => {
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    loginMock.mockResolvedValue({ authenticated: true });

    render(<LoginPage onAuthenticated={onAuthenticated} />);

    const tokenInput = screen.getByLabelText("Token");
    expect(tokenInput).toHaveAttribute("type", "password");
    await user.type(tokenInput, "admin-token");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(loginMock).toHaveBeenCalledWith("admin-token"));
    expect(onAuthenticated).toHaveBeenCalledOnce();
  });

  it("shows the Worker login error when authentication fails", async () => {
    const user = userEvent.setup();
    loginMock.mockRejectedValue(new Error("invalid credentials"));

    render(<LoginPage />);
    await user.type(screen.getByLabelText("Token"), "wrong-token");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

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
    expect(screen.queryByLabelText("Port")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Kind"), "tcping");

    expect(screen.getByLabelText("Host/IP")).toBeInTheDocument();
    expect(screen.getByLabelText("Port")).toBeInTheDocument();
    expect(screen.queryByLabelText("URL")).not.toBeInTheDocument();
  });

  it("rejects non-HTTPS logo URLs before saving a panel", async () => {
    const user = userEvent.setup();

    render(
      <PanelForm
        defaultSortOrder={0}
        onSaved={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Name"), "Main panel");
    await user.type(
      screen.getByLabelText("Logo URL"),
      "http://assets.example.test/logo.svg",
    );
    await user.click(screen.getByRole("button", { name: "Save panel" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Logo URL must use HTTPS",
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
      name: "Delete panel Main panel",
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
    savePanelMock.mockResolvedValue(panel);

    render(<AdminPage />);
    await screen.findByRole("button", { name: /^Backup panel\b/ });
    await user.click(
      screen.getByRole("button", { name: "Move Backup panel up" }),
    );

    await waitFor(() => expect(savePanelMock).toHaveBeenCalledTimes(2));
    expect(
      savePanelMock.mock.calls.map(([input]) => input.sort_order),
    ).toEqual([0, 1]);
    expect(savePanelMock.mock.calls.map(([, id]) => id)).toEqual([
      secondPanel.id,
      panel.id,
    ]);
  });

  it("compensates the first order write when the second write fails", async () => {
    const user = userEvent.setup();
    const secondPanel = {
      ...panel,
      id: "panel-2",
      name: "Backup panel",
      sort_order: 0,
    };
    listPanelsMock.mockResolvedValueOnce([panel, secondPanel]);
    listMonitorsMock.mockResolvedValue([]);
    savePanelMock
      .mockResolvedValueOnce(panel)
      .mockRejectedValueOnce(new Error("second order write failed"))
      .mockResolvedValueOnce(panel);

    render(<AdminPage />);
    await screen.findByRole("button", { name: /^Backup panel\b/ });
    await user.click(
      screen.getByRole("button", { name: "Move Backup panel up" }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("previous order was restored");
    expect(savePanelMock).toHaveBeenCalledTimes(3);
    expect(savePanelMock.mock.calls[2][0]).toMatchObject({ sort_order: 0 });
    expect(savePanelMock.mock.calls[2][1]).toBe(secondPanel.id);
  });
});
