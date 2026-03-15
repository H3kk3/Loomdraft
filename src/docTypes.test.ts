import { describe, it, expect } from "vitest";
import {
  isManuscriptDocType,
  getDocCategory,
  getAllowedChildDocTypes,
  MANUSCRIPT_DOC_TYPES,
  PLANNING_DOC_TYPES,
} from "./docTypes";

describe("isManuscriptDocType", () => {
  it.each(["part", "chapter", "scene", "interlude", "snippet"])(
    "returns true for manuscript type '%s'",
    (dt) => {
      expect(isManuscriptDocType(dt)).toBe(true);
    },
  );

  it.each(["character", "location", "item", "note", "research", "lore"])(
    "returns false for planning type '%s'",
    (dt) => {
      expect(isManuscriptDocType(dt)).toBe(false);
    },
  );

  it("returns false for null", () => {
    expect(isManuscriptDocType(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isManuscriptDocType(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isManuscriptDocType("")).toBe(false);
  });

  it("returns false for unknown type", () => {
    expect(isManuscriptDocType("poem")).toBe(false);
  });
});

describe("getDocCategory", () => {
  it("returns 'manuscript' for manuscript types", () => {
    expect(getDocCategory("chapter")).toBe("manuscript");
    expect(getDocCategory("scene")).toBe("manuscript");
  });

  it("returns 'planning' for planning types", () => {
    expect(getDocCategory("character")).toBe("planning");
    expect(getDocCategory("note")).toBe("planning");
  });

  it("returns 'planning' for null/undefined", () => {
    expect(getDocCategory(null)).toBe("planning");
    expect(getDocCategory(undefined)).toBe("planning");
  });
});

describe("getAllowedChildDocTypes", () => {
  it("returns all doc types when parent type is null", () => {
    const result = getAllowedChildDocTypes(null);
    expect(result).toEqual([...MANUSCRIPT_DOC_TYPES, ...PLANNING_DOC_TYPES]);
  });

  it("returns all doc types when parent type is undefined", () => {
    const result = getAllowedChildDocTypes(undefined);
    expect(result).toEqual([...MANUSCRIPT_DOC_TYPES, ...PLANNING_DOC_TYPES]);
  });

  it("returns manuscript types for manuscript parent", () => {
    expect(getAllowedChildDocTypes("chapter")).toEqual(MANUSCRIPT_DOC_TYPES);
    expect(getAllowedChildDocTypes("part")).toEqual(MANUSCRIPT_DOC_TYPES);
  });

  it("returns planning types for planning parent", () => {
    expect(getAllowedChildDocTypes("character")).toEqual(PLANNING_DOC_TYPES);
    expect(getAllowedChildDocTypes("note")).toEqual(PLANNING_DOC_TYPES);
  });
});
