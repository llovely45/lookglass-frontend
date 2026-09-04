import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DISPLAY_MODE_STORAGE_KEY,
  readDisplayMode,
  writeDisplayMode,
} from "./displayMode";

describe("display mode persistence", () => {
  beforeEach(() => {
    window.localStorage.removeItem(DISPLAY_MODE_STORAGE_KEY);
  });

  afterEach(() => {
    window.localStorage.removeItem(DISPLAY_MODE_STORAGE_KEY);
  });

  it("defaults to LG and persists NAV for the next page load", () => {
    expect(readDisplayMode()).toBe("lg");

    writeDisplayMode("nav");

    expect(window.localStorage.getItem(DISPLAY_MODE_STORAGE_KEY)).toBe("nav");
    expect(readDisplayMode()).toBe("nav");
  });

  it("ignores unknown stored values", () => {
    window.localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, "unknown");

    expect(readDisplayMode()).toBe("lg");
  });

  it("continues without throwing when browser storage is unavailable", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("storage unavailable");
      }),
      setItem: vi.fn(() => {
        throw new Error("storage unavailable");
      }),
    } as unknown as Storage;

    expect(readDisplayMode(storage)).toBe("lg");
    expect(() => writeDisplayMode("nav", storage)).not.toThrow();
  });
});
