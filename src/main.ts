// Leitmotif — the editor entry point.
//
// Open/save scenes, list sequences (A1), edit beats via a schema-driven form (A2),
// and arrange steps/beats on a node-graph timeline (A3). Everything flows through
// the SceneDoc model (the one owner of document state) and the bridge (the one
// path to the game's `choreo` CLI).

import {
  exportScene,
  loadScene,
  openSceneDialog,
  saveScene,
  saveSceneDialog,
  validate,
  validateJson,
} from "./bridge";
import { SceneDoc, type Beat, type ChoreographyScene, type Sequence } from "./scene";
import { buildBeatForm } from "./form";
import { buildTriggerForm, type Trigger } from "./trigger";
import { renderTimeline } from "./timeline";
import { drawStage, nearestActor, screenToWorld } from "./stage";
import { type PreviewFrame, duration, fetchTimeline, frameAt } from "./preview";
import { loadAssets, actorIds, sfxIds } from "./assets";
import { verbTakesWorldPoint } from "./vocab";
import { suggestions, type Finding, type SuggestContext, type Suggestion } from "./suggest";
import "./rules"; // registers the Tier-1 RuleProvider with the suggestion engine

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el;
}

const docName = $("doc-name");
const seqList = $("sequence-list") as HTMLUListElement;
const seqCount = $("seq-count");
const validationOut = $("validation-output") as HTMLPreElement;
// The Fix-it ribbon: a small list of findings + Fix / Fix-all buttons, injected
// just above the existing validation output (no index.html change needed).
const fixRibbon = document.createElement("div");
fixRibbon.className = "fix-ribbon";
fixRibbon.hidden = true;
validationOut.parentElement?.insertBefore(fixRibbon, validationOut);
const detailTitle = $("detail-title");
const detailBody = $("detail-body");
const timelineHost = $("timeline-host");
const timelineName = $("timeline-name");
const timelineChain = $("timeline-chain");

const stageCanvas = $("stage") as HTMLCanvasElement;
const stageMsg = $("stage-msg");
const stageNow = $("stage-now");
const stageHint = $("stage-hint");
const scrub = $("scrub") as HTMLInputElement;
const scrubTime = $("scrub-time");
const scrubTotal = $("scrub-total");
const btnPlay = $("btn-play") as HTMLButtonElement;
const btnUndo = $("btn-undo") as HTMLButtonElement;
const btnRedo = $("btn-redo") as HTMLButtonElement;

let doc: SceneDoc = SceneDoc.empty();
let selectedSeq: string | null = null;
/** The beat currently open in the inspector, as [stepIndex, beatIndex]. */
let selectedBeat: [number, number] | null = null;

// ── preview / transport state ────────────────────────────────────────────────
let frames: PreviewFrame[] = [];
let playing = false;
let playT = 0;
let lastRaf = 0;
/** Bumps each rebuild so a stale async preview result is ignored. */
let previewToken = 0;

// ── validation / fix-it state ────────────────────────────────────────────────
/** Structured findings from the last `validateJson`, feeding both the Fix
 * ribbon and `buildSuggestContext` (so `fixSuggestions` can see them). */
let findings: Finding[] = [];

// ── rendering ────────────────────────────────────────────────────────────────

function renderDocName(): void {
  const name = doc.path ? doc.path.replace(/^.*[\\/]/, "") : "untitled";
  docName.textContent = `${name}${doc.isDirty() ? " •" : ""}`;
  docName.title = doc.path ?? "unsaved scene";
  btnUndo.disabled = !doc.canUndo();
  btnRedo.disabled = !doc.canRedo();
}

function renderSequences(): void {
  const seqs = doc.sequences();
  seqCount.textContent = seqs.length ? `${seqs.length}` : "";
  seqList.innerHTML = "";
  if (seqs.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = doc.path
      ? "This scene has no sequences yet — the stage is yours."
      : "Open a scene, or start a new one, to begin directing.";
    seqList.appendChild(li);
    return;
  }
  for (const seq of seqs) {
    seqList.appendChild(sequenceRow(seq));
  }
}

