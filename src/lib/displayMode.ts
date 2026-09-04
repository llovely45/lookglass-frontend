export type DisplayMode = "lg" | "nav";

export const DISPLAY_MODE_STORAGE_KEY = "lookglass-display-mode";

type BrowserStorage = Pick<Storage, "getItem" | "setItem">;

function getBrowserStorage(): BrowserStorage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readDisplayMode(
  storage: BrowserStorage | null = getBrowserStorage(),
): DisplayMode {
  try {
    return storage?.getItem(DISPLAY_MODE_STORAGE_KEY) === "nav" ? "nav" : "lg";
  } catch {
    return "lg";
  }
}

export function writeDisplayMode(
  mode: DisplayMode,
  storage: BrowserStorage | null = getBrowserStorage(),
): void {
  try {
    storage?.setItem(DISPLAY_MODE_STORAGE_KEY, mode);
  } catch {
    // Display mode is a convenience preference; storage failures must not
    // prevent the dashboard from switching modes in the current page.
  }
}
