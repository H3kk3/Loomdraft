import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import type { ProjectManifest } from "../types";

const DEFAULT_PALETTE = [
  "#4a90e2", "#b97cc8", "#5aa364", "#d4a545",
  "#c95a5a", "#8aaecc", "#e39b56", "#6d9b7b",
];

function colorForTag(tag: string, tagColors: Record<string, string>): string {
  if (tagColors[tag]) return tagColors[tag];
  // Deterministic fallback: hash tag name to palette index
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  }
  return DEFAULT_PALETTE[hash % DEFAULT_PALETTE.length];
}

export interface TagsEditorProps {
  projectPath: string;
  manifest: ProjectManifest;
  currentTags: string[];
  onSave: (tags: string[]) => Promise<void>;
  onManifestUpdate: (manifest: ProjectManifest) => void;
  onClose: () => void;
}

export function TagsEditor({
  projectPath,
  manifest,
  currentTags,
  onSave,
  onManifestUpdate,
  onClose,
}: TagsEditorProps) {
  const [tags, setTags] = useState<string[]>(currentTags);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const tagColors = manifest.tag_colors ?? {};

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase();
    if (!t) return;
    if (tags.includes(t)) return; // duplicate — leave input alone so user sees what they typed
    setTags([...tags, t]);
    setDraft("");
  };

  const removeTag = (t: string) => {
    setTags(tags.filter((x) => x !== t));
  };

  const handleColorChange = async (tag: string, color: string) => {
    try {
      const updated = await invoke<ProjectManifest>("set_tag_color", {
        projectPath,
        tag,
        color,
      });
      onManifestUpdate(updated);
    } catch (err) {
      console.error(`Failed to set color for tag "${tag}":`, err);
    }
  };

  const handleSave = async () => {
    try {
      await onSave(tags);
      onClose();
    } catch (err) {
      console.error("Failed to save tags:", err);
    }
  };

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal
        aria-labelledby="tags-editor-title"
      >
        <h3 id="tags-editor-title">Edit tags</h3>

        {tags.length === 0 ? (
          <p className="tag-list-empty">No tags yet. Add one below.</p>
        ) : (
          <div className="tag-list" role="list">
            {tags.map((t) => (
              <span key={t} className="tag-chip" role="listitem">
                <input
                  type="color"
                  className="tag-color-swatch"
                  value={colorForTag(t, tagColors)}
                  onChange={(e) => handleColorChange(t, e.target.value)}
                  aria-label={`Color for ${t}`}
                />
                <span className="tag-chip-label">{t}</span>
                <button
                  type="button"
                  className="tag-chip-remove"
                  aria-label={`Remove tag ${t}`}
                  onClick={() => removeTag(t)}
                >
                  <X size={12} strokeWidth={2} />
                </button>
              </span>
            ))}
          </div>
        )}

        <label>
          Add tag
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a tag and press Enter"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag(draft);
              }
            }}
          />
        </label>

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