function sequenceRow(seq: Sequence): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "seq" + (seq.id === selectedSeq ? " selected" : "");
  li.tabIndex = 0;

  const id = document.createElement("span");
  id.className = "seq-id";
  id.textContent = seq.id;

  const meta = document.createElement("span");
  meta.className = "seq-meta";
  meta.textContent = SceneDoc.summarize(seq);

  li.append(id, meta);

  // Chaining edges: what starts this, and what it starts (story flow).
  const from = SceneDoc.chainedFrom(seq);
  const leadsTo = doc.chains(seq.id);
  if (from || leadsTo.length) {
    const chain = document.createElement("span");
    chain.className = "seq-chain";
    const parts: string[] = [];
    if (from) parts.push(`↳ after ${from}`);
    if (leadsTo.length) parts.push(`→ ${leadsTo.join(", ")}`);
    chain.textContent = parts.join("   ");
    li.appendChild(chain);
  }

  if (seq.note) {
    const note = document.createElement("span");
    note.className = "seq-note";
    note.textContent = seq.note;
    li.appendChild(note);
  }
  li.addEventListener("click", () => {
    selectedSeq = seq.id;
    selectedBeat = null;
    renderSequences();
    renderDetail();
    void rebuildPreview();
  });
  return li;
}

// ── sequence detail (steps → beats → schema-driven form) ─────────────────────

function renderDetail(): void {
  detailBody.innerHTML = "";
  timelineHost.innerHTML = "";
  const seq = selectedSeq ? doc.sequence(selectedSeq) : undefined;
  if (!seq) {
    detailTitle.textContent = "Sequence";
    timelineName.textContent = "Timeline";
    timelineChain.textContent = "";
    const hint = document.createElement("p");
    hint.className = "empty";
    hint.style.cssText = "color: var(--muted); font-size: 12.5px;";
    hint.textContent = "Select a sequence to arrange its beats.";
    timelineHost.appendChild(hint);
    detailBody.appendChild(emptyNote("Select a beat to edit it. Fill only what the action needs."));
    return;
  }
  detailTitle.textContent = seq.id;
  timelineName.textContent = seq.id;

  // Timeline header: where this sequence sits in the story flow.
  const leadsTo = doc.chains(seq.id);
  timelineChain.innerHTML = "";
  if (leadsTo.length) {
    timelineChain.append("then starts ");
    const b = document.createElement("b");
    b.textContent = leadsTo.join(", ");
    timelineChain.appendChild(b);
  }

  // Trigger editor — *what starts this sequence*. Schema-driven; undoable.
  const trig = document.createElement("div");
  trig.className = "trigger-panel";
  const trigHead = document.createElement("div");
  trigHead.className = "trigger-head";
  trigHead.textContent = "Starts when";
  trig.appendChild(trigHead);
  const seqIds = doc.sequences().map((s) => s.id).filter((id) => id !== seq.id);
  trig.appendChild(
    buildTriggerForm(seq.trigger as Trigger | undefined, seqIds, (next) => {
      doc.edit((data) => {
        const target = data.sequence?.find((s) => s.id === seq.id);
        if (target) target.trigger = next;
      });
      renderDocName();
      renderSequences(); // summary + chaining edges may change
      renderDetail();
      void rebuildPreview();
    }),
  );
  timelineHost.appendChild(trig);

  // The node-graph timeline (lives in the center column, under the stage).
  const tl = document.createElement("div");
  tl.className = "timeline";
  timelineHost.appendChild(tl);
  renderTimeline(tl, seq, selectedBeat, {
    selectBeat: (si, bi) => {
      selectedBeat = [si, bi];
      renderDetail();
    },
    addBeat: (si) => {
      const bi = doc.addBeat(seq.id, si);
      selectedBeat = bi >= 0 ? [si, bi] : selectedBeat;
      afterStructuralEdit();
    },
    deleteBeat: (si, bi) => {
      doc.removeBeat(seq.id, si, bi);
      if (selectedBeat && selectedBeat[0] === si && selectedBeat[1] === bi) selectedBeat = null;
      afterStructuralEdit();
    },
    addStep: () => {
      doc.addStep(seq.id);
      afterStructuralEdit();
    },
    deleteStep: (si) => {
      doc.removeStep(seq.id, si);
      if (selectedBeat && selectedBeat[0] === si) selectedBeat = null;
      afterStructuralEdit();
    },
    moveStep: (si, delta) => {
      doc.moveStep(seq.id, si, delta);
      selectedBeat = null;
      afterStructuralEdit();
    },
    moveBeat: (fs, fb, ts, ti) => {
      doc.moveBeat(seq.id, fs, fb, ts, ti);
      selectedBeat = null;
      afterStructuralEdit();
    },
    suggestBeatsFor: async (si) => {
      if (!selectedSeq) return [];
      const ctx = buildSuggestContext(si, null);
      const all = await suggestions(ctx);
      return all.filter((s) => s.kind === "beat");
    },
    applySuggestion: (s) => {
      s.apply(doc);
      afterStructuralEdit();
    },
    addBeatVerb: (si, verb) => {
      const bi = doc.addBeat(selectedSeq!, si);
      if (bi >= 0) {
        doc.replaceBeat(selectedSeq!, si, bi, { actor: "echo", do: verb });
        selectedBeat = [si, bi];
      }
      afterStructuralEdit();
    },
  });

  // The inspector for the selected beat (schema-driven form) — right column.
  if (selectedBeat) {
    detailBody.appendChild(inspector(seq, selectedBeat[0], selectedBeat[1]));
  } else {
    detailBody.appendChild(
      emptyNote("Pick a beat on the timeline to edit it. Fill only what the action needs."),
    );
  }
  updateStageHint();
}

