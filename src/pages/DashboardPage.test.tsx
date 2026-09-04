import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { normalizeSamples } from "../components/SampleGrid";
import type { StatusSnapshot } from "../contracts";
import { DISPLAY_MODE_STORAGE_KEY } from "../lib/displayMode";

vi.mock("../lib/statusApi", async () => {
  const actual = await vi.importActual<typeof import("../lib/statusApi")>(
    "../lib/statusApi",
  );

  return {
    ...actual,
    loadStatusSnapshot: vi.fn(),
  };
});

import { loadStatusSnapshot } from "../lib/statusApi";
import DashboardPage from "./DashboardPage";

const loadStatusSnapshotMock = vi.mocked(loadStatusSnapshot);
const HALF_HOUR_SECONDS = 1_800;

function dashboardFixture(): StatusSnapshot {
  const generatedAt =
    Math.floor(Date.now() / HALF_HOUR_SECONDS) * HALF_HOUR_SECONDS;

  return {
    generatedAt,
    expiresAt: generatedAt + 86_400,
    intervalSeconds: HALF_HOUR_SECONDS,
    panels: [
      {
        id: "panel-http",
        name: "Web endpoints",
        logoUrl: null,
        monitors: [
          {
            id: "monitor-http",
            name: "Homepage",
            logoUrl: null,
            linkUrl: "https://www.example.com/",
            kind: "http_get",
            target: "https://example.test/",
            samples: [{ t: generatedAt, s: "ok", v: 420, code: 200 }],
          },
        ],
      },
      {
        id: "panel-tcp",
        name: "TCP endpoints",
        logoUrl: null,
        monitors: [
          {
            id: "monitor-tcp",
            name: "Database port",
            logoUrl: null,
            linkUrl: null,
            kind: "tcping",
            target: "db.example.test:5432",
            samples: [{ t: generatedAt, s: "ok", v: 42 }],
          },
        ],
      },
    ],
  };
}

describe("DashboardPage", () => {
  let fetchRequests: Array<readonly unknown[]>;

  beforeEach(() => {
    window.localStorage.removeItem(DISPLAY_MODE_STORAGE_KEY);
    loadStatusSnapshotMock.mockResolvedValue(dashboardFixture());
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Unexpected Worker API request"));
    fetchRequests = fetchSpy.mock.calls;
  });

  afterEach(() => {
    window.localStorage.removeItem(DISPLAY_MODE_STORAGE_KEY);
    vi.restoreAllMocks();
  });

  it("switches to NAV mode with links only on configured sites", async () => {
    const user = userEvent.setup();

    render(<DashboardPage />);

    expect(await screen.findByRole("button", { name: "LG" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getAllByTestId("sample-cell")).toHaveLength(48);

    await user.click(screen.getByRole("button", { name: "NAV" }));

    expect(screen.getByRole("button", { name: "NAV" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByTestId("sample-cell")).not.toBeInTheDocument();
    expect(screen.queryByText("最近 24 小时")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Homepage" })).toHaveAttribute(
      "href",
      "https://www.example.com/",
    );
    expect(
      screen.queryByRole("link", { name: "Database port" }),
    ).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DISPLAY_MODE_STORAGE_KEY)).toBe("nav");
  });

  it("restores the persisted display mode on a later render", async () => {
    window.localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, "nav");

    render(<DashboardPage />);

    expect(await screen.findByRole("button", { name: "NAV" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByTestId("sample-cell")).not.toBeInTheDocument();
  });

  it("renders panel tabs and keeps tab changes on the R2-only path", async () => {
    const user = userEvent.setup();

    render(<DashboardPage />);

    expect(await screen.findByRole("tab", { name: "Web endpoints" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "TCP endpoints" })).toBeInTheDocument();
    await waitFor(() => expect(loadStatusSnapshotMock).toHaveBeenCalledTimes(1));

    expect(screen.getAllByTestId("sample-cell")).toHaveLength(48);

    await user.click(screen.getByRole("tab", { name: "TCP endpoints" }));

    expect(await screen.findByRole("heading", { name: "Database port" })).toBeInTheDocument();
    expect(screen.getAllByTestId("sample-cell")).toHaveLength(48);
    expect(loadStatusSnapshotMock).toHaveBeenCalledTimes(1);
    expect(
      fetchRequests.some(([request]) =>
        String(request).startsWith("https://worker.example.test"),
      ),
    ).toBe(false);
  });

  it("renders the public dashboard copy in Chinese", async () => {
    render(<DashboardPage />);

    expect(await screen.findByRole("heading", { name: "网络状态" })).toBeInTheDocument();
    expect(
      screen.getByText("最近 24 小时的服务状态，一眼查看整体连通性。"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("最近 24 小时"),
    ).toBeInTheDocument();
    expect(screen.queryByText("较早 → 最新")).not.toBeInTheDocument();
    expect(screen.queryByText("HTTP GET")).not.toBeInTheDocument();
    expect(screen.queryByText("TCPing")).not.toBeInTheDocument();
    expect(screen.queryByText("https://example.test/")).not.toBeInTheDocument();
    expect(screen.queryByText("HTTP GET 延迟")).not.toBeInTheDocument();
    const samples = screen.getAllByRole("button", { name: /本地时间：/ });
    const firstSample = samples[0];
    expect(firstSample).toBeInTheDocument();
    expect(firstSample).not.toHaveAttribute("title");
    expect(samples[samples.length - 1]).toHaveAttribute("title", "420ms");
  });

  it("keeps the latest timestamp when samples share a bucket", () => {
    const bucketStart = 1_735_689_600;
    const normalized = normalizeSamples(
      [
        { t: bucketStart + 1_500, s: "ok", v: 321, code: 200 },
        { t: bucketStart + 300, s: "ok", v: 111, code: 500 },
      ],
      bucketStart,
    );

    expect(normalized).toHaveLength(48);
    expect(normalized[47]).toEqual({
      t: bucketStart,
      s: "ok",
      v: 321,
      code: 200,
    });
  });

  it("uses Unix seconds when the sample grid has no explicit anchor", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date((1_735_689_600 + 900) * 1_000));

    try {
      const normalized = normalizeSamples([]);
      expect(normalized[47]?.t).toBe(1_735_689_600);
    } finally {
      vi.useRealTimers();
    }
  });

  it("moves focus to the tab selected with Arrow, Home, and End", async () => {
    const user = userEvent.setup();

    render(<DashboardPage />);

    const firstTab = await screen.findByRole("tab", { name: "Web endpoints" });
    const secondTab = screen.getByRole("tab", { name: "TCP endpoints" });

    firstTab.focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(secondTab).toHaveAttribute("aria-selected", "true"));
    expect(document.activeElement).toBe(secondTab);

    await user.click(secondTab);
    await user.keyboard("{Home}");
    await waitFor(() => expect(firstTab).toHaveAttribute("aria-selected", "true"));
    expect(document.activeElement).toBe(firstTab);

    await user.click(firstTab);
    await user.keyboard("{End}");
    await waitFor(() => expect(secondTab).toHaveAttribute("aria-selected", "true"));
    expect(document.activeElement).toBe(secondTab);
  });
});
