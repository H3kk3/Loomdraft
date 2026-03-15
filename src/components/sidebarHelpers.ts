import type { ProjectManifest } from "../types";

export function countSubtree(manifest: ProjectManifest, nodeId: string): number {
  const node = manifest.nodes[nodeId];
  if (!node) return 0;
  return 1 + node.children.reduce((acc, c) => acc + countSubtree(manifest, c), 0);
}