/** After any structural edit, refresh the detail + list + dirty flag + preview. */
function afterStructuralEdit(): void {
  renderDocName();
  renderSequences();
  renderDetail();
  void rebuildPreview();
}

/** Assemble a SuggestContext from the current doc/selection/assets/preview/
 * findings, for the suggestion engine. */
function buildSuggestContext(stepIndex: number, selBeat: Beat | null): SuggestContext {
  return {
    scene: JSON.parse(doc.toJson()) as ChoreographyScene,
    seqId: selectedSeq,
    stepIndex,
    selectedBeat: selBeat,
    actors: actorIds(),
    sfx: sfxIds(),
    frame: frames.length ? frameAt(frames, playT) : null,
    findings,
  };
}

function inspector(seq: Sequence, si: number, bi: number): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "inspector";

  const beat = seq.step?.[si]?.beat?.[bi];
  if (!beat) {
    panel.appendChild(emptyNote("Beat no longer exists."));
    return panel;
  }

  // Header: verb as the title, actor + guidance underneath (design microcopy).
  const verb = (beat.do ?? "beat").replace(/_/g, " ");
  const actor = beat.actor ?? "someone";
  const title = document.createElement("div");
  title.className = "detail-title";
  title.textContent = verb;
  panel.appendChild(title);
  const guide = document.createElement("p");
  guide.className = "form-desc";
  guide.style.marginBottom = "14px";
  guide.textContent = `A single beat by ${actor}. Fill only what this action needs.`;
  panel.appendChild(guide);

  panel.appendChild(buildSuggestedChip(seq, si, bi));

  // Edit a copy; commit through the doc so it owns state + dirty tracking. If the
  // verb changed, the card label changes too, so re-render the timeline.
  panel.appendChild(
    buildBeatForm({ ...beat } as Beat, (next) => {
      doc.replaceBeat(seq.id, si, bi, next);
      renderDocName();
      renderSequences();
      renderDetail();
      void rebuildPreview();
    }),
  );
  return panel;
}

