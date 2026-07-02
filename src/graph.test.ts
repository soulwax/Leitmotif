import { describe, it, expect } from "vitest";
import { buildStoryGraph, type StoryGraphJson } from "./graph";

describe("buildStoryGraph", () => {
  it("maps a resolved cross-scene edge", () => {
    const json: StoryGraphJson = {
      nodes: [
        { scene: "a", file: "a.toml", sequences: ["intro", "depart"], entry_trigger: "after 1s" },
        { scene: "b", file: "b.toml", sequences: ["arrive"], entry_trigger: "chained" },
      ],
      edges: [
        { from_scene: "a", from_seq: "depart", to_scene: "b", to_seq: "arrive", status: "resolved" },
      ],
    };
    const g = buildStoryGraph(json);
    expect(g.nodes.map((n) => n.scene)).toEqual(["a", "b"]);
    expect(g.nodes[0].entryTrigger).toBe("after 1s");
    expect(g.edges).toHaveLength(1);
    const e = g.edges[0];
    expect(e.broken).toBe(false);
    expect(e.toScene).toBe("b");
    expect(e.toSeq).toBe("arrive");
    expect(e.toRef).toBeNull();
  });

  it("marks a dangling edge broken with the unresolved ref", () => {
    const json: StoryGraphJson = {
      nodes: [{ scene: "a", file: "a.toml", sequences: ["end"], entry_trigger: "chained" }],
      edges: [{ from_scene: "a", from_seq: "end", to_ref: "ghost", status: "dangling" }],
    };
    const g = buildStoryGraph(json);
    expect(g.edges[0].broken).toBe(true);
    expect(g.edges[0].toScene).toBeNull();
    expect(g.edges[0].toRef).toBe("ghost");
    expect(g.edges[0].status).toBe("dangling");
  });

  it("marks an ambiguous edge broken", () => {
    const json: StoryGraphJson = {
      nodes: [{ scene: "a", file: "a.toml", sequences: ["end"], entry_trigger: "chained" }],
      edges: [{ from_scene: "a", from_seq: "end", to_ref: "start", status: "ambiguous" }],
    };
    const g = buildStoryGraph(json);
    expect(g.edges[0].broken).toBe(true);
    expect(g.edges[0].status).toBe("ambiguous");
    expect(g.edges[0].toRef).toBe("start");
  });

  it("keeps a node with no outgoing chains (an edgeless node)", () => {
    const json: StoryGraphJson = {
      nodes: [{ scene: "lonely", file: "lonely.toml", sequences: ["x"], entry_trigger: "always" }],
      edges: [],
    };
    const g = buildStoryGraph(json);
    expect(g.nodes).toHaveLength(1);
    expect(g.edges).toHaveLength(0);
  });

  it("returns an empty graph for null or a malformed object", () => {
    expect(buildStoryGraph(null)).toEqual({ nodes: [], edges: [] });
    // missing arrays -> empty, not a throw
    expect(buildStoryGraph({} as unknown as StoryGraphJson)).toEqual({ nodes: [], edges: [] });
  });
});
