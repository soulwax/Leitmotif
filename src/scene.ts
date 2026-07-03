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
  scene?: string;
  sequence?: Sequence[];
  gestures?: Record<string, unknown>;
}

/** Owns the loaded scene, its file path, and whether it has unsaved edits. */
export class SceneDoc {
  private data: ChoreographyScene;
  path: string | null;
  private clean: string; // serialized snapshot at last load/save, for dirty check
  private undoStack: string[] = []; // JSON snapshots before each edit
  private redoStack: string[] = [];
  private static readonly HISTORY_LIMIT = 100;

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
   * All structured edits below funnel through here — so this is also the single
   * place history is recorded. Each edit snapshots the prior state for undo and
   * invalidates the redo stack. */
  edit(mut: (data: ChoreographyScene) => void): void {
    const before = JSON.stringify(this.data);
    mut(this.data);
    // Only record if the edit actually changed something.
    if (JSON.stringify(this.data) !== before) {
      this.undoStack.push(before);
      if (this.undoStack.length > SceneDoc.HISTORY_LIMIT) this.undoStack.shift();
      this.redoStack.length = 0;
    }
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Restore the previous state. Returns true if it undid something. */
  undo(): boolean {
    const prev = this.undoStack.pop();
    if (prev === undefined) return false;
    this.redoStack.push(JSON.stringify(this.data));
    this.data = JSON.parse(prev) as ChoreographyScene;
    return true;
  }

  /** Re-apply the last undone state. Returns true if it redid something. */
  redo(): boolean {
    const next = this.redoStack.pop();
    if (next === undefined) return false;
    this.undoStack.push(JSON.stringify(this.data));
    this.data = JSON.parse(next) as ChoreographyScene;
    return true;
  }

  private steps(seqId: string): Step[] | undefined {
    const seq = this.sequence(seqId);
    if (!seq) return undefined;
    if (!seq.step) seq.step = [];
    return seq.step;
  }

  // ── step operations ─────────────────────────────────────────────────────────

  /** Append a new empty step to a sequence. Returns the new step index. */
  addStep(seqId: string): number {
    let idx = -1;
    this.edit(() => {
      const steps = this.steps(seqId);
      if (!steps) return;
      steps.push({ duration: 1.0, beat: [] });
      idx = steps.length - 1;
    });
    return idx;
  }

  removeStep(seqId: string, si: number): void {
    this.edit(() => {
      const steps = this.steps(seqId);
      if (steps && si >= 0 && si < steps.length) steps.splice(si, 1);
    });
  }

  /** Move a step left/right by `delta` (clamped). */
  moveStep(seqId: string, si: number, delta: number): void {
    this.edit(() => {
      const steps = this.steps(seqId);
      if (!steps) return;
      const to = si + delta;
      if (si < 0 || si >= steps.length || to < 0 || to >= steps.length) return;
      const [s] = steps.splice(si, 1);
      steps.splice(to, 0, s);
    });
  }

  // ── beat operations ─────────────────────────────────────────────────────────

  /** Append a new beat (default `idle` by `echo`) to a step. Returns beat index. */
  addBeat(seqId: string, si: number): number {
    let idx = -1;
    this.edit(() => {
      const step = this.steps(seqId)?.[si];
      if (!step) return;
      if (!step.beat) step.beat = [];
      step.beat.push({ actor: "echo", do: "idle" });
      idx = step.beat.length - 1;
    });
    return idx;
  }

  removeBeat(seqId: string, si: number, bi: number): void {
    this.edit(() => {
      const beats = this.steps(seqId)?.[si]?.beat;
      if (beats && bi >= 0 && bi < beats.length) beats.splice(bi, 1);
    });
  }

  /** Replace a beat's contents (used by the inspector form). */
  replaceBeat(seqId: string, si: number, bi: number, next: Beat): void {
    this.edit(() => {
      const beats = this.steps(seqId)?.[si]?.beat;
      const target = beats?.[bi];
      if (!target) return;
      for (const k of Object.keys(target)) delete target[k];
      Object.assign(target, next);
    });
  }

  /** Move a beat to `(toStep, toIndex)`. Handles same-step reorder and moves
   * across steps (the parallel-lane drag). `toIndex` past the end appends. */
  moveBeat(seqId: string, si: number, bi: number, toStep: number, toIndex: number): void {
    this.edit(() => {
      const steps = this.steps(seqId);
      if (!steps) return;
      const from = steps[si]?.beat;
      const dest = steps[toStep];
      if (!from || !dest) return;
      if (bi < 0 || bi >= from.length) return;
      if (!dest.beat) dest.beat = [];
      const [beat] = from.splice(bi, 1);
      // If moving within the same step and removing shifted the target left.
      let insertAt = toIndex;
      if (si === toStep && bi < toIndex) insertAt -= 1;
      insertAt = Math.max(0, Math.min(insertAt, dest.beat.length));
      dest.beat.splice(insertAt, 0, beat);
    });
  }

  /** If this sequence is chained off another finishing, the parent id (else null).
   * Chaining in the model is a `trigger = { kind: "on_sequence_finished", id }`. */
  static chainedFrom(seq: Sequence): string | null {
    const t = seq.trigger;
    if (t && t.kind === "on_sequence_finished" && typeof t.id === "string") {
      return t.id;
    }
    return null;
  }

  /** Ids of sequences this one starts when it finishes (the forward edges). */
  chains(seqId: string): string[] {
    return this.sequences()
      .filter((s) => SceneDoc.chainedFrom(s) === seqId)
      .map((s) => s.id);
  }

  /** A short human summary of a sequence for the list. */
  static summarize(seq: Sequence): string {
    const steps = seq.step?.length ?? 0;
    const beats = (seq.step ?? []).reduce((n, s) => n + (s.beat?.length ?? 0), 0);
    const trig = seq.trigger?.kind ?? "always";
    return `${steps} step${steps === 1 ? "" : "s"}, ${beats} beat${beats === 1 ? "" : "s"} · ${trig}`;
  }
}