/** A gold "✦ Suggested" chip offering the top-confidence next-beat suggestion
 * for the selected beat's step. Rendered hidden/empty first (no blocking on the
 * async engine call), then populated — or removed — once `suggestions()`
 * resolves. Stale-guarded: if the selection moved on before the promise
 * resolves, the result is dropped. */
function buildSuggestedChip(seq: Sequence, si: number, bi: number): HTMLElement {
  const host = document.createElement("div");
  host.className = "suggested-chip-host";

  const ctx = buildSuggestContext(si, seq.step?.[si]?.beat?.[bi] ?? null);
  void suggestions(ctx).then((all) => {
    // Stale-guard: bail if the selection has since changed.
    if (!selectedBeat || selectedBeat[0] !== si || selectedBeat[1] !== bi) return;
    if (selectedSeq !== seq.id) return;
    const top = all
      .filter((s) => s.kind === "beat")
      .sort((a, b) => b.confidence - a.confidence)[0];
    if (!top) return; // no-op: leave the host empty
    host.appendChild(suggestedChipButton(top, seq.id, si, bi));
  });

  return host;
}

function suggestedChipButton(s: Suggestion, seqId: string, si: number, bi: number): HTMLElement {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "suggested-chip";
  chip.title = s.detail ?? s.label;
  const mark = document.createElement("span");
  mark.className = "suggested-chip-mark";
  mark.textContent = "✦";
  chip.append(mark, ` Suggested: ${s.label}`);
  chip.addEventListener("click", () => {
    // Stale-guard: only apply if this is still the selected beat.
    if (!selectedSeq || selectedSeq !== seqId) return;
    if (!selectedBeat || selectedBeat[0] !== si || selectedBeat[1] !== bi) return;
    s.apply(doc);
    afterStructuralEdit();
  });
  return chip;
}

function emptyNote(text: string): HTMLElement {
  const p = document.createElement("p");
  p.className = "empty";
  p.textContent = text;
  return p;
}

function renderAll(): void {
  renderDocName();
  renderSequences();
  renderDetail();
}

function setValidation(text: string, isError = false): void {
  validationOut.textContent = text;
  validationOut.classList.toggle("error", isError);
}

// ── live preview + transport ─────────────────────────────────────────────────

/** Rebuild the preview timeline for the selected sequence from the current
 * (unsaved) scene. Ignores stale async results via a token. */
async function rebuildPreview(): Promise<void> {
  const token = ++previewToken;
  stopPlaying();
  frames = [];
  playT = 0;
  if (!selectedSeq) {
    stageMsg.textContent = "Select a sequence to preview it.";
    fitStageCanvas();
    drawStage(stageCanvas, null);
    return;
  }
  stageMsg.textContent = "Building preview…";
  const res = await fetchTimeline(doc.toJson(), selectedSeq, 30, 8);
  if (token !== previewToken) return; // superseded by a newer rebuild
  if (!res.ok) {
    stageMsg.textContent = res.error ?? "preview failed";
    fitStageCanvas();
    drawStage(stageCanvas, null);
    return;
  }
  frames = res.frames;
  const dur = duration(frames);
  scrub.max = String(Math.max(dur, 0.001));
  scrub.value = "0";
  scrubTotal.textContent = `${dur.toFixed(1)}s`;
  stageMsg.textContent =
    frames.length <= 2
      ? `Sequence '${selectedSeq}' produced no motion.`
      : `${frames.length} frames · ${dur.toFixed(1)}s`;
  updateStageHint();
  drawAt(0);
}

/** Match the canvas backing store to its (flex-sized) container so the fog and
 * grid stay crisp and the aspect never distorts. Called before each draw. */
function fitStageCanvas(): void {
  const rect = stageCanvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (stageCanvas.width !== w || stageCanvas.height !== h) {
    stageCanvas.width = w;
    stageCanvas.height = h;
  }
}

function drawAt(t: number): void {
  playT = t;
  scrub.value = String(t);
  scrubTime.textContent = `${t.toFixed(1)}s`;
  stageNow.textContent = `${t.toFixed(1)}s`;
  fitStageCanvas();
  drawStage(stageCanvas, frameAt(frames, t));
}

