// src/components/Corkboard.tsx

import { memo, useMemo, useState, useEffect, useCallback, useRef } from "react";
import type {
  ProjectManifest,
  ProjectMetadata,
  CorkboardCard,
  CorkboardData,
  Status,
} from "../types";
import { ContextMenu } from "./ContextMenu";
import { Card, type CardDensity } from "./Card";
import {
  CorkboardFilterBar,
  emptyFilter,
  applyCorkboardFilter,
  type CorkboardFilter,
} from "./CorkboardFilterBar";

export interface CorkboardProps {
  manifest: ProjectManifest;
  metadata: ProjectMetadata;
  data: CorkboardData;
  density: CardDensity;
  selectedId: string | null;
  tagColors: Record<string, string>;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onReorder: (cardId: string, newParentId: string, position: number) => Promise<void>;
  onDensityChange: (density: CardDensity) => void;
  onSetStatus?: (id: string, status: Status) => Promise<void>;
  onEditTags?: (id: string) => void;
  currentStatusFor: (id: string) => Status | undefined;
}

type RenderItem =
  | { kind: "part"; id: string; title: string }
  | { kind: "chapter"; id: string; title: string }
  | { kind: "cards"; id: string; cards: CorkboardCard[] };

/**
 * Walk the manifest's manuscript subtree and produce a flat list of render items.
 * Parts and Chapters become headers; their card-bearing descendants become card
 * groups. Scenes/interludes/snippets that appear outside any chapter are grouped
 * into an anonymous card-bucket that flushes when the next Part or Chapter starts.
 */
function buildRenderItems(manifest: ProjectManifest, data: CorkboardData): RenderItem[] {
  const items: RenderItem[] = [];
  const rootNode = manifest.nodes[manifest.root];
  if (!rootNode) return items;

  const manuscriptDocTypes = new Set(
    manifest.doc_types.filter((dt) => dt.category === "manuscript").map((dt) => dt.id),
  );

  // Bucket for orphan cards at the root level or between chapters.
  let orphanCards: CorkboardCard[] = [];
  const flushOrphans = () => {
    if (orphanCards.length > 0) {
      items.push({
        kind: "cards",
        id: `cards-orphans-${items.length}`,
        cards: orphanCards,
      });
      orphanCards = [];
    }
  };

  const walk = (nodeId: string) => {
    const node = manifest.nodes[nodeId];
    if (!node) return;
    const docType = node.doc_type ?? "";

    if (nodeId === manifest.root) {
      for (const childId of node.children) walk(childId);
      return;
    }

    if (docType && !manuscriptDocTypes.has(docType)) return;

    if (docType === "part") {
      flushOrphans();
      items.push({ kind: "part", id: nodeId, title: node.title ?? "Untitled Part" });
      for (const childId of node.children) walk(childId);
      return;
    }

    if (docType === "chapter") {
      flushOrphans();
      items.push({ kind: "chapter", id: nodeId, title: node.title ?? "Untitled Chapter" });
      const chapterCards: CorkboardCard[] = [];
      for (const childId of node.children) {
        const childCard = data.cards[childId];
        if (childCard) {
          chapterCards.push(childCard);
        } else {
          walk(childId);
        }
      }
      if (chapterCards.length > 0) {
        items.push({
          kind: "cards",
          id: `cards-${nodeId}`,
          cards: chapterCards,
        });
      }
      return;
    }

    const card = data.cards[nodeId];
    if (card) orphanCards.push(card);
  };

  walk(manifest.root);
  flushOrphans();
  return items;
}

/** Build a map from child node id to its immediate parent id. */
function buildParentMap(manifest: ProjectManifest): Map<string, string> {
  const parents = new Map<string, string>();
  for (const [parentId, node] of Object.entries(manifest.nodes)) {
    for (const childId of node.children) {
      parents.set(childId, parentId);
    }
  }
  return parents;
}

