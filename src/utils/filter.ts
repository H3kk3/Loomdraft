import type { NodeMetadata } from "../types";

export interface ParsedFilter {
  types: string[];       // OR
  statuses: string[];    // OR
  tags: string[];        // AND (doc must have ALL listed tags)
  text: string;          // substring to match against title (already lowercased)
}

const PREFIX_RE = /^(type|status|tag):(.+)$/i;

export function parseFilterQuery(query: string): ParsedFilter {
  const out: ParsedFilter = { types: [], statuses: [], tags: [], text: "" };
  if (!query.trim()) return out;

  const freeText: string[] = [];
  for (const token of query.trim().split(/\s+/)) {
    const m = PREFIX_RE.exec(token);
    if (!m) {
      freeText.push(token);
      continue;
    }
    const prefix = m[1].toLowerCase();
    const value = m[2].toLowerCase();
    if (prefix === "type") out.types.push(value);
    else if (prefix === "status") out.statuses.push(value);
    else if (prefix === "tag") out.tags.push(value);
  }
  out.text = freeText.join(" ").toLowerCase();
  return out;
}

interface MatchableNode {
  title: string;
  doc_type: string;
}

export function matchesFilter(
  filter: ParsedFilter,
  node: MatchableNode,
  meta: NodeMetadata,
): boolean {
  if (filter.types.length > 0 && !filter.types.includes(node.doc_type.toLowerCase())) {
    return false;
  }
  if (filter.statuses.length > 0 && !filter.statuses.includes(meta.status.toLowerCase())) {
    return false;
  }
  if (filter.tags.length > 0) {
    const metaTags = new Set(meta.tags.map((t) => t.toLowerCase()));
    for (const t of filter.tags) {
      if (!metaTags.has(t)) return false;
    }
  }
  if (filter.text) {
    if (!node.title.toLowerCase().includes(filter.text)) {
      return false;
    }
  }
  return true;
}