/** The bottom-left stage hint reflects whether a click will place a beat. */
function updateStageHint(): void {
  if (canPlaceOnStage()) {
    stageHint.textContent = "Click anywhere to set where this action happens.";
    stageCanvas.style.cursor = "crosshair";
  } else if (selectedSeq && !selectedBeat) {
    stageHint.textContent = "Select a beat to place it on the stage.";
    stageCanvas.style.cursor = "default";
  } else {
    stageHint.textContent = "";
    stageCanvas.style.cursor = "default";
  }
}

/** The currently-selected beat, or null. */
function currentBeat(): Beat | null {
  if (!selectedSeq || !selectedBeat) return null;
  return doc.sequence(selectedSeq)?.step?.[selectedBeat[0]]?.beat?.[selectedBeat[1]] ?? null;
}

/** Whether clicking the stage would set a destination right now. */
function canPlaceOnStage(): boolean {
  const b = currentBeat();
  return !!b && verbTakesWorldPoint(b.do);
}

/** How far off an actor's own position a "beside them" placement lands, in
 * world units — enough to not overlap the marker, small enough to still read
 * as "next to". */
const SNAP_STANDOFF = 40;

/** Set the selected placeable beat's x/y from a stage click. Snaps to "beside"
 * a nearby visible actor when the click lands close to one, so a writer gets a
 * legible destination instead of a raw coordinate. Returns true if it placed. */
function placeSelectedBeatAt(clientX: number, clientY: number): boolean {
  if (!selectedSeq || !selectedBeat) return false;
  const b = currentBeat();
  if (!b || !verbTakesWorldPoint(b.do)) return false;
  const { x, y } = screenToWorld(stageCanvas, clientX, clientY);
  const [si, bi] = selectedBeat;

  const near = nearestActor(frames.length ? frameAt(frames, playT) : null, x, y);
  let placeX = x;
  let placeY = y;
  if (near) {
    placeX = near.pos.x + SNAP_STANDOFF;
    placeY = near.pos.y;
    stageMsg.textContent = `Beside ${near.id}`;
  }

  const next: Beat = { ...b, x: placeX, y: placeY };
  // walk_in to a fixed point means dropping any actor-standoff target.
  if (b.do === "walk_in") delete next.target;
  doc.replaceBeat(selectedSeq, si, bi, next);
  renderDocName();
  renderSequences();
  renderDetail();
  void rebuildPreview();
  return true;
}

/** Nudge the writer toward the interaction when they click with nothing placeable. */
function hintPlaceable(): void {
  if (!selectedSeq) {
    stageMsg.textContent = "Select a sequence, then a beat, to place it on the stage.";
  } else if (!selectedBeat) {
    stageMsg.textContent = "Select a beat (e.g. Walk to) then click the stage to place it.";
  }
}

function togglePlay(): void {
  if (playing) stopPlaying();
  else startPlaying();
}

function startPlaying(): void {
  if (frames.length < 2) return;
  playing = true;
  btnPlay.textContent = "⏸";
  if (playT >= duration(frames)) playT = 0;
  lastRaf = performance.now();
  requestAnimationFrame(tick);
}

function stopPlaying(): void {
  playing = false;
  btnPlay.textContent = "▶";
}

function tick(now: number): void {
  if (!playing) return;
  const dt = (now - lastRaf) / 1000;
  lastRaf = now;
  let t = playT + dt;
  const dur = duration(frames);
  if (t >= dur) {
    t = dur;
    drawAt(t);
    stopPlaying();
    return;
  }
  drawAt(t);
  requestAnimationFrame(tick);
}

// ── actions ──────────────────────────────────────────────────────────────────

async function doOpen(): Promise<void> {
  const path = await openSceneDialog();
  if (!path) return;
  const r = await loadScene(path);
  if (!r.ok) {
    setValidation(r.output, true);
    return;
  }
  try {
    doc = SceneDoc.fromJson(r.output, path);
    selectedSeq = null;
    selectedBeat = null;
    renderAll();
    void rebuildPreview();
    setValidation("—");
    await runValidate(); // give immediate feedback on the opened scene
  } catch (e) {
    setValidation(`Could not parse scene: ${e}`, true);
  }
}

