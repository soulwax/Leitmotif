import { describe, it, expect } from "vitest";
import { layoutGraph, nodeAt } from "./story";
import type { StoryGraph, StoryNode, StoryEdge } from "./graph";

// Layout constants mirrored from story.ts (kept in sync with the module).
const NODE_W = 168;
const NODE_H = 92;
const COL_GAP = 96;
const MARGIN = 48;

function node(scene: string): StoryNode {
  return { scene, file: `${scene}.toml`, sequences: ["s"], entryTrigger: "always" };
}
function resolvedEdge(from: string, to: string): StoryEdge {
  return {
    fromScene: from,
    fromSeq: "out",
    toScene: to,
    toSeq: "in",
    toRef: null,
    broken: false,
    status: "resolved",
  };
}
function brokenEdge(from: string, ref: string): StoryEdge {
  return {
    fromScene: from,
    fromSeq: "out",
    toScene: null,
    toSeq: null,
    toRef: ref,
    broken: true,
    status: "dangling",
  };
}

describe("layoutGraph", () => {
  it("places a root at column 0 and a chained scene at column 1", () => {
    const g: StoryGraph = { nodes: [node("a"), node("b")], edges: [resolvedEdge("a", "b")] };
    const layout = layoutGraph(g);
    const a = layout.pos.get("a")!;
    const b = layout.pos.get("b")!;
    expect(a.x).toBe(MARGIN); // column 0
    expect(b.x).toBe(MARGIN + (NODE_W + COL_GAP)); // column 1 (one chain deep)
  });

  it("does not let a broken edge affect column depth", () => {
    // 'b' only has an incoming BROKEN edge → it stays a root at column 0.
    const g: StoryGraph = { nodes: [node("a"), node("b")], edges: [brokenEdge("a", "b")] };
    const layout = layoutGraph(g);
    expect(layout.pos.get("a")!.x).toBe(MARGIN);
    expect(layout.pos.get("b")!.x).toBe(MARGIN); // broken edge ignored → still column 0
  });

  it("terminates on a cyclic chain (a -> b -> a) without hanging", () => {
    const g: StoryGraph = {
      nodes: [node("a"), node("b")],
      edges: [resolvedEdge("a", "b"), resolvedEdge("b", "a")],
    };
    // If the cycle guard were missing this would recurse forever; a returned layout
    // with both scenes positioned proves it terminated.
    const layout = layoutGraph(g);
    expect(layout.pos.has("a")).toBe(true);
    expect(layout.pos.has("b")).toBe(true);
  });

  it("returns a zero-ish layout for an empty graph without throwing", () => {
    const layout = layoutGraph({ nodes: [], edges: [] });
    expect(layout.pos.size).toBe(0);
    expect(layout.width).toBeGreaterThan(0); // margins only, but finite/positive
    expect(layout.height).toBeGreaterThan(0);
  });
});

describe("nodeAt", () => {
  it("hits the scene whose card contains the point, and misses outside", () => {
    const g: StoryGraph = { nodes: [node("a")], edges: [] };
    const layout = layoutGraph(g);
    const p = layout.pos.get("a")!;
    // a point inside the card
    expect(nodeAt(layout, p.x + NODE_W / 2, p.y + NODE_H / 2)).toBe("a");
    // a point clearly outside (to the left of the margin)
    expect(nodeAt(layout, p.x - 10, p.y + NODE_H / 2)).toBeNull();
    // a point below the card
    expect(nodeAt(layout, p.x + NODE_W / 2, p.y + NODE_H + 10)).toBeNull();
  });
});