export const Corkboard = memo(function Corkboard({
  manifest,
  metadata,
  data,
  density,
  selectedId,
  tagColors,
  onSelect,
  onOpen,
  onReorder,
  onDensityChange,
  onSetStatus,
  onEditTags,
  currentStatusFor,
}: CorkboardProps) {
  // `metadata` is unused in this task's render path — it's kept on the prop
  // interface for future tasks (filter chips, context-menu status lookup).
  void metadata;

  const [filter, setFilter] = useState<CorkboardFilter>(emptyFilter);

  interface DragState {
    cardId: string;
    startX: number;
    startY: number;
    active: boolean;
  }
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{
    targetChapterId: string;
    position: number;
  } | null>(null);

  // Refs mirror the state values so the window-level pointer handlers
  // registered inside the `[drag]` effect always see the LATEST drop
  // indicator and drag state, not the stale closure values from when the
  // effect ran. Without this, pointerup's `dropIndicator` would almost
  // always be null and drag-drop would silently no-op on release.
  const dragRef = useRef<DragState | null>(null);
  const dropIndicatorRef = useRef<{ targetChapterId: string; position: number } | null>(null);
  useEffect(() => { dragRef.current = drag; }, [drag]);
  useEffect(() => { dropIndicatorRef.current = dropIndicator; }, [dropIndicator]);

  const parentMap = useMemo(() => buildParentMap(manifest), [manifest]);

  const handleCardPointerDown = useCallback((id: string, x: number, y: number) => {
    setDrag({ cardId: id, startX: x, startY: y, active: false });
  }, []);

  const availableTags = useMemo(() => {
    const set = new Set<string>();
    for (const card of Object.values(data.cards)) {
      for (const t of card.tags) set.add(t);
    }
    return Array.from(set).sort();
  }, [data.cards]);

  const [cardContextMenu, setCardContextMenu] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);

  const handleCardContextMenu = useCallback((id: string, x: number, y: number) => {
    setCardContextMenu({ nodeId: id, x, y });
  }, []);

  const items = useMemo(() => buildRenderItems(manifest, data), [manifest, data]);

  const visibleCardIds = useMemo(() => {
    const ids: string[] = [];
    for (const item of items) {
      if (item.kind !== "cards") continue;
      for (const card of item.cards) {
        if (applyCorkboardFilter(filter, card)) ids.push(card.id);
      }
    }
    return ids;
  }, [items, filter]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.matches?.("input, textarea, [contenteditable='true']")) return;
      if (visibleCardIds.length === 0) return;

      const idx = selectedId ? visibleCardIds.indexOf(selectedId) : -1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = idx < 0 ? 0 : Math.min(idx + 1, visibleCardIds.length - 1);
        onSelect(visibleCardIds[next]);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = idx <= 0 ? 0 : idx - 1;
        onSelect(visibleCardIds[prev]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visibleCardIds, selectedId, onSelect]);

  useEffect(() => {
    const DENSITIES: CardDensity[] = ["compact", "comfortable", "full"];
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in an input/textarea/contenteditable
      const target = e.target as HTMLElement;
      if (target.matches?.("input, textarea, [contenteditable='true']")) return;

      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        const idx = DENSITIES.indexOf(density);
        if (idx < DENSITIES.length - 1) onDensityChange(DENSITIES[idx + 1]);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        const idx = DENSITIES.indexOf(density);
        if (idx > 0) onDensityChange(DENSITIES[idx - 1]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [density, onDensityChange]);

  useEffect(() => {
    if (!drag) return;

    const DRAG_THRESHOLD = 4; // px

    const onMove = (e: PointerEvent) => {
      // Always read the latest drag state from the ref so threshold-activation
      // and hit-testing below use current data rather than the stale closure.
      const currentDrag = dragRef.current;
      if (!currentDrag) return;

      // Activate drag only after threshold
      if (!currentDrag.active) {
        const dx = Math.abs(e.clientX - currentDrag.startX);
        const dy = Math.abs(e.clientY - currentDrag.startY);
        if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;
        setDrag({ ...currentDrag, active: true });
      }

      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (!target) {
        setDropIndicator(null);
        return;
      }

      // Chapter header hit-test FIRST — dropping on a different chapter's header moves the card there.
      const header = (target as Element).closest("[data-chapter-drop]") as HTMLElement | null;
      if (header && header.dataset.chapterDrop) {
        const targetChapterId = header.dataset.chapterDrop;
        // Only indicate drop if the card isn't already in this chapter.
        if (parentMap.get(currentDrag.cardId) !== targetChapterId) {
          setDropIndicator({
            targetChapterId,
            position: Number.MAX_SAFE_INTEGER, // append-to-end; clamped in App.tsx's onReorder
          });
          return;
        }
        // Same-chapter header hover: do nothing (let the user drop into the grid instead).
      }

      // Grid (card group) hit-test
      const grid = (target as Element).closest("[data-group-id]") as HTMLElement | null;
      if (!grid) {
        setDropIndicator(null);
        return;
      }
      const groupId = grid.dataset.groupId ?? "";
      // Only "cards-<chapterId>" groups are chapter-anchored; ignore orphan buckets for now.
      if (!groupId.startsWith("cards-") || groupId.startsWith("cards-orphans-")) {
        setDropIndicator(null);
        return;
      }
      const targetChapterId = groupId.slice("cards-".length);
      if (!manifest.nodes[targetChapterId]) {
        setDropIndicator(null);
        return;
      }

      // Compute insertion position by measuring sibling cards.
      const cardEls = grid.querySelectorAll<HTMLElement>(".corkboard-card");
      let position = cardEls.length;
      for (let i = 0; i < cardEls.length; i++) {
        const rect = cardEls[i].getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY || (Math.abs(e.clientY - midY) < rect.height / 2 && e.clientX < midX)) {
          position = i;
          break;
        }
      }
      setDropIndicator({ targetChapterId, position });
    };

    const onUp = () => {
      // Read latest values from refs — the state captured when this effect ran
      // is always stale by pointerup time (drop indicator was null at effect start).
      const currentDrag = dragRef.current;
      const currentDrop = dropIndicatorRef.current;
      if (currentDrag?.active && currentDrop) {
        // Fire-and-forget; the async reorder is awaited inside onReorder.
        void onReorder(currentDrag.cardId, currentDrop.targetChapterId, currentDrop.position).catch((err) => {
          console.error("Corkboard reorder failed:", err);
        });
      }
      setDrag(null);
      setDropIndicator(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // Handlers read state via refs (dragRef, dropIndicatorRef), so [drag] is
    // the correct dep — we only need to re-register when a drag starts/ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

  return (
    <div className="corkboard-view" role="region" aria-label="Corkboard">
      <div className="corkboard-header">
        <h1>Corkboard</h1>
        <div className="corkboard-header-spacer" />
        <div className="corkboard-zoom-controls" role="group" aria-label="Card density">
          <span>Density:</span>
          {(["compact", "comfortable", "full"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={density === d}
              onClick={() => onDensityChange(d)}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <CorkboardFilterBar
        filter={filter}
        onChange={setFilter}
        docTypes={manifest.doc_types}
        availableTags={availableTags}
        tagColors={tagColors}
      />

      {items.length === 0 && (
        <p style={{ color: "var(--text-dim)" }}>
          No manuscript documents yet. Add a chapter from the sidebar.
        </p>
      )}

      {items.map((item) => {
        if (item.kind === "part") {
          return (
            <h2 key={item.id} className="corkboard-part-header">
              {item.title}
            </h2>
          );
        }
        if (item.kind === "chapter") {
          const isHeaderDropTarget =
            dropIndicator?.targetChapterId === item.id &&
            drag?.cardId !== undefined &&
            parentMap.get(drag.cardId) !== item.id;
          return (
            <h3
              key={item.id}
              className={`corkboard-chapter-header${isHeaderDropTarget ? " drop-target-active" : ""}`}
              data-chapter-drop={item.id}
            >
              {item.title}
            </h3>
          );
        }
        const visibleCards = item.cards.filter((card) => applyCorkboardFilter(filter, card));
        if (visibleCards.length === 0) return null;
        const isDropTarget =
          dropIndicator !== null && `cards-${dropIndicator.targetChapterId}` === item.id;
        return (
          <div
            key={item.id}
            className={`corkboard-grid density-${density}${isDropTarget ? " drop-target-active" : ""}`}
            data-group-id={item.id}
          >
            {visibleCards.map((card) => (
              <Card
                key={card.id}
                card={card}
                docTypes={manifest.doc_types}
                density={density}
                selected={selectedId === card.id}
                dragging={drag?.active === true && drag.cardId === card.id}
                tagColors={tagColors}
                onSelect={onSelect}
                onOpen={onOpen}
                onContextMenu={handleCardContextMenu}
                onPointerDown={handleCardPointerDown}
              />
            ))}
          </div>
        );
      })}

      {cardContextMenu && (
        <ContextMenu
          nodeId={cardContextMenu.nodeId}
          x={cardContextMenu.x}
          y={cardContextMenu.y}
          isRoot={false}
          onAddChild={() => setCardContextMenu(null)}
          onRename={() => setCardContextMenu(null)}
          onDelete={() => setCardContextMenu(null)}
          onClose={() => setCardContextMenu(null)}
          currentStatus={currentStatusFor(cardContextMenu.nodeId)}
          onSetStatus={
            onSetStatus
              ? async (id, status) => {
                  await onSetStatus(id, status);
                  setCardContextMenu(null);
                }
              : undefined
          }
          onEditTags={
            onEditTags
              ? (id) => {
                  onEditTags(id);
                  setCardContextMenu(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
});