async function doSave(saveAs: boolean): Promise<void> {
  let path = doc.path;
  if (saveAs || !path) {
    path = await saveSceneDialog(doc.path ?? "choreography.toml");
    if (!path) return;
  }
  const r = await saveScene(path, doc.toJson());
  if (!r.ok) {
    setValidation(r.output, true);
    return;
  }
  doc.markSaved(path);
  renderDocName();
  setValidation(`Saved ${path}`);
}

/** Bumps each validate run so a stale async findings/ribbon result is ignored. */
let validateToken = 0;

async function runValidate(): Promise<void> {
  if (!doc.path) {
    setValidation("Save the scene first, then validate.");
    findings = [];
    void renderFixRibbon([]);
    return;
  }
  const token = ++validateToken;
  setValidation("Validating…");
  const [r, structured] = await Promise.all([validate(doc.path), validateJson(doc.path)]);
  if (token !== validateToken) return; // superseded by a newer validate
  setValidation(r.output, !r.ok);
  findings = structured;
  await renderFixRibbon(structured);
}

/** Render the Fix-it ribbon: one row per finding, a "Fix" button when the
 * engine offers a matching one-click repair, and a "Fix all" button when two
 * or more fixes are available. Findings with no fix render as plain text. */
async function renderFixRibbon(list: Finding[]): Promise<void> {
  if (list.length === 0) {
    fixRibbon.innerHTML = "";
    fixRibbon.hidden = true;
    return;
  }
  const token = validateToken;
  const ctx = buildSuggestContext(selectedBeat?.[0] ?? 0, currentBeat());
  let fixes: Suggestion[] = [];
  try {
    fixes = (await suggestions(ctx)).filter((s) => s.kind === "fix");
  } catch {
    fixes = [];
  }
  if (token !== validateToken) return; // a newer validate superseded this render

  fixRibbon.innerHTML = "";
  fixRibbon.hidden = false;

  if (fixes.length > 1) {
    const fixAll = document.createElement("button");
    fixAll.type = "button";
    fixAll.className = "small fix-all";
    fixAll.textContent = `Fix all (${fixes.length})`;
    fixAll.addEventListener("click", () => {
      for (const fix of fixes) fix.apply(doc);
      afterStructuralEdit();
      void runValidate();
    });
    fixRibbon.appendChild(fixAll);
  }

  for (const finding of list) {
    const row = document.createElement("div");
    row.className = "fix-row" + (finding.level === "error" ? " error" : "");

    const msg = document.createElement("span");
    msg.className = "fix-row-msg";
    msg.textContent = finding.message;
    row.appendChild(msg);

    const fix = matchingFix(fixes, finding);
    if (fix) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "small fix-row-btn";
      btn.textContent = "Fix";
      btn.title = fix.label;
      btn.addEventListener("click", () => {
        fix.apply(doc);
        afterStructuralEdit();
        void runValidate();
      });
      row.appendChild(btn);
    }
    fixRibbon.appendChild(row);
  }
}

/** `fixSuggestions` derives one-click fixes from `ctx.findings` by array index
 * (its suggestion ids embed that index — see rules.ts), so pairing them back up
 * with the finding they came from is a simple index match. */
function matchingFix(fixes: Suggestion[], finding: Finding): Suggestion | undefined {
  const i = findings.indexOf(finding);
  if (i < 0) return undefined;
  return fixes.find((f) => f.id.endsWith(`:${i}`));
}

/** Publish the scene to the game: validate, then (only if clean) write the .toml
 * the game reads. Never writes an invalid scene. */
async function doExport(): Promise<void> {
  const target = await saveSceneDialog(
    doc.path?.replace(/\.json$/i, ".toml") ?? "choreography.toml",
  );
  if (!target) return;
  setValidation("Exporting to the game…");
  const r = await exportScene(target, doc.toJson());
  setValidation(r.output, !r.ok);
}

