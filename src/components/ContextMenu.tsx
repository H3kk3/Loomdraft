import { useRef, useState, useEffect } from "react";
import type { Status } from "../types";
import { StatusSubmenu } from "./StatusSubmenu";

export interface ContextMenuProps {
  nodeId: string;
  x: number;
  y: number;
  isRoot: boolean;
  onAddChild: (id: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  // v0.3 additions
  currentStatus?: Status;
  onSetStatus?: (nodeId: string, status: Status) => void;
}

export function ContextMenu({
  nodeId,
  x,
  y,
  isRoot,
  onAddChild,
  onRename,
  onDelete,
  onClose,
  currentStatus,
  onSetStatus,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [focusIdx, setFocusIdx] = useState(0);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Focus first item on open & handle keyboard navigation
  useEffect(() => {
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>(".context-menu-item");
    items?.[focusIdx]?.focus();
  }, [focusIdx]);

  useEffect(() => {
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>(".context-menu-item");
    items?.[0]?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>(".context-menu-item");
    if (!items?.length) return;
    if (e.key === "ArrowDown" || e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      setFocusIdx((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp" || e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      setFocusIdx((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setFocusIdx(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setFocusIdx(items.length - 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      aria-label="Context menu"
      style={{
        position: "fixed",
        // 320 accommodates the full menu height when the status section is visible
        // (3 action items + separator + section label + 6 status items). Update if menu grows.
        top: Math.min(y, window.innerHeight - 320),
        left: Math.min(x, window.innerWidth - 160),
        zIndex: 200,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      {!isRoot && (
        <button
          className="context-menu-item"
          role="menuitem"
          onClick={() => {
            onAddChild(nodeId);
            onClose();
          }}
        >
          Add child
        </button>
      )}
      {!isRoot && (
        <button
          className="context-menu-item"
          role="menuitem"
          onClick={() => {
            onRename(nodeId);
            onClose();
          }}
        >
          Rename
        </button>
      )}
      {!isRoot && (
        <button
          className="context-menu-item danger"
          role="menuitem"
          onClick={() => {
            onDelete(nodeId);
            onClose();
          }}
        >
          Delete…
        </button>
      )}
      {!isRoot && onSetStatus && (
        <>
          <div className="context-menu-separator" role="separator" />
          <StatusSubmenu
            current={currentStatus}
            onSelect={(status) => {
              onSetStatus(nodeId, status);
              onClose();
            }}
          />
        </>
      )}
    </div>
  );
}
