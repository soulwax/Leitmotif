// The story-level suggestion engine — Leitmotif's "director's assistant" for the whole
// storyline (not a single scene). SEPARATE from the beat-scoped 2A engine (suggest.ts):
// it reads the whole StoryGraph and proposes chain tuples the writer accepts via
// Project.chainScenes. It writes nothing. Pure + headless; providers that throw
// contribute nothing (graceful degradation is structural). Tier-1 only today; the
// provider seam is reserved for a future LLM story-suggester.

import type { StoryGraph, StoryNode } from "./graph";

export interface StorySuggestContext {
  graph: StoryGraph;
  sceneIds: string[];
}

/** A proposed cross-scene chain (the pieces Project.chainScenes needs). NOT an
 *  apply(doc) — accepting is a Project-level async write, done by the caller. */
export interface StorySuggestion {
  id: string;
  label: string;
  detail?: string;
  confidence: number; // 0..1
  fromScene: string;
  fromSeq: string;
  toScene: string;
  toSeq: string;
}

export interface StorySuggestionProvider {
  name: string;
  suggest(ctx: StorySuggestContext): StorySuggestion[];
}

const providers: StorySuggestionProvider[] = [];
export function registerStoryProvider(p: StorySuggestionProvider): void {
  providers.push(p);
}
/** Test-only: clear the registry between cases. */
export function _resetStoryProviders(): void {
  providers.length = 0;
}

/** Fan out to every provider (each isolated by try/catch → []), merge, dedupe by id
 *  (first wins), rank by confidence desc then id asc for a stable order. Never throws. */
export function storySuggestions(ctx: StorySuggestContext): StorySuggestion[] {
  const merged: StorySuggestion[] = [];
  const seen = new Set<string>();
  for (const p of providers) {
    let out: StorySuggestion[] = [];
    try {
      out = p.suggest(ctx) ?? [];
    } catch {
      out = [];
    }
    for (const s of out) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        merged.push(s);
      }
    }
  }
  merged.sort((a, b) => b.confidence - a.confidence || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return merged;
}

const MAX_GHOSTS = 3;

/** Tier-1 rule: a dead-end scene (no outgoing resolved chain) paired with a root scene
 *  (no incoming resolved chain) is a "your story has a gap here" nudge. Both endpoints
 *  are real graph scenes, so the proposed chain always resolves (valid-by-construction). */
const danglingEndToRoot: StorySuggestionProvider = {
  name: "dangling-end-to-root",
  suggest(ctx) {
    const nodes: StoryNode[] = Array.isArray(ctx.graph?.nodes) ? ctx.graph.nodes : [];
    const edges = Array.isArray(ctx.graph?.edges) ? ctx.graph.edges : [];
    if (nodes.length === 0) return [];
    const resolved = edges.filter((e) => !e.broken && e.toScene);
    const hasOut = new Set(resolved.map((e) => e.fromScene));
    const hasIn = new Set(resolved.map((e) => e.toScene as string));
    const deadEnds = nodes.filter((n) => !hasOut.has(n.scene));
    const roots = nodes.filter((n) => !hasIn.has(n.scene));
    if (deadEnds.length === 0 || roots.length === 0) return [];
    const confidence = 1 / (deadEnds.length * roots.length);
    const out: StorySuggestion[] = [];
    for (const d of deadEnds) {
      for (const r of roots) {
        if (d.scene === r.scene) continue; // no self-loop (within-scene chain → editor)
        // A dead-end has no outgoing chain by definition, so it can't already be chained to r.
        const fromSeq = d.sequences[d.sequences.length - 1] ?? "";
        const toSeq = r.sequences[0] ?? ""; // entry heuristic degrades to first at graph level
        if (!fromSeq || !toSeq) continue; // both scenes need a sequence to chain
        out.push({
          id: `ghost:chain:${d.scene}->${r.scene}`,
          label: `Chain ${d.scene} → ${r.scene}?`,
          detail: `${d.scene} has no follow-up`,
          confidence,
          fromScene: d.scene,
          fromSeq,
          toScene: r.scene,
          toSeq,
        });
      }
    }
    // Rank then cap here so a messy graph doesn't flood the canvas.
    out.sort((a, b) => b.confidence - a.confidence || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return out.slice(0, MAX_GHOSTS);
  },
};

registerStoryProvider(danglingEndToRoot);
