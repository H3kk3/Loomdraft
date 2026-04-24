import { describe, it, expect } from "vitest";
import { STATUS_VALUES, type Status } from "./types";

describe("STATUS_VALUES (v0.3 Status enum mirror)", () => {
  it("matches the Rust Status enum kebab-case variants exactly", () => {
    // Pair-locked with src-tauri/src/frontmatter.rs::tests::status_variants_serialize_to_expected_kebab_strings
    // If you change either list, update both.
    const expected: readonly Status[] = [
      "draft",
      "in-revision",
      "revised",
      "final",
      "stuck",
      "cut",
    ] as const;
    expect(STATUS_VALUES).toEqual(expected);
  });

  it("has exactly 6 variants", () => {
    expect(STATUS_VALUES.length).toBe(6);
  });
});
