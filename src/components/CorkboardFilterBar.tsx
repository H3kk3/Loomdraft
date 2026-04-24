// src/components/CorkboardFilterBar.tsx

import { useMemo } from "react";
import type { Status, DocTypeDefinition } from "../types";
import { STATUS_VALUES } from "../types";

export interface CorkboardFilter {
  statuses: Set<Status>;
  tags: Set<string>;
  docTypes: Set<string>;
}

export function emptyFilter(): CorkboardFilter {
  return { statuses: new Set(), tags: new Set(), docTypes: new Set() };
}

export interface CorkboardFilterBarProps {
  filter: CorkboardFilter;
  onChange: (next: CorkboardFilter) => void;
  docTypes: DocTypeDefinition[];
  availableTags: string[];
  tagColors: Record<string, string>;
}

export function CorkboardFilterBar({
  filter,
  onChange,
  docTypes,
  availableTags,
  tagColors,
}: CorkboardFilterBarProps) {
  const manuscriptTypes = useMemo(
    () => docTypes.filter((dt) => dt.category === "manuscript" && dt.id !== "part" && dt.id !== "chapter"),
    [docTypes],
  );

  const toggle = <K,>(set: Set<K>, value: K): Set<K> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const hasActive = filter.statuses.size + filter.tags.size + filter.docTypes.size > 0;

  return (
    <div className="corkboard-filter-bar">
      <div className="corkboard-filter-group">
        <span className="corkboard-filter-group-label">Status:</span>
        {STATUS_VALUES.map((s) => (
          <button
            key={s}
            type="button"
            className="corkboard-filter-chip"
            aria-pressed={filter.statuses.has(s)}
            onClick={() => onChange({ ...filter, statuses: toggle(filter.statuses, s) })}
          >
            <span
              className="corkboard-filter-chip-swatch"
              style={{ background: `var(--status-${s})` }}
              aria-hidden
            />
            {s}
          </button>
        ))}
      </div>

      {manuscriptTypes.length > 1 && (
        <div className="corkboard-filter-group">
          <span className="corkboard-filter-group-label">Type:</span>
          {manuscriptTypes.map((dt) => (
            <button
              key={dt.id}
              type="button"
              className="corkboard-filter-chip"
              aria-pressed={filter.docTypes.has(dt.id)}
              onClick={() => onChange({ ...filter, docTypes: toggle(filter.docTypes, dt.id) })}
            >
              {dt.label}
            </button>
          ))}
        </div>
      )}

      {availableTags.length > 0 && (
        <div className="corkboard-filter-group">
          <span className="corkboard-filter-group-label">Tag:</span>
          {availableTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className="corkboard-filter-chip"
              aria-pressed={filter.tags.has(tag)}
              onClick={() => onChange({ ...filter, tags: toggle(filter.tags, tag) })}
            >
              <span
                className="corkboard-filter-chip-swatch"
                style={{ background: tagColors[tag] ?? "var(--bg-3)" }}
                aria-hidden
              />
              {tag}
            </button>
          ))}
        </div>
      )}

      {hasActive && (
        <button
          type="button"
          className="corkboard-filter-clear"
          onClick={() => onChange(emptyFilter())}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

/**
 * Apply the chip-based filter to a single card. Semantics: OR within each axis,
 * AND across axes. Tags semantics within the axis: AND (doc must have ALL selected tags)
 * to match the sidebar's `matchesFilter` tag behavior from Plan A.
 */
export function applyCorkboardFilter(
  filter: CorkboardFilter,
  card: { doc_type: string; status: Status; tags: string[] },
): boolean {
  if (filter.docTypes.size > 0 && !filter.docTypes.has(card.doc_type)) return false;
  if (filter.statuses.size > 0 && !filter.statuses.has(card.status)) return false;
  if (filter.tags.size > 0) {
    const cardTagSet = new Set(card.tags);
    for (const t of filter.tags) {
      if (!cardTagSet.has(t)) return false;
    }
  }
  return true;
}
