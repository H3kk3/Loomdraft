import type { ProjectManifest } from "../types";

export function findNodeByTitle(manifest: ProjectManifest, ref: string): string | null {
  const lower = ref.toLowerCase();
  for (const [id, node] of Object.entries(manifest.nodes)) {
    if (node.title?.toLowerCase() === lower) return id;
  }
  return null;
}
