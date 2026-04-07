// ── Platform detection ───────────────────────────────────────────────────────

/** true on macOS / iOS, false elsewhere. */
export const isMac: boolean =
  // Modern API (Chromium 93+), with deprecated fallback for older webviews
  (navigator as unknown as { userAgentData?: { platform: string } }).userAgentData
    ?.platform === "macOS" || navigator.platform.toUpperCase().includes("MAC");

/** Platform modifier key label: "Cmd" on Mac, "Ctrl" elsewhere. */
export const mod: string = isMac ? "Cmd" : "Ctrl";
