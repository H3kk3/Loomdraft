import { describe, it, expect } from "vitest";
import { findNodeByTitle } from "./manifest";
import type { ProjectManifest } from "../types";

function makeManifest(
  nodes: Record<string, { title?: string; children?: string[] }>,
): ProjectManifest {
  const built: ProjectManifest = {
    version: 1,
    root: "root",
    nodes: {},
  };
  for (const [id, n] of Object.entries(nodes)) {
    built.nodes[id] = {
      title: n.title,
      children: n.children ?? [],
    };
  }
  return built;
}

describe("findNodeByTitle", () => {
  const manifest = makeManifest({
    root: { title: "My Novel", children: ["ch1", "ch2"] },
    ch1: { title: "The Beginning" },
    ch2: { title: "The End" },
  });

  it("finds a node by exact title (case-insensitive)", () => {
    expect(findNodeByTitle(manifest, "The Beginning")).toBe("ch1");
  });

  it("finds a node by lowercase title", () => {
    expect(findNodeByTitle(manifest, "the end")).toBe("ch2");
  });

  it("finds a node by uppercase title", () => {
    expect(findNodeByTitle(manifest, "MY NOVEL")).toBe("root");
  });

  it("returns null when no match", () => {
    expect(findNodeByTitle(manifest, "nonexistent")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(findNodeByTitle(manifest, "")).toBeNull();
  });

  it("handles manifest with no titled nodes", () => {
    const empty = makeManifest({ root: { children: ["a"] }, a: {} });
    expect(findNodeByTitle(empty, "anything")).toBeNull();
  });
});
