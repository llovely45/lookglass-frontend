import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
});
