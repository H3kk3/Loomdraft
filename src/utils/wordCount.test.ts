import { describe, it, expect } from "vitest";
import { countWords, countChars } from "./wordCount";

describe("countWords", () => {
  it("returns 0 for empty string", () => {
    expect(countWords("")).toBe(0);
  });

  it("returns 0 for whitespace-only string", () => {
    expect(countWords("   \n\t  ")).toBe(0);
  });

  it("counts a single word", () => {
    expect(countWords("hello")).toBe(1);
  });

  it("counts multiple words separated by spaces", () => {
    expect(countWords("the quick brown fox")).toBe(4);
  });

  it("handles multiple whitespace between words", () => {
    expect(countWords("one   two    three")).toBe(3);
  });

  it("handles leading and trailing whitespace", () => {
    expect(countWords("  hello world  ")).toBe(2);
  });

  it("handles tabs and newlines as separators", () => {
    expect(countWords("word1\tword2\nword3")).toBe(3);
  });
});

describe("countChars", () => {
  it("returns 0 for empty string", () => {
    expect(countChars("")).toBe(0);
  });

  it("counts characters including whitespace", () => {
    expect(countChars("hello world")).toBe(11);
  });

  it("counts unicode characters", () => {
    expect(countChars("abc")).toBe(3);
  });
});
