// The in-memory scene document — Leitmotif's single source of truth while editing.
//
// It mirrors the game's `ChoreographyDef` (see choreography.schema.json): a scene
// is a set of named sequences, each a list of ordered steps, each a list of
// parallel beats, plus optional gesture overrides. A1 only needs to load, list,
// mark dirty, and save; later milestones edit steps/beats through this model so
// there is one place that owns document state and undo.

/** A single beat — `do` plus whatever fields that verb uses. Kept loose here
 * because the schema is the authority on which fields a verb needs; the beat
 * inspector (A2) reads the schema to know. */
export interface Beat {
  actor?: string;
  do: string;
  [field: string]: unknown;
}

export interface Step {
  duration?: number;
  wait_for?: { kind: string; flag?: string };
  timeout?: number;
  beat?: Beat[];
}

export interface Sequence {
  id: string;
  trigger?: { kind: string; [k: string]: unknown };
  requires_flag?: string | null;
  once?: boolean;
  step?: Step[];
  note?: string;
}

export interface ChoreographyScene {
  schema?: number;
  sequence?: Sequence[];
  gestures?: Record<string, unknown>;
}

/** Owns the loaded scene, its file path, and whether it has unsaved edits. */
export class SceneDoc {
  private data: ChoreographyScene;
  path: string | null;
  private clean: string; // serialized snapshot at last load/save, for dirty check

  private constructor(data: ChoreographyScene, path: string | null) {
    this.data = data;
    this.path = path;
    this.clean = JSON.stringify(data);
  }

  /** An empty scene (New). */
  static empty(): SceneDoc {
    return new SceneDoc({ schema: 1, sequence: [] }, null);
  }

  /** Parse a scene from the JSON string the bridge returns. */
  static fromJson(json: string, path: string | null): SceneDoc {
    const data = JSON.parse(json) as ChoreographyScene;
    if (!Array.isArray(data.sequence)) data.sequence = [];
    return new SceneDoc(data, path);
  }

  /** The scene as a JSON string (what the bridge saves). */
  toJson(): string {
    return JSON.stringify(this.data, null, 2);
  }

  sequences(): Sequence[] {
    return this.data.sequence ?? [];
  }

  sequence(id: string): Sequence | undefined {
    return this.sequences().find((s) => s.id === id);
  }

  /** True if edited since the last load/save. */
  isDirty(): boolean {
    return JSON.stringify(this.data) !== this.clean;
  }

  /** Call after a successful save so the dirty flag resets. */
  markSaved(path: string): void {
    this.path = path;
    this.clean = JSON.stringify(this.data);
  }

  /** Mutate the scene through a callback, keeping the model the one owner of state.
   * (A3+ will route step/beat edits through here so undo has a single seam.) */
  edit(mut: (data: ChoreographyScene) => void): void {
    mut(this.data);
  }

  /** A short human summary of a sequence for the list. */
  static summarize(seq: Sequence): string {
    const steps = seq.step?.length ?? 0;
    const beats = (seq.step ?? []).reduce((n, s) => n + (s.beat?.length ?? 0), 0);
    const trig = seq.trigger?.kind ?? "always";
    return `${steps} step${steps === 1 ? "" : "s"}, ${beats} beat${beats === 1 ? "" : "s"} · ${trig}`;
  }
}
