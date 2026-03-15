import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, X } from "lucide-react";
import { DocTypeIcon } from "./Sidebar";
import type { SearchResult } from "../types";
import { SEARCH_DEBOUNCE_MS } from "../constants";

interface SearchPanelProps {
  projectPath: string;
  onSelectNode: (id: string) => void;
  onClose: () => void;
}

export function SearchPanel({ projectPath, onSelectNode, onClose }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number>(0);

  // Auto-focus on mount; clear debounce on unmount
  useEffect(() => {
    inputRef.current?.focus();
    return () => window.clearTimeout(debounceRef.current);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const doSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await invoke<SearchResult[]>("search_documents", {
          projectPath,
          query: trimmed,
        });
        setResults(res);
        setActiveIdx(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [projectPath],
  );

  const handleChange = (value: string) => {
    setQuery(value);
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => doSearch(value), SEARCH_DEBOUNCE_MS);
  };

  const handleSelect = (id: string) => {
    onSelectNode(id);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      handleSelect(results[activeIdx].id);
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="search-panel"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="search-panel-header">
          <Search size={16} strokeWidth={1.75} className="search-panel-icon" />
          <input
            ref={inputRef}
            className="search-panel-input"
            type="text"
            placeholder="Search documents…"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
          />
          <button className="icon-btn" onClick={onClose} title="Close (Esc)">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        <div className="search-panel-results">
          {loading && query.trim() && <div className="search-panel-empty">Searching…</div>}
          {!loading && query.trim() && results.length === 0 && (
            <div className="search-panel-empty">No results found</div>
          )}
          {results.map((r, i) => (
            <button
              key={r.id}
              className={`search-result-item${i === activeIdx ? " active" : ""}`}
              onClick={() => handleSelect(r.id)}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span className="search-result-icon">
                <DocTypeIcon docType={r.doc_type} />
              </span>
              <div className="search-result-body">
                <span className="search-result-title">{r.title}</span>
                {r.snippet && <span className="search-result-snippet">{r.snippet}</span>}
              </div>
              <span className="search-result-type">{r.doc_type}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
