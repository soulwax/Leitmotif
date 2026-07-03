// Read-only story canvas: draws the StoryGraph (scenes as cards, cross-scene chains as
// arrows) and hit-tests nodes for click/hover. Deterministic layered layout — no
// physics, no drag (2B-2). Uses the editor's dark/foggy tone for visual consistency.

import type { StoryGraph, StoryNode } from "./graph";

const NODE_W = 168;
const NODE_H = 92;
const COL_GAP = 96;
const ROW_GAP = 40;
const MARGIN = 48;

export interface StoryLayout {
  pos: Map<string, { x: number; y: number }>; // scene -> top-left
  width: number;
  height: number;
}

/** Layered layout: a node's column = its longest incoming resolved-chain depth (roots at
 *  column 0). Rows pack nodes within a column in stable scene order. Broken edges do not
 *  affect depth. Deterministic (sorted) so the graph doesn't jump between renders. */
export function layoutGraph(graph: StoryGraph): StoryLayout {
  const scenes = graph.nodes.map((n) => n.scene).sort();
  const incoming = new Map<string, string[]>(); // scene -> resolved from-scenes
  for (const s of scenes) incoming.set(s, []);
  for (const e of graph.edges) {
    if (!e.broken && e.toScene && incoming.has(e.toScene)) {
      incoming.get(e.toScene)!.push(e.fromScene);
    }
  }
  // depth via memoized longest-path from roots; guard against cycles with a visited set.
  const depthMemo = new Map<string, number>();
  const depthOf = (s: string, stack: Set<string>): number => {
    if (depthMemo.has(s)) return depthMemo.get(s)!;
    if (stack.has(s)) return 0; // cycle guard
    stack.add(s);
    const ins = incoming.get(s) ?? [];
    const d = ins.length === 0 ? 0 : 1 + Math.max(...ins.map((p) => depthOf(p, stack)));
    stack.delete(s);
    depthMemo.set(s, d);
    return d;
  };
  const cols = new Map<number, string[]>();
  for (const s of scenes) {
    const d = depthOf(s, new Set());
    if (!cols.has(d)) cols.set(d, []);
    cols.get(d)!.push(s);
  }
  const pos = new Map<string, { x: number; y: number }>();
  let maxRow = 0;
  const maxCol = Math.max(0, ...[...cols.keys()]);
  for (const [d, list] of [...cols.entries()].sort((a, b) => a[0] - b[0])) {
    list.forEach((s, row) => {
      pos.set(s, {
        x: MARGIN + d * (NODE_W + COL_GAP),
        y: MARGIN + row * (NODE_H + ROW_GAP),
      });
      maxRow = Math.max(maxRow, row);
    });
  }
  return {
    pos,
    width: MARGIN * 2 + (maxCol + 1) * NODE_W + maxCol * COL_GAP,
    height: MARGIN * 2 + (maxRow + 1) * NODE_H + maxRow * ROW_GAP,
  };
}

/** The scene whose node card contains (x,y) in canvas coords, or null. */
export function nodeAt(layout: StoryLayout, x: number, y: number): string | null {
  for (const [scene, p] of layout.pos) {
    if (x >= p.x && x <= p.x + NODE_W && y >= p.y && y <= p.y + NODE_H) return scene;
  }
  return null;
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  node: StoryNode,
  p: { x: number; y: number },
  hovered: boolean,
): void {
  ctx.save();
  ctx.fillStyle = hovered ? "#241f17" : "#1a1712";
  ctx.strokeStyle = hovered ? "#d9a441" : "#3a332688"; // gold when hovered
  ctx.lineWidth = hovered ? 2 : 1;
  ctx.beginPath();
  ctx.roundRect(p.x, p.y, NODE_W, NODE_H, 8);
  ctx.fill();
  ctx.stroke();
  // scene id
  ctx.fillStyle = "#f0e6d2";
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText(node.scene, p.x + 12, p.y + 24);
  // cheap static "thumbnail": a few glowing dots (no per-scene preview run)
  const dots = Math.min(node.sequences.length, 5);
  for (let i = 0; i < dots; i++) {
    ctx.beginPath();
    ctx.fillStyle = "#7fd6c2aa";
    ctx.arc(p.x + 16 + i * 14, p.y + 48, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // trigger pill: what starts this scene (its entry-sequence trigger label)
  const pill = node.entryTrigger || "—";
  ctx.font = "11px system-ui, sans-serif";
  const pw = ctx.measureText(pill).width + 14;
  ctx.fillStyle = "#2a2418";
  ctx.strokeStyle = "#4a4230";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(p.x + 12, p.y + NODE_H - 24, pw, 16, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#c9bb98";
  ctx.fillText(pill, p.x + 19, p.y + NODE_H - 12);
  ctx.restore();
}

function drawEdge(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  broken: boolean,
): void {
  ctx.save();
  ctx.strokeStyle = broken ? "#c0564e" : "#d9a441";
  ctx.lineWidth = 2;
  if (broken) ctx.setLineDash([6, 5]);
  const sx = from.x + NODE_W;
  const sy = from.y + NODE_H / 2;
  const ex = to.x;
  const ey = to.y + NODE_H / 2;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.bezierCurveTo(sx + 40, sy, ex - 40, ey, ex, ey);
  ctx.stroke();
  // arrowhead
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - 8, ey - 4);
  ctx.lineTo(ex - 8, ey + 4);
  ctx.closePath();
  ctx.fillStyle = broken ? "#c0564e" : "#d9a441";
  ctx.fill();
  ctx.restore();
}

/** Draw the whole graph. `hoveredScene` highlights a node + its edges. Returns the
 *  layout so the caller can hit-test with the same positions. When `presetLayout` is
 *  passed (e.g. the sidecar-merged or in-progress-drag layout), it is drawn instead of
 *  recomputing one — so the drawn layout and the caller's hit-test layout stay the
 *  same object (2B-1 callers that omit it are unaffected). */
export function renderStoryCanvas(
  canvas: HTMLCanvasElement,
  graph: StoryGraph,
  hoveredScene: string | null,
  presetLayout?: StoryLayout,
): StoryLayout {
  const layout = presetLayout ?? layoutGraph(graph);
  const ctx = canvas.getContext("2d");
  if (!ctx) return layout;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // edges under nodes
  for (const e of graph.edges) {
    const from = layout.pos.get(e.fromScene);
    const to = e.toScene ? layout.pos.get(e.toScene) : undefined;
    if (from && to) drawEdge(ctx, from, to, e.broken);
    // broken edges with no resolved target are not drawn as arcs (no endpoint);
    // they surface on the from-node as a warning in a later slice.
  }
  for (const node of graph.nodes) {
    const p = layout.pos.get(node.scene);
    if (p) drawNode(ctx, node, p, node.scene === hoveredScene);
  }
  return layout;
}
