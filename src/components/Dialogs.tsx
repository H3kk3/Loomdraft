import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { DocType } from "../types";

// ── NewProjectDialog ──────────────────────────────────────────────────────────

interface NewProjectDialogProps {
  onConfirm: (dir: string, name: string) => void;
  onCancel: () => void;
}

export function NewProjectDialog({ onConfirm, onCancel }: NewProjectDialogProps) {
  const [dir, setDir] = useState("");
  const [name, setName] = useState("");

  const slug = name.trim().replace(/\s+/g, "-");
  const preview = dir && slug ? `${dir}/${slug}` : null;
  const canCreate = !!dir && !!name.trim();

  const handleBrowse = async () => {
    const picked = await open({
      directory: true,
      title: "Choose location for new project",
    });
    if (picked && typeof picked === "string") setDir(picked);
  };

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <h3>New project</h3>

        <label>
          Location
          <div className="input-row">
            <input readOnly value={dir} placeholder="No folder selected" className="path-input" />
            <button type="button" onClick={handleBrowse} className="browse-btn">
              Browse…
            </button>
          </div>
        </label>

        <label>
          Project name
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canCreate) onConfirm(dir, name.trim());
              if (e.key === "Escape") onCancel();
            }}
            placeholder="My Novel"
          />
        </label>

        {preview && (
          <p className="path-preview">
            Will create&nbsp;<code>{preview}</code>
          </p>
        )}

        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!canCreate}
            onClick={() => onConfirm(dir, name.trim())}
          >
            Create project
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AddNodeDialog ─────────────────────────────────────────────────────────────

interface AddNodeDialogProps {
  parentTitle: string;
  allowedDocTypes: DocType[];
  onConfirm: (title: string, docType: DocType) => void;
  onCancel: () => void;
}

const DOC_TYPE_LABELS: Record<DocType, string> = {
  part: "Part",
  chapter: "Chapter",
  scene: "Scene",
  interlude: "Interlude",
  snippet: "Snippet",
  character: "Character",
  location: "Location",
  item: "Item",
  organization: "Organization",
  event: "Event",
  lore: "Lore",
  outline: "Outline",
  research: "Research",
  note: "Note",
};

export function AddNodeDialog({
  parentTitle,
  allowedDocTypes,
  onConfirm,
  onCancel,
}: AddNodeDialogProps) {
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState<DocType>(allowedDocTypes[0] ?? "chapter");

  // Keep docType in sync if allowedDocTypes changes from outside
  const effectiveDocType = allowedDocTypes.includes(docType)
    ? docType
    : (allowedDocTypes[0] ?? docType);

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <h3>New document under "{parentTitle}"</h3>
        <label>
          Title
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && title.trim() && allowedDocTypes.length > 0) {
                onConfirm(title.trim(), effectiveDocType);
              }
              if (e.key === "Escape") onCancel();
            }}
            placeholder="Untitled"
          />
        </label>
        <label>
          Type
          <select value={effectiveDocType} onChange={(e) => setDocType(e.target.value as DocType)}>
            {allowedDocTypes.map((type) => (
              <option key={type} value={type}>
                {DOC_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <div className="dialog-actions">
          <button onClick={onCancel}>Cancel</button>
          <button
            className="primary"
            disabled={!title.trim() || allowedDocTypes.length === 0}
            onClick={() => onConfirm(title.trim(), effectiveDocType)}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
