import { describe, it, expect } from "vitest";
import {
  isManuscriptDocType,
  getDocCategory,
  getAllowedChildDocTypes,
  getManuscriptDocTypes,
  getPlanningDocTypes,
} from "./docTypes";
import type { DocTypeDefinition } from "./types";

const SAMPLE_DOC_TYPES: DocTypeDefinition[] = [
  { id: "part", label: "Part", category: "manuscript", icon: "Library", heading_level: 1, builtin: true },
  { id: "chapter", label: "Chapter", category: "manuscript", icon: "BookOpen", heading_level: 2, builtin: true },
  { id: "scene", label: "Scene", category: "manuscript", icon: "Film", heading_level: 3, builtin: true },
  { id: "interlude", label: "Interlude", category: "manuscript", icon: "Pause", heading_level: 3, builtin: true },
  { id: "snippet", label: "Snippet", category: "manuscript", icon: "Scissors", heading_level: 3, builtin: true },
  { id: "character", label: "Character", category: "planning", icon: "User", heading_level: 0, builtin: true },
  { id: "location", label: "Location", category: "planning", icon: "MapPin", heading_level: 0, builtin: true },
  { id: "item", label: "Item", category: "planning", icon: "Sword", heading_level: 0, builtin: true },
  { id: "note", label: "Note", category: "planning", icon: "StickyNote", heading_level: 0, builtin: true },
  { id: "research", label: "Research", category: "planning", icon: "Microscope", heading_level: 0, builtin: true },
  { id: "lore", label: "Lore", category: "planning", icon: "ScrollText", heading_level: 0, builtin: true },
];

describe("isManuscriptDocType", () => {
  it.each(["part", "chapter", "scene", "interlude", "snippet"])(
    "returns true for manuscript type '%s'",
    (dt) => {
      expect(isManuscriptDocType(SAMPLE_DOC_TYPES, dt)).toBe(true);
    },
  );

  it.each(["character", "location", "item", "note", "research", "lore"])(
    "returns false for planning type '%s'",
    (dt) => {
      expect(isManuscriptDocType(SAMPLE_DOC_TYPES, dt)).toBe(false);
    },
  );

  it("returns false for null", () => {
    expect(isManuscriptDocType(SAMPLE_DOC_TYPES, null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isManuscriptDocType(SAMPLE_DOC_TYPES, undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isManuscriptDocType(SAMPLE_DOC_TYPES, "")).toBe(false);
  });

  it("returns false for unknown type", () => {
    expect(isManuscriptDocType(SAMPLE_DOC_TYPES, "poem")).toBe(false);
  });
});

describe("getDocCategory", () => {
  it("returns 'manuscript' for manuscript types", () => {
    expect(getDocCategory(SAMPLE_DOC_TYPES, "chapter")).toBe("manuscript");
    expect(getDocCategory(SAMPLE_DOC_TYPES, "scene")).toBe("manuscript");
  });

  it("returns 'planning' for planning types", () => {
    expect(getDocCategory(SAMPLE_DOC_TYPES, "character")).toBe("planning");
    expect(getDocCategory(SAMPLE_DOC_TYPES, "note")).toBe("planning");
  });

  it("returns 'planning' for null/undefined", () => {
    expect(getDocCategory(SAMPLE_DOC_TYPES, null)).toBe("planning");
    expect(getDocCategory(SAMPLE_DOC_TYPES, undefined)).toBe("planning");
  });
});

describe("getAllowedChildDocTypes", () => {
  it("returns all doc types when parent type is null", () => {
    const result = getAllowedChildDocTypes(SAMPLE_DOC_TYPES, null);
    expect(result).toEqual(SAMPLE_DOC_TYPES);
  });

  it("returns all doc types when parent type is undefined", () => {
    const result = getAllowedChildDocTypes(SAMPLE_DOC_TYPES, undefined);
    expect(result).toEqual(SAMPLE_DOC_TYPES);
  });

  it("returns manuscript types for manuscript parent", () => {
    const result = getAllowedChildDocTypes(SAMPLE_DOC_TYPES, "chapter");
    expect(result).toEqual(getManuscriptDocTypes(SAMPLE_DOC_TYPES));
  });

  it("returns planning types for planning parent", () => {
    const result = getAllowedChildDocTypes(SAMPLE_DOC_TYPES, "character");
    expect(result).toEqual(getPlanningDocTypes(SAMPLE_DOC_TYPES));
  });
});
