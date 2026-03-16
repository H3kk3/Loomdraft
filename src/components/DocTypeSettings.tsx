import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { ICON_MAP, DocTypeIcon } from "./Sidebar";
import type { DocTypeDefinition } from "../types";

// ── Icon Picker ──────────────────────────────────────────────────────────────

const ICON_NAMES = Object.keys(ICON_MAP);

function IconPicker({
  value,
  docTypes,
  onChange,
}: {
  value: string;
  docTypes: DocTypeDefinition[];
  onChange: (icon: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="dts-icon-picker">
      <button
        className="dts-icon-picker-trigger"
        onClick={() => setOpen((v) => !v)}
        title="Choose icon"
        type="button"
      >
        <DocTypeIcon docType={`__preview_${value}`} docTypes={[{ id: `__preview_${value}`, label: "", category: "manuscript", icon: value, heading_level: 0, builtin: false }, ...docTypes]} />
        <ChevronDown size={10} />
      </button>
      {open && (
        <div className="dts-icon-grid-popover">
          <div className="dts-icon-grid">
            {ICON_NAMES.map((name) => {
              const Icon = ICON_MAP[name];
              return (
                <button
                  key={name}
                  className={`dts-icon-option${name === value ? " active" : ""}`}
                  title={name}
                  type="button"
                  onClick={() => {
                    onChange(name);
                    setOpen(false);
                  }}
                >
                  <Icon size={14} strokeWidth={1.75} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add Type Form ────────────────────────────────────────────────────────────

function AddTypeForm({
  category,
  docTypes,
  onAdd,
  onCancel,
}: {
  category: "manuscript" | "planning";
  docTypes: DocTypeDefinition[];
  onAdd: (dt: DocTypeDefinition) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState("FileText");
  const [headingLevel, setHeadingLevel] = useState(3);

  const id = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const isDuplicate = docTypes.some((dt) => dt.id === id);
  const canAdd = id.length > 0 && label.trim().length > 0 && !isDuplicate;

  const handleSubmit = () => {
    if (!canAdd) return;
    onAdd({
      id,
      label: label.trim(),
      category,
      icon,
      heading_level: category === "manuscript" ? headingLevel : 0,
      builtin: false,
    });
  };

  return (
    <div className="dts-add-form">
      <div className="dts-add-row">
        <IconPicker value={icon} docTypes={docTypes} onChange={setIcon} />
        <input
          className="dts-add-input"
          autoFocus
          placeholder="Type label…"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") onCancel();
          }}
        />
        {category === "manuscript" && (
          <select
            className="dts-heading-select"
            value={headingLevel}
            onChange={(e) => setHeadingLevel(Number(e.target.value))}
          >
            <option value={1}>Part (H1)</option>
            <option value={2}>Chapter (H2)</option>
            <option value={3}>Section (H3)</option>
          </select>
        )}
      </div>
      {isDuplicate && <div className="dts-error">A type with id "{id}" already exists</div>}
      <div className="dts-add-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="primary" disabled={!canAdd} onClick={handleSubmit}>
          Add
        </button>
      </div>
    </div>
  );
}

// ── Type Row ─────────────────────────────────────────────────────────────────

const HEADING_LABELS: Record<number, string> = { 1: "Part (H1)", 2: "Chapter (H2)", 3: "Section (H3)" };

function TypeRow({
  dt,
  docTypes,
  nodeCount,
  projectPath,
  onUpdated,
  onError,
}: {
  dt: DocTypeDefinition;
  docTypes: DocTypeDefinition[];
  nodeCount: number;
  projectPath: string;
  onUpdated: (updated: DocTypeDefinition[]) => void;
  onError: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(dt.label);
  const [icon, setIcon] = useState(dt.icon);
  const [headingLevel, setHeadingLevel] = useState(dt.heading_level);

  const handleRemove = async () => {
    try {
      const result = await invoke<DocTypeDefinition[]>("remove_doc_type", {
        projectPath,
        typeId: dt.id,
      });
      onUpdated(result);
    } catch (e: unknown) {
      onError(String(e));
    }
  };

  const handleSave = async () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    try {
      const result = await invoke<DocTypeDefinition[]>("update_doc_type", {
        projectPath,
        docType: {
          ...dt,
          label: trimmed,
          icon,
          heading_level: dt.category === "manuscript" ? headingLevel : 0,
        },
      });
      onUpdated(result);
      setEditing(false);
    } catch (e: unknown) {
      onError(String(e));
    }
  };

  if (editing) {
    return (
      <div className="dts-type-row dts-type-row-editing">
        <IconPicker value={icon} docTypes={docTypes} onChange={setIcon} />
        <input
          className="dts-add-input"
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") {
              setLabel(dt.label);
              setIcon(dt.icon);
              setHeadingLevel(dt.heading_level);
              setEditing(false);
            }
          }}
        />
        {dt.category === "manuscript" && (
          <select
            className="dts-heading-select"
            value={headingLevel}
            onChange={(e) => setHeadingLevel(Number(e.target.value))}
          >
            <option value={1}>Part (H1)</option>
            <option value={2}>Chapter (H2)</option>
            <option value={3}>Section (H3)</option>
          </select>
        )}
        <button className="dts-save-btn" type="button" onClick={handleSave}>
          Save
        </button>
        <button
          className="dts-cancel-btn"
          type="button"
          onClick={() => {
            setLabel(dt.label);
            setIcon(dt.icon);
            setHeadingLevel(dt.heading_level);
            setEditing(false);
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="dts-type-row" onClick={() => setEditing(true)}>
      <span className="dts-type-icon">
        <DocTypeIcon docType={dt.id} docTypes={docTypes} />
      </span>
      <span className="dts-type-label">{dt.label}</span>
      {dt.category === "manuscript" && dt.heading_level > 0 && (
        <span className="dts-type-heading">{HEADING_LABELS[dt.heading_level] ?? `H${dt.heading_level}`}</span>
      )}
      {nodeCount > 0 && <span className="dts-type-count">{nodeCount}</span>}
      <button
        className="dts-remove-btn"
        title={nodeCount > 0 ? `Cannot remove: ${nodeCount} document(s) use this type` : "Remove type"}
        disabled={nodeCount > 0}
        onClick={(e) => {
          e.stopPropagation();
          handleRemove();
        }}
      >
        <Trash2 size={12} strokeWidth={1.75} />
      </button>
    </div>
  );
}

// ── DocTypeSettings ──────────────────────────────────────────────────────────

interface DocTypeSettingsProps {
  projectPath: string;
  docTypes: DocTypeDefinition[];
  nodeCounts: Record<string, number>;
  onUpdated: (docTypes: DocTypeDefinition[]) => void;
  onClose: () => void;
}

export function DocTypeSettings({
  projectPath,
  docTypes,
  nodeCounts,
  onUpdated,
  onClose,
}: DocTypeSettingsProps) {
  const [addingCategory, setAddingCategory] = useState<"manuscript" | "planning" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manuscriptOpen, setManuscriptOpen] = useState(true);
  const [planningOpen, setPlanningOpen] = useState(true);

  const manuscriptTypes = docTypes.filter((dt) => dt.category === "manuscript");
  const planningTypes = docTypes.filter((dt) => dt.category === "planning");

  const handleAdd = async (dt: DocTypeDefinition) => {
    try {
      const result = await invoke<DocTypeDefinition[]>("add_doc_type", {
        projectPath,
        docType: dt,
      });
      onUpdated(result);
      setAddingCategory(null);
      setError(null);
    } catch (e: unknown) {
      setError(String(e));
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div className="dialog dts-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dts-header">
          <h3>Document Types</h3>
          <button className="icon-btn" onClick={onClose} title="Close">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        {error && (
          <div className="dts-error">{error}</div>
        )}

        {/* Manuscript section */}
        <div className="dts-section">
          <div className="dts-section-header">
            <button
              className="dts-section-toggle"
              onClick={() => setManuscriptOpen((v) => !v)}
              type="button"
            >
              {manuscriptOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>Manuscript Types</span>
              <span className="dts-section-count">{manuscriptTypes.length}</span>
            </button>
            <button
              className="dts-section-add"
              type="button"
              onClick={() => {
                setAddingCategory("manuscript");
                setManuscriptOpen(true);
                setError(null);
              }}
            >
              <Plus size={12} strokeWidth={2} />
              Add
            </button>
          </div>
          {manuscriptOpen && (
            <>
              {addingCategory === "manuscript" && (
                <AddTypeForm
                  category="manuscript"
                  docTypes={docTypes}
                  onAdd={handleAdd}
                  onCancel={() => setAddingCategory(null)}
                />
              )}
              <div className="dts-section-body">
                {manuscriptTypes.map((dt) => (
                  <TypeRow
                    key={dt.id}
                    dt={dt}
                    docTypes={docTypes}
                    nodeCount={nodeCounts[dt.id] ?? 0}
                    projectPath={projectPath}
                    onUpdated={onUpdated}
                    onError={setError}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Planning section */}
        <div className="dts-section">
          <div className="dts-section-header">
            <button
              className="dts-section-toggle"
              onClick={() => setPlanningOpen((v) => !v)}
              type="button"
            >
              {planningOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>Planning Types</span>
              <span className="dts-section-count">{planningTypes.length}</span>
            </button>
            <button
              className="dts-section-add"
              type="button"
              onClick={() => {
                setAddingCategory("planning");
                setPlanningOpen(true);
                setError(null);
              }}
            >
              <Plus size={12} strokeWidth={2} />
              Add
            </button>
          </div>
          {planningOpen && (
            <>
              {addingCategory === "planning" && (
                <AddTypeForm
                  category="planning"
                  docTypes={docTypes}
                  onAdd={handleAdd}
                  onCancel={() => setAddingCategory(null)}
                />
              )}
              <div className="dts-section-body">
                {planningTypes.map((dt) => (
                  <TypeRow
                    key={dt.id}
                    dt={dt}
                    docTypes={docTypes}
                    nodeCount={nodeCounts[dt.id] ?? 0}
                    projectPath={projectPath}
                    onUpdated={onUpdated}
                    onError={setError}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
