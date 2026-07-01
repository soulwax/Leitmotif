// Asset id catalog — so the writer picks ids instead of typing them.
//
// Actor + sfx ids come from the game data via `choreo assets` (loaded once).
// Sequence ids come from the open scene (supplied per-call, since they change as
// the writer edits). The form consults this to turn id fields into dropdowns.

import { assets as fetchAssets } from "./bridge";

export interface ActorId {
  id: string;
  display: string;
  role: string;
}

interface AssetData {
  actors: ActorId[];
  sfx: { id: string; category: string }[];
}

let cache: AssetData | null = null;
let loaded = false;

/** Load actor + sfx ids once. Safe to call repeatedly; no-op after the first. */
export async function loadAssets(): Promise<void> {
  if (loaded) return;
  loaded = true;
  const r = await fetchAssets();
  if (!r.ok) return; // degrade gracefully: pickers fall back to free text
  try {
    cache = JSON.parse(r.output) as AssetData;
  } catch {
    cache = null;
  }
}

/** Actor ids for the actor/target pickers (empty if not loaded → free text). */
export function actorIds(): string[] {
  return cache ? cache.actors.map((a) => a.id) : [];
}

/** Sfx ids for the `id` field of play_sfx (empty if not loaded). */
export function sfxIds(): string[] {
  return cache ? cache.sfx.map((s) => s.id) : [];
}

/** Whether the asset catalog is available (drives free-text fallback). */
export function assetsReady(): boolean {
  return cache !== null;
}
