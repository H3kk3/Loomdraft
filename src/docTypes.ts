import type { DocType } from "./types";

export type DocCategory = "manuscript" | "planning";

export const MANUSCRIPT_DOC_TYPES: DocType[] = ["part", "chapter", "scene", "interlude", "snippet"];

export const PLANNING_DOC_TYPES: DocType[] = [
  "character",
  "location",
  "item",
  "organization",
  "event",
  "lore",
  "outline",
  "research",
  "note",
];

const MANUSCRIPT_TYPE_SET = new Set<string>(MANUSCRIPT_DOC_TYPES);
const ALL_DOC_TYPES: DocType[] = [...MANUSCRIPT_DOC_TYPES, ...PLANNING_DOC_TYPES];

export function isManuscriptDocType(docType?: string | null): boolean {
  return !!docType && MANUSCRIPT_TYPE_SET.has(docType);
}

export function getDocCategory(docType?: string | null): DocCategory {
  return isManuscriptDocType(docType) ? "manuscript" : "planning";
}

export function getAllowedChildDocTypes(parentDocType?: string | null): DocType[] {
  if (!parentDocType) return ALL_DOC_TYPES;
  return isManuscriptDocType(parentDocType) ? MANUSCRIPT_DOC_TYPES : PLANNING_DOC_TYPES;
}
