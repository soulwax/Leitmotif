import { describe, it, expect } from "vitest";
import { storySuggestions } from "./story_suggest";
import "./story_suggest"; // ensures the rule provider self-registers on import
import type { StoryGraph, StoryNode, StoryEdge } from "./graph";

function node(scene: string, seqs: string[]): StoryNode {
  return { scene, file: `${scene}.toml`, sequences: seqs, entryTrigger: "always" };
}
function edge(from: string, to: string): StoryEdge {
  return {
    fromScene: from, fromSeq: "out", toScene: to, toSeq: "in",
    toRef: null, broken: false, status: "resolved",
  };
}

describe("dangling-end -> root ghost rule", () => {
  it("proposes exactly one ghost for one dead-end + one root", () => {
    // a → b (resolved). 'a' is a root (nothing into it); 'b' is a dead-end (nothing out).
    const graph: StoryGraph = {
      nodes: [node("a", ["s1", "s2"]), node("b", ["t1", "t2"])],
      edges: [edge("a", "b")],
    };
    const out = storySuggestions({ graph, sceneIds: ["a", "b"] });
    // 'b' is the only dead-end; 'a' is the only root. Ghost: b -> a.
    expect(out).toHaveLength(1);
    const g = out[0];
    expect(g.fromScene).toBe("b");
    expect(g.fromSeq).toBe("t2"); // b's LAST sequence
    expect(g.toScene).toBe("a");
    expect(g.toSeq).toBe("s1"); // a's FIRST (entry) sequence
    expect(g.id).toBe("ghost:chain:b->a");
    expect(g.confidence).toBeCloseTo(1); // 1 dead-end * 1 root
  });

  it("returns no ghosts for a fully-chained graph (every node has in and out)", () => {
    // a → b → a : both have an incoming and an outgoing resolved edge.
    const graph: StoryGraph = {
      nodes: [node("a", ["s"]), node("b", ["t"])],
      edges: [edge("a", "b"), edge("b", "a")],
    };
    expect(storySuggestions({ graph, sceneIds: ["a", "b"] })).toEqual([]);
  });

  it("caps at 3 ghosts and ranks by confidence then id", () => {
    // 4 isolated nodes (a,b,c,d), no edges: each is both a dead-end AND a root.
    // deadEnds=4, roots=4 → 16 pairs, minus 4 self-pairs (D!==R) = 12 candidates,
    // capped to 3. (Same confidence for all, so the cap keeps the 3 lowest ids.)
    const graph: StoryGraph = {
      nodes: [node("a", ["s"]), node("b", ["s"]), node("c", ["s"]), node("d", ["s"])],
      edges: [],
    };
    const out = storySuggestions({ graph, sceneIds: ["a", "b", "c", "d"] });
    expect(out).toHaveLength(3); // capped
    // deterministic order: equal confidence → sorted by id ascending
    const ids = out.map((g) => g.id);
    expect(ids).toEqual([...ids].sort());
  });

  it("returns no ghosts and does not throw on an empty or malformed graph", () => {
    expect(storySuggestions({ graph: { nodes: [], edges: [] }, sceneIds: [] })).toEqual([]);
    // malformed: nodes/edges missing (cast through unknown) → guarded, empty, no throw
    expect(
      storySuggestions({ graph: {} as unknown as StoryGraph, sceneIds: [] }),
    ).toEqual([]);
  });
});
