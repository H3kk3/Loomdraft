import { useState, useRef, useEffect, useMemo } from "react";
import { DocTypeIcon } from "./Sidebar";
import type { ProjectManifest } from "../types";

interface QuickOpenProps {
  manifest: ProjectManifest;
  onSelectNode: (id: string) => void;
  onClose: () => void;
}

interface QuickOpenEntry {
  id: string;
  title: string;
  docType: string;
}

function fuzzyMatch(query: string, text: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function QuickOpen({ manifest, onSelectNode, onClose }: QuickOpenProps) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build flat list of all titled nodes
  const allEntries = useMemo<QuickOpenEntry[]>(() => {
    const entries: QuickOpenEntry[] = [];
    for (const [id, node] of Object.entries(manifest.nodes)) {
      if (id === manifest.root) continue;
      if (!node.title || !node.doc_type) continue;
      entries.push({ id, title: node.title, docType: node.doc_type });
    }
    entries.sort((a, b) => a.title.localeCompare(b.title));
    return entries;
  }, [manifest]);

  // Filter entries by fuzzy query
  const filtered = useMemo(() => {
    if (!query.trim()) return allEntries;
    return allEntries.filter((e) => fuzzyMatch(query, e.title));
  }, [query, allEntries]);

  // Auto-focus
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Keep active item in view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.children[activeIdx] as HTMLElement | undefined;
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const handleSelect = (id: string) => {
    onSelectNode(id);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered.length > 0) {
      e.preventDefault();
      handleSelect(filtered[activeIdx].id);
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="search-panel quick-open-panel"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="search-panel-header">
          <input
            ref={inputRef}
            className="search-panel-input"
            type="text"
            placeholder="Go to document…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
          />
        </div>
        <div className="search-panel-results" ref={listRef}>
          {filtered.length === 0 && <div className="search-panel-empty">No matching documents</div>}
          {filtered.map((entry, i) => (
            <button
              key={entry.id}
              className={`search-result-item${i === activeIdx ? " active" : ""}`}
              onClick={() => handleSelect(entry.id)}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span className="search-result-icon">
                <DocTypeIcon docType={entry.docType} />
              </span>
              <span className="search-result-title">{entry.title}</span>
              <span className="search-result-type">{entry.docType}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
