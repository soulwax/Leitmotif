// Pure view-model builder for the story graph. Input is the JSON emitted by
// `choreo graph --json` (via bridge.sceneGraph); output is the shape the read-only
// canvas draws. No I/O, no game import — trivially unit-testable and the single place
// the raw JSON shape is interpreted.

export interface StoryGraphJson {
  nodes: { scene: string; file: string; sequences: string[]; entry_trigger: string }[];
  edges: (
    | { from_scene: string; from_seq: string; to_scene: string; to_seq: string; status: "resolved" }
    | { from_scene: string; from_seq: string; to_ref: string; status: "ambiguous" | "dangling" }
  )[];
}

export interface StoryNode {
  scene: string;
  file: string;
  sequences: string[];
  entryTrigger: string;
}

export interface StoryEdge {
  fromScene: string;
  fromSeq: string;
  toScene: string | null;
  toSeq: string | null;
  toRef: string | null;
  broken: boolean;
  status: "resolved" | "ambiguous" | "dangling";
}

export interface StoryGraph {
  nodes: StoryNode[];
  edges: StoryEdge[];
}

/** Turn raw `choreo graph` JSON into draw-ready view models. Never throws: a null or
 *  malformed object yields an empty graph (graceful degradation). */
export function buildStoryGraph(json: StoryGraphJson | null): StoryGraph {
  if (!json || !Array.isArray(json.nodes) || !Array.isArray(json.edges)) {
    return { nodes: [], edges: [] };
  }
  const nodes: StoryNode[] = json.nodes.map((n) => ({
    scene: n.scene,
    file: n.file,
    sequences: Array.isArray(n.sequences) ? n.sequences : [],
    entryTrigger: typeof n.entry_trigger === "string" ? n.entry_trigger : "",
  }));
  const edges: StoryEdge[] = json.edges.map((e) => {
    if (e.status === "resolved") {
      return {
        fromScene: e.from_scene,
        fromSeq: e.from_seq,
        toScene: e.to_scene,
        toSeq: e.to_seq,
        toRef: null,
        broken: false,
        status: "resolved",
      };
    }
    return {
      fromScene: e.from_scene,
      fromSeq: e.from_seq,
      toScene: null,
      toSeq: null,
      toRef: e.to_ref,
      broken: true,
      status: e.status,
    };
  });
  return { nodes, edges };
}
