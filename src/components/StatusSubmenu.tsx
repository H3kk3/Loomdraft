import type { Status } from "../types";
import { STATUS_VALUES } from "../types";

const LABELS: Record<Status, string> = {
  draft: "Draft",
  "in-revision": "In Revision",
  revised: "Revised",
  final: "Final",
  stuck: "Stuck",
  cut: "Cut",
};

export interface StatusSubmenuProps {
  current: Status | undefined;
  onSelect: (status: Status) => void;
}

export function StatusSubmenu({ current, onSelect }: StatusSubmenuProps) {
  return (
    <>
      <div className="context-menu-section-label" role="presentation">Status</div>
      {STATUS_VALUES.map((s) => (
        <button
          key={s}
          type="button"
          className="context-menu-item"
          role="menuitem"
          aria-label={`Set status to ${LABELS[s]}${current === s ? " (current)" : ""}`}
          onClick={() => onSelect(s)}
        >
          <span
            className="status-swatch"
            style={{ background: `var(--status-${s})` }}
            aria-hidden
          />
          <span className="status-label">{LABELS[s]}</span>
          {current === s && <span className="context-menu-check" aria-label="selected">✓</span>}
        </button>
      ))}
    </>
  );
}
