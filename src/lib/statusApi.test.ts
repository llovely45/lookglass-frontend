import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StatusSnapshot } from "../contracts";

vi.mock("../env", () => ({
  STATUS_URL: "https://status.example.test/public/status.json",
}));

import { isSnapshotStale, loadStatusSnapshot } from "./statusApi";

const GENERATED_AT = 1_735_689_600;
const fetchMock = vi.fn<typeof fetch>();

function validSnapshot(): StatusSnapshot {
  return {
    generatedAt: GENERATED_AT,
    expiresAt: GENERATED_AT + 86_400,
    intervalSeconds: 1_800,
    panels: [
      {
        id: "panel-1",
        name: "Main",
        logoUrl: null,
        navOnly: false,
        monitors: [
          {
            id: "monitor-1",
            name: "Homepage",
            logoUrl: null,
            linkUrl: null,
            kind: "http_get",
            target: "https://example.test/health",
            samples: [{ t: GENERATED_AT, s: "ok", v: 420, code: 200 }],
          },
        ],
      },
    ],
  };
}

function cloneSnapshot(): Record<string, any> {
  return JSON.parse(JSON.stringify(validSnapshot())) as Record<string, any>;
}

function respond(body: unknown, status = 200): void {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}

describe("loadStatusSnapshot", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T10:23:45.000Z"));
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reads the configured R2 URL with no-store and a current-minute query", async () => {
    const snapshot = validSnapshot();
    respond(snapshot);

    await expect(loadStatusSnapshot()).resolves.toEqual(snapshot);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [request, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const requestUrl = new URL(request);
    expect(requestUrl.origin).toBe("https://status.example.test");
    expect(requestUrl.pathname).toBe("/public/status.json");
    expect(requestUrl.searchParams.get("minute")).toBe(
      String(Math.floor(Date.now() / 60_000)),
    );
    expect(options).toEqual({ cache: "no-store" });
  });

  it("rejects non-2xx responses", async () => {
    respond({ error: "unavailable" }, 503);

    await expect(loadStatusSnapshot()).rejects.toThrow(/503/);
  });

  it.each([
    [
      "intervalSeconds",
      (snapshot: Record<string, any>): void => {
        snapshot.intervalSeconds = 60;
      },
    ],
    [
      "panels array",
      (snapshot: Record<string, any>): void => {
        snapshot.panels = {};
      },
    ],
    [
      "panel id",
      (snapshot: Record<string, any>): void => {
        snapshot.panels[0].id = "";
      },
    ],
    [
      "monitor id",
      (snapshot: Record<string, any>): void => {
        snapshot.panels[0].monitors[0].id = "";
      },
    ],
    [
      "sample timestamp",
      (snapshot: Record<string, any>): void => {
        snapshot.panels[0].monitors[0].samples[0].t = "bad";
      },
    ],
    [
      "sample status",
      (snapshot: Record<string, any>): void => {
        snapshot.panels[0].monitors[0].samples[0].s = "unknown";
      },
    ],
    [
      "sample value",
      (snapshot: Record<string, any>): void => {
        snapshot.panels[0].monitors[0].samples[0].v = "420";
      },
    ],
    [
      "HTTP code",
      (snapshot: Record<string, any>): void => {
        snapshot.panels[0].monitors[0].samples[0].code = "200";
      },
    ],
    [
      "navigation link",
      (snapshot: Record<string, any>): void => {
        snapshot.panels[0].monitors[0].linkUrl = "javascript:alert(1)";
      },
    ],
  ] as const)("rejects an invalid %s", async (_name, mutate) => {
    const snapshot = cloneSnapshot();
    mutate(snapshot);
    respond(snapshot);

    await expect(loadStatusSnapshot()).rejects.toThrow(/Invalid status snapshot/);
  });

  it("rejects a monitor whose samples are not an array", async () => {
    const snapshot = cloneSnapshot();
    snapshot.panels[0].monitors[0].samples = null;
    respond(snapshot);

    await expect(loadStatusSnapshot()).rejects.toThrow(/samples/);
  });

  it("rejects a panel with a non-boolean only-NAV flag", async () => {
    const snapshot = cloneSnapshot();
    snapshot.panels[0].navOnly = "true";
    respond(snapshot);

    await expect(loadStatusSnapshot()).rejects.toThrow(/Invalid status snapshot/);
  });

  it("defaults the only-NAV flag for a legacy snapshot", async () => {
    const snapshot = cloneSnapshot();
    delete snapshot.panels[0].navOnly;
    respond(snapshot);

    await expect(loadStatusSnapshot()).resolves.toMatchObject({
      panels: [{ navOnly: false }],
    });
  });
});

describe("isSnapshotStale", () => {
  it("uses strict expiry and 90-minute boundaries in Unix seconds", () => {
    const now = GENERATED_AT + 5_400;
    const snapshot = validSnapshot();
    snapshot.generatedAt = now;
    snapshot.expiresAt = now;

    expect(isSnapshotStale(snapshot, now)).toBe(false);
    expect(isSnapshotStale(snapshot, now + 1)).toBe(true);

    snapshot.generatedAt = GENERATED_AT;
    snapshot.expiresAt = now + 100;
    expect(isSnapshotStale(snapshot, now)).toBe(false);
    expect(isSnapshotStale(snapshot, GENERATED_AT + 5_401)).toBe(true);
  });

  it("uses the current Unix time when no time is supplied", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date((GENERATED_AT + 5_401) * 1_000));

    expect(
      isSnapshotStale({
        ...validSnapshot(),
        expiresAt: GENERATED_AT + 86_400,
      }),
    ).toBe(true);

    vi.useRealTimers();
  });
});