function doNew(): void {
  if (doc.isDirty() && !confirm("Discard unsaved changes?")) return;
  doc = SceneDoc.empty();
  selectedSeq = null;
  selectedBeat = null;
  findings = [];
  void renderFixRibbon([]);
  renderAll();
  void rebuildPreview();
  setValidation("—");
}

// ── wiring ───────────────────────────────────────────────────────────────────

$("btn-new").addEventListener("click", doNew);
$("btn-open").addEventListener("click", () => void doOpen());
$("btn-save").addEventListener("click", () => void doSave(false));
$("btn-save-as").addEventListener("click", () => void doSave(true));
$("btn-export").addEventListener("click", () => void doExport());
$("btn-validate").addEventListener("click", () => void runValidate());
btnUndo.addEventListener("click", doUndo);
btnRedo.addEventListener("click", doRedo);

// transport
btnPlay.addEventListener("click", togglePlay);
$("btn-refresh-preview").addEventListener("click", () => void rebuildPreview());
scrub.addEventListener("input", () => {
  stopPlaying();
  drawAt(Number(scrub.value));
});

// Place-by-pointing: click the stage to set the selected beat's destination,
// so a writer never types coordinates. Only active for beats that carry a world
// point (walk_to, teleport_to, …).
stageCanvas.addEventListener("click", (e) => {
  const placed = placeSelectedBeatAt(e.clientX, e.clientY);
  if (placed) return;
  hintPlaceable();
});
stageCanvas.addEventListener("mousemove", (e) => {
  stageCanvas.style.cursor = canPlaceOnStage() ? "crosshair" : "default";
  void e;
});

window.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === "s") {
    e.preventDefault();
    void doSave(e.shiftKey);
  } else if (mod && e.key === "o") {
    e.preventDefault();
    void doOpen();
  } else if (mod && !e.shiftKey && e.key.toLowerCase() === "z") {
    e.preventDefault();
    doUndo();
  } else if (mod && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
    e.preventDefault();
    doRedo();
  }
});

function doUndo(): void {
  if (!doc.undo()) return;
  ensureValidSelection();
  afterHistory("Undid the last change.");
}

function doRedo(): void {
  if (!doc.redo()) return;
  ensureValidSelection();
  afterHistory("Redid the change.");
}

/** After undo/redo the selection may point at a beat that no longer exists;
 * clear it if so. */
function ensureValidSelection(): void {
  if (selectedSeq && !doc.sequence(selectedSeq)) {
    selectedSeq = null;
    selectedBeat = null;
  } else if (selectedBeat && !currentBeat()) {
    selectedBeat = null;
  }
}

function afterHistory(msg: string): void {
  renderAll();
  void rebuildPreview();
  setValidation(msg);
}

// Load the game asset catalog (actor/sfx ids) once, then refresh so any open
// inspector picks up the suggestions. Degrades to free-text if unavailable.
void loadAssets().then(() => renderDetail());

// Keep the stage crisp as the window resizes; redraw the current frame.
let resizeRaf = 0;
window.addEventListener("resize", () => {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0;
    fitStageCanvas();
    drawStage(stageCanvas, frames.length ? frameAt(frames, playT) : null);
  });
});

renderAll();
fitStageCanvas();
drawStage(stageCanvas, null);

// Dev-only seam: load a scene from a JSON string without the native dialog, so
// the UI can be driven in a browser during development. Never present in a
// production build (`import.meta.env.DEV` is compiled to `false` and dropped).
if (import.meta.env.DEV) {
  (window as unknown as { __lmLoad?: (json: string) => void }).__lmLoad = (json: string) => {
    doc = SceneDoc.fromJson(json, "dev.json");
    selectedSeq = doc.sequences()[0]?.id ?? null;
    selectedBeat = selectedSeq ? [0, 0] : null;
    renderAll();
    void rebuildPreview();
  };
}
