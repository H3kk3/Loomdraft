// src/components/Card.tsx

import { memo } from "react";
import type { CorkboardCard, DocTypeDefinition } from "../types";
import { DocTypeIcon } from "./Sidebar";

export type CardDensity = "compact" | "comfortable" | "full";

export interface CardProps {
  card: CorkboardCard;
  docTypes: DocTypeDefinition[];
  density: CardDensity;
  selected: boolean;
  dragging: boolean;
  tagColors: Record<string, string>;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  onPointerDown: (id: string, x: number, y: number) => void;
}

function formatWordCount(n: number): string {
  if (n < 1000) return `${n}w`;
  return `${(n / 1000).toFixed(1)}k`;
}

const TAG_OVERFLOW_THRESHOLD = 3;

export const Card = memo(function Card({
  card,
  docTypes,
  density,
  selected,
  dragging,
  tagColors,
  onSelect,
  onOpen,
  onContextMenu,
  onPointerDown,
}: CardProps) {
  const classes = [
    "corkboard-card",
    `density-${density}`,
    selected ? "selected" : "",
    dragging ? "dragging" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const visibleTags = card.tags.slice(0, TAG_OVERFLOW_THRESHOLD);
  const overflowCount = Math.max(0, card.tags.length - TAG_OVERFLOW_THRESHOLD);

  return (
    <div
      className={classes}
      role="button"
      tabIndex={0}
      aria-label={`${card.title}, ${card.status}, ${card.word_count} words`}
      style={{ boxShadow: `inset 3px 0 0 0 var(--status-${card.status})` }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest("button")) return;
        onPointerDown(card.id, e.clientX, e.clientY);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(card.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpen(card.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onOpen(card.id);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(card.id, e.clientX, e.clientY);
      }}
    >
      <div className="corkboard-card-header">
        <span className="corkboard-card-icon">
          <DocTypeIcon docType={card.doc_type} docTypes={docTypes} />
        </span>
        <span className="corkboard-card-title">{card.title}</span>
      </div>

      {density !== "compact" && (
        <div className="corkboard-card-synopsis">
          {card.synopsis || <span className="corkboard-card-synopsis-empty">No synopsis</span>}
        </div>
      )}

      {density === "full" && visibleTags.length > 0 && (
        <div className="corkboard-card-tags">
          {visibleTags.map((tag) => (
            <span
              key={tag}
              className="corkboard-card-tag"
              style={{ background: tagColors[tag] ?? "var(--bg-3)" }}
              title={tag}
            >
              {tag}
            </span>
          ))}
          {overflowCount > 0 && (
            <span className="corkboard-card-tag corkboard-card-tag-overflow">
              +{overflowCount}
            </span>
          )}
        </div>
      )}

      <div className="corkboard-card-footer">
        <span className="corkboard-card-wordcount">{formatWordCount(card.word_count)}</span>
        {density === "full" && (
          <span className={`corkboard-card-status-chip status-${card.status}`}>
            {card.status}
          </span>
        )}
      </div>
    </div>
  );
});
