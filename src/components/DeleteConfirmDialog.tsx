import type { ProjectManifest } from "../types";
import { countSubtree } from "./sidebarHelpers";

function collectDescendantTitles(
  manifest: ProjectManifest,
  nodeId: string,
  maxCount: number,
): { titles: string[]; remaining: number } {
  const titles: string[] = [];
  const stack = [...(manifest.nodes[nodeId]?.children ?? [])];
  let total = 0;
  while (stack.length > 0) {
    const id = stack.pop()!;
    const child = manifest.nodes[id];
    if (!child) continue;
    total++;
    if (titles.length < maxCount) {
      titles.push(child.title ?? id);
    }
    for (const grandchild of child.children) {
      stack.push(grandchild);
    }
  }
  return { titles, remaining: total - titles.length };
}

export interface DeleteConfirmDialogProps {
  nodeId: string;
  manifest: ProjectManifest;
  onConfirm: (id: string) => void;
  onCancel: () => void;
}

export function DeleteConfirmDialog({
  nodeId,
  manifest,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  const node = manifest.nodes[nodeId];
  const title = node?.title ?? nodeId;
  const total = countSubtree(manifest, nodeId);
  const childCount = total - 1;
  const { titles: childTitles, remaining } =
    childCount > 0 ? collectDescendantTitles(manifest, nodeId, 5) : { titles: [], remaining: 0 };

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <h3>Delete "{title}"?</h3>
        {childCount > 0 && (
          <>
            <p className="delete-warning">
              This will also permanently delete {childCount} child{childCount !== 1 ? "ren" : ""}{" "}
              and all their files:
            </p>
            <ul className="delete-child-list">
              {childTitles.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
              {remaining > 0 && <li className="delete-child-more">and {remaining} more…</li>}
            </ul>
          </>
        )}
        <p className="delete-subtext">This action cannot be undone.</p>
        <div className="dialog-actions">
          <button onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button className="danger-btn" onClick={() => onConfirm(nodeId)}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
