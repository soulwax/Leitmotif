// Pure merge of persisted node positions (the .leitmotif/layout.json sidecar) over
// 2B-1's deterministic auto-layout. Saved positions win per-scene; scenes without a
// saved position keep their auto slot. No I/O, no throw — malformed input degrades to
// null (→ pure auto-layout). The single place the sidecar shape is interpreted.

import type { StoryLayout } from "./story";

export interface SavedLayout {
  version: number;
  positions: Record<string, { x: number; y: number }>;
}

const NODE_W = 168; // mirror story.ts node size for bounds growth
const NODE_H = 92;
const MARGIN = 48;

/** Parse the sidecar JSON. Returns null (not a throw) for null/malformed/incomplete
 *  input, so a corrupt sidecar simply falls back to the auto-layout. */
export function parseSavedLayout(json: string | null): SavedLayout | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as unknown;
    if (
      typeof v === "object" &&
      v !== null &&
      typeof (v as SavedLayout).version === "number" &&
      typeof (v as SavedLayout).positions === "object" &&
      (v as SavedLayout).positions !== null
    ) {
      return v as SavedLayout;
    }
    return null;
  } catch {
    return null;
  }
}

/** Overlay saved positions on the auto-layout. Only ids present in `auto` are moved
 *  (a saved id no longer in the graph is ignored). Width/height grow to keep every
 *  positioned node reachable by scroll. Never throws. */
export function mergeLayout(auto: StoryLayout, saved: SavedLayout | null): StoryLayout {
  const pos = new Map(auto.pos);
  let width = auto.width;
  let height = auto.height;
  if (saved) {
    for (const [scene, p] of Object.entries(saved.positions)) {
      if (!pos.has(scene)) continue; // ignore stale saved ids
      if (typeof p?.x !== "number" || typeof p?.y !== "number") continue;
      pos.set(scene, { x: p.x, y: p.y });
      width = Math.max(width, p.x + NODE_W + MARGIN);
      height = Math.max(height, p.y + NODE_H + MARGIN);
    }
  }
  return { pos, width, height };
}
