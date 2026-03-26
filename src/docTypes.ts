import type { DocTypeDefinition } from "./types";

export type DocCategory = "manuscript" | "planning";

export function getManuscriptDocTypes(docTypes: DocTypeDefinition[]): DocTypeDefinition[] {
  return docTypes.filter((dt) => dt.category === "manuscript");
}

export function getPlanningDocTypes(docTypes: DocTypeDefinition[]): DocTypeDefinition[] {
  return docTypes.filter((dt) => dt.category === "planning");
}

export function isManuscriptDocType(docTypes: DocTypeDefinition[], typeId?: string | null): boolean {
  return !!typeId && docTypes.some((dt) => dt.id === typeId && dt.category === "manuscript");
}

export function getDocCategory(docTypes: DocTypeDefinition[], typeId?: string | null): DocCategory {
  return isManuscriptDocType(docTypes, typeId) ? "manuscript" : "planning";
}

export function getAllowedChildDocTypes(
  docTypes: DocTypeDefinition[],
  parentDocType?: string | null,
): DocTypeDefinition[] {
  if (!parentDocType) return docTypes;
  const parentIsManuscript = isManuscriptDocType(docTypes, parentDocType);
  return docTypes.filter((dt) => (dt.category === "manuscript") === parentIsManuscript);
}

export function getDocTypeLabel(docTypes: DocTypeDefinition[], typeId?: string | null): string {
  if (!typeId) return "Unknown";
  return docTypes.find((dt) => dt.id === typeId)?.label ?? typeId;
}
