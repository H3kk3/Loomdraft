import { describe, it, expect } from "vitest";
import { parseHeadings } from "./headings";

describe("parseHeadings", () => {
  it("returns empty array for empty string", () => {
    expect(parseHeadings("")).toEqual([]);
  });

  it("returns empty array for text with no headings", () => {
    expect(parseHeadings("Some plain text\nAnother line")).toEqual([]);
  });

  it("parses a single h1 heading", () => {
    const result = parseHeadings("# Title");
    expect(result).toEqual([{ level: 1, title: "Title", offset: 0, line: 1 }]);
  });

  it("parses h1, h2, and h3 headings", () => {
    const input = "# Part One\n## Chapter 1\n### Scene A";
    const result = parseHeadings(input);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ level: 1, title: "Part One", offset: 0, line: 1 });
    // "# Part One\n" = 11 chars → offset 11 for line 2
    expect(result[1]).toEqual({ level: 2, title: "Chapter 1", offset: 11, line: 2 });
    // "# Part One\n## Chapter 1\n" = 24 chars → offset 24 for line 3
    expect(result[2]).toEqual({ level: 3, title: "Scene A", offset: 24, line: 3 });
  });

  it("ignores h4+ headings", () => {
    const result = parseHeadings("#### Too deep\n##### Even deeper");
    expect(result).toEqual([]);
  });

  it("handles headings mixed with body text", () => {
    const input = "Some intro text\n\n## Chapter 1\n\nBody of chapter\n\n## Chapter 2";
    const result = parseHeadings(input);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Chapter 1");
    expect(result[0].line).toBe(3);
    expect(result[1].title).toBe("Chapter 2");
    expect(result[1].line).toBe(7);
  });

  it("strips trailing whitespace from heading titles", () => {
    const result = parseHeadings("# Title with spaces   ");
    expect(result[0].title).toBe("Title with spaces");
  });

  it("does not match headings without space after #", () => {
    const result = parseHeadings("#NoSpace\n##AlsoNo");
    expect(result).toEqual([]);
  });

  it("tracks offsets correctly across lines", () => {
    const input = "line1\nline2\n# Heading";
    const result = parseHeadings(input);
    // "line1\n" = 6 chars, "line2\n" = 6 chars → offset = 12
    expect(result[0].offset).toBe(12);
    expect(result[0].line).toBe(3);
  });
});
