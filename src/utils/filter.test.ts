import { describe, it, expect } from "vitest";
import { parseFilterQuery, matchesFilter, type ParsedFilter } from "./filter";

describe("parseFilterQuery", () => {
  it("returns an empty filter for an empty string", () => {
    const f = parseFilterQuery("");
    expect(f.types).toEqual([]);
    expect(f.statuses).toEqual([]);
    expect(f.tags).toEqual([]);
    expect(f.text).toBe("");
  });

  it("extracts prefixed tokens", () => {
    const f = parseFilterQuery("type:scene status:draft tag:foreshadowing");
    expect(f.types).toEqual(["scene"]);
    expect(f.statuses).toEqual(["draft"]);
    expect(f.tags).toEqual(["foreshadowing"]);
    expect(f.text).toBe("");
  });

  it("keeps multiple occurrences of the same prefix", () => {
    const f = parseFilterQuery("status:draft status:revised tag:a tag:b");
    expect(f.statuses).toEqual(["draft", "revised"]);
    expect(f.tags).toEqual(["a", "b"]);
  });

  it("treats non-prefixed words as free-text search", () => {
    const f = parseFilterQuery("type:scene the encounter");
    expect(f.types).toEqual(["scene"]);
    expect(f.text).toBe("the encounter");
  });

  it("is case-insensitive for prefixed values", () => {
    const f = parseFilterQuery("Type:Scene STATUS:Draft");
    expect(f.types).toEqual(["scene"]);
    expect(f.statuses).toEqual(["draft"]);
  });

  it("treats prefix with empty value as free text", () => {
    // `tag:` has no value after the colon, so the regex doesn't match.
    // The entire token falls through as free text.
    const f = parseFilterQuery("tag:");
    expect(f.tags).toEqual([]);
    expect(f.text).toBe("tag:");
  });

  it("treats unknown prefix as free text", () => {
    // Only type/status/tag are recognized prefixes. Others fall through.
    const f = parseFilterQuery("author:hemingway");
    expect(f.types).toEqual([]);
    expect(f.statuses).toEqual([]);
    expect(f.tags).toEqual([]);
    expect(f.text).toBe("author:hemingway");
  });

  it("handles unicode tag values", () => {
    const f = parseFilterQuery("tag:ünicode");
    expect(f.tags).toEqual(["ünicode"]);
  });
});

describe("matchesFilter", () => {
  const baseNode = { title: "The Encounter", doc_type: "scene" };
  const baseMeta = {
    synopsis: null as string | null,
    tags: ["foreshadowing"],
    status: "draft" as const,
  };

  it("empty filter matches everything", () => {
    const f: ParsedFilter = parseFilterQuery("");
    expect(matchesFilter(f, baseNode, baseMeta)).toBe(true);
  });

  it("matches type", () => {
    const f = parseFilterQuery("type:scene");
    expect(matchesFilter(f, baseNode, baseMeta)).toBe(true);
    expect(matchesFilter(f, { ...baseNode, doc_type: "chapter" }, baseMeta)).toBe(false);
  });

  it("multiple types are OR", () => {
    const f = parseFilterQuery("type:scene type:chapter");
    expect(matchesFilter(f, { ...baseNode, doc_type: "scene" }, baseMeta)).toBe(true);
    expect(matchesFilter(f, { ...baseNode, doc_type: "chapter" }, baseMeta)).toBe(true);
    expect(matchesFilter(f, { ...baseNode, doc_type: "part" }, baseMeta)).toBe(false);
  });

  it("cross-prefix is AND", () => {
    const f = parseFilterQuery("type:scene status:revised");
    expect(matchesFilter(f, baseNode, baseMeta)).toBe(false); // status mismatch
    expect(matchesFilter(f, baseNode, { ...baseMeta, status: "revised" })).toBe(true);
  });

  it("tag is AND across multiple tag tokens", () => {
    const f = parseFilterQuery("tag:foreshadowing tag:subplot-a");
    expect(matchesFilter(f, baseNode, baseMeta)).toBe(false); // only has foreshadowing
    expect(matchesFilter(f, baseNode, { ...baseMeta, tags: ["foreshadowing", "subplot-a"] })).toBe(true);
  });

  it("free text matches title substring (case-insensitive)", () => {
    const f = parseFilterQuery("encounter");
    expect(matchesFilter(f, baseNode, baseMeta)).toBe(true);
    expect(matchesFilter(f, { ...baseNode, title: "The Duel" }, baseMeta)).toBe(false);
  });
});
