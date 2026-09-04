import { describe, expect, it } from "vitest";

import {
  COLOR_DARK_GREEN,
  COLOR_GREEN,
  COLOR_LIGHT_GREEN,
  COLOR_NEUTRAL_GRAY,
  COLOR_ORANGE,
  COLOR_RED,
  COLOR_YELLOW,
  getSampleColor,
} from "./status";

describe("sample color mapping", () => {
  it("uses the exact TCPing palette thresholds", () => {
    expect(getSampleColor("tcping", { t: 1, s: "timeout", v: null })).toBe("#e61511");
    expect(getSampleColor("tcping", { t: 1, s: "ok", v: 50 })).toBe("#24aa1d");
    expect(getSampleColor("tcping", { t: 1, s: "ok", v: 51 })).toBe("#41dd3f");
    expect(getSampleColor("tcping", { t: 1, s: "ok", v: 201 })).toBe("#f7ec44");
    expect(getSampleColor("tcping", { t: 1, s: "ok", v: 250.1 })).toBe("#f79833");
  });

  it("uses the exact HTTP palette thresholds", () => {
    expect(getSampleColor("http_get", { t: 1, s: "ok", v: 500 })).toBe("#24aa1d");
    expect(getSampleColor("http_get", { t: 1, s: "ok", v: 501 })).toBe("#41dd3f");
    expect(getSampleColor("http_get", { t: 1, s: "ok", v: 3001 })).toBe("#f79833");
    expect(getSampleColor("http_get", { t: 1, s: "ok", v: 10001 })).toBe("#e61511");
  });

  it("keeps the named palette constants in sync with the exact colors", () => {
    expect(COLOR_RED).toBe("#e61511");
    expect(COLOR_ORANGE).toBe("#f79833");
    expect(COLOR_YELLOW).toBe("#f7ec44");
    expect(COLOR_LIGHT_GREEN).toBe("#bdf663");
    expect(COLOR_GREEN).toBe("#41dd3f");
    expect(COLOR_DARK_GREEN).toBe("#24aa1d");
  });

  it("uses red for HTTP failures and neutral gray only for missing samples", () => {
    expect(getSampleColor("http_get", { t: 1, s: "http_error", v: null })).toBe(
      "#e61511",
    );
    expect(getSampleColor("http_get", { t: 1, s: "timeout", v: null })).toBe(
      "#e61511",
    );
    expect(getSampleColor("http_get", { t: 1, s: "error", v: null })).toBe(
      "#e61511",
    );
    expect(COLOR_NEUTRAL_GRAY).toBe("#d1d5db");
    expect(getSampleColor("http_get", { t: 1, s: "missing", v: null })).toBe(
      "#d1d5db",
    );
    expect(getSampleColor("tcping", { t: 1, s: "missing", v: null })).toBe(
      COLOR_NEUTRAL_GRAY,
    );
    expect(getSampleColor("http_get", { t: 1, s: "ok", v: null })).toBe(
      "#e61511",
    );
  });
});
