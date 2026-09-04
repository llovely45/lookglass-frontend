import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { normalizeSamples } from "../components/SampleGrid";
import type { StatusSnapshot } from "../contracts";

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
    loadStatusSnapshotMock.mockResolvedValue(dashboardFixture());
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Unexpected Worker API request"));
    fetchRequests = fetchSpy.mock.calls;
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
