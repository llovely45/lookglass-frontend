import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
});
