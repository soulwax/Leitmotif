// The suggestion engine — Leitmotif's Tier-1 "director's assistant".
//
// Pure and headless: it fans a SuggestContext out to registered providers,
// merges + dedupes + ranks their Suggestions, and returns them. Providers that
// throw or exceed the timeout contribute nothing — so the UI always has Tier-1
// suggestions (graceful degradation is structural). This slice registers only
// the deterministic RuleProvider; the LlmProvider is a future drop-in behind the
// same SuggestionProvider seam.
import type { Beat, ChoreographyScene, SceneDoc } from "./scene";
import type { PreviewFrame } from "./preview";

export interface Suggestion {
  id: string;
  kind: "beat" | "fix" | "moment" | "target" | "chain";
  label: string;
  detail?: string;
  confidence: number; // 0..1
  apply: (doc: SceneDoc) => void;
}

export interface Finding {
  level: "error" | "warning";
  message: string;
}

export interface SuggestContext {
  scene: ChoreographyScene;
  seqId: string | null;
  stepIndex: number | null;
  selectedBeat: Beat | null;
  actors: string[];
  sfx: string[];
  frame: PreviewFrame | null;
  findings: Finding[];
}

export interface SuggestionProvider {
  name: string;
  suggest(ctx: SuggestContext): Promise<Suggestion[]>;
}

const providers: SuggestionProvider[] = [];
export function registerProvider(p: SuggestionProvider): void {
  providers.push(p);
}
/** Test-only: clear the registry between cases. */
export function _resetProviders(): void {
  providers.length = 0;
}

const DEFAULT_TIMEOUT_MS = 250;

/** Run every provider (bounded by `timeoutMs`), merge, dedupe by id (first
 * wins), rank by confidence desc. Never throws. */
export async function suggestions(
  ctx: SuggestContext,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Suggestion[]> {
  const results = await Promise.all(
    providers.map((p) => withTimeout(p.suggest(ctx), timeoutMs).catch(() => [])),
  );
  const seen = new Set<string>();
  const merged: Suggestion[] = [];
  for (const list of results) {
    for (const sug of list) {
      if (seen.has(sug.id)) continue;
      seen.add(sug.id);
      merged.push(sug);
    }
  }
  merged.sort((a, b) => b.confidence - a.confidence);
  return merged;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("suggest timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); },
           (e) => { clearTimeout(t); reject(e); });
  });
}
