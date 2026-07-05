import { describe, it, expect } from "vitest";
import { layoutGraph, nodeAt, handleAt, ghostBadgeAt } from "./story";
import type { StoryLayout } from "./story";
import type { StoryGraph, StoryNode, StoryEdge } from "./graph";
import type { StorySuggestion } from "./story_suggest";

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

describe("handleAt", () => {
  // The rim handle is a small circle centered on the node's right-middle edge.
  const NODE_W = 168;
  const NODE_H = 92;
  function layoutWith(scene: string, x: number, y: number): StoryLayout {
    return { pos: new Map([[scene, { x, y }]]), width: 400, height: 200 };
  }

  it("returns the scene when the point is on its rim handle (right-middle edge)", () => {
    const layout = layoutWith("a", 40, 40);
    // handle center ≈ (x + NODE_W, y + NODE_H/2)
    expect(handleAt(layout, 40 + NODE_W, 40 + NODE_H / 2)).toBe("a");
  });

  it("returns null for a point on the node body (so body-drag still moves it)", () => {
    const layout = layoutWith("a", 40, 40);
    expect(handleAt(layout, 40 + NODE_W / 2, 40 + NODE_H / 2)).toBeNull();
  });

  it("returns null for a point well outside any node", () => {
    const layout = layoutWith("a", 40, 40);
    expect(handleAt(layout, 1000, 1000)).toBeNull();
  });
});

describe("ghostBadgeAt", () => {
  const NODE_W = 168;
  const NODE_H = 92;
  function ghost(from: string, to: string): StorySuggestion {
    return { id: `ghost:chain:${from}->${to}`, label: "", confidence: 1,
      fromScene: from, fromSeq: "x", toScene: to, toSeq: "y" };
  }
  // Two nodes: 'a' at (0,0), 'b' at (400,0). The ghost edge runs from a's rim
  // (a.x+NODE_W, a.y+NODE_H/2) to b's left-middle (b.x, b.y+NODE_H/2); the badge sits at
  // the midpoint of that segment.
  const layout: StoryLayout = {
    pos: new Map([["a", { x: 0, y: 0 }], ["b", { x: 400, y: 0 }]]),
    width: 600, height: 200,
  };
  const ghosts = [ghost("a", "b")];

  it("returns the ghost when the point is on its midpoint badge", () => {
    const midX = (0 + NODE_W + 400) / 2; // (a.rim.x + b.left.x) / 2
    const midY = NODE_H / 2;
    expect(ghostBadgeAt(layout, ghosts, midX, midY)?.id).toBe("ghost:chain:a->b");
  });

  it("returns null for a point away from any badge", () => {
    expect(ghostBadgeAt(layout, ghosts, 5, 5)).toBeNull();
  });

  it("returns null when there are no ghosts", () => {
    expect(ghostBadgeAt(layout, [], 200, NODE_H / 2)).toBeNull();
  });
});
