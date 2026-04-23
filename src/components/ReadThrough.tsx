// src/components/ReadThrough.tsx

import { memo, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import { mod } from "../utils/platform";

export interface ReadThroughProps {
  projectPath: string;
  /** Called when the user clicks a scene heading; nodeId is derived from data-node-id */
  onJumpToDoc: (nodeId: string) => void;
  /** Called when the user clicks the exit button. */
  onExit: () => void;
}

export const ReadThrough = memo(function ReadThrough({
  projectPath,
  onJumpToDoc,
  onExit,
}: ReadThroughProps) {
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const h = await invoke<string>("get_read_through_html", { projectPath });
        if (!cancelled) setHtml(h);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  // Click-to-jump: delegate click handling on the injected HTML. The export
  // renderer emits section heading anchors with `data-node-id`. When the user
  // clicks one, pop them back into the editor at that document.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest("[data-node-id]") as HTMLElement | null;
      if (!anchor) return;
      const id = anchor.dataset.nodeId;
      if (!id) return;
      e.preventDefault();
      onJumpToDoc(id);
    };
    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
  }, [onJumpToDoc]);

  const exitButton = (
    <button
      type="button"
      className="readthrough-exit"
      onClick={onExit}
      title={`Exit reading (${mod}+Shift+R)`}
      aria-label="Exit reading mode"
    >
      <X size={14} strokeWidth={2} aria-hidden />
      <span className="readthrough-exit-label">Exit reading</span>
      <kbd className="readthrough-exit-kbd">{mod}+Shift+R</kbd>
    </button>
  );

  if (loading) {
    return (
      <div className="readthrough-view" role="region" aria-label="Loading read-through">
        {exitButton}
        <p className="readthrough-status">Loading read-through…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="readthrough-view" role="region" aria-label="Read-through error">
        {exitButton}
        <p className="readthrough-status">Could not load read-through: {error}</p>
      </div>
    );
  }
  if (!html) {
    return (
      <div className="readthrough-view" role="region" aria-label="Read-through">
        {exitButton}
        <p className="readthrough-status">No manuscript documents to display yet.</p>
      </div>
    );
  }

  return (
    <div className="readthrough-view" role="region" aria-label="Read-through">
      {exitButton}
      <div
        ref={containerRef}
        className="readthrough-content"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
});
