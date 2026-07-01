// Leitmotif — the editor entry point.
//
// Open/save scenes, list sequences (A1), edit beats via a schema-driven form (A2),
// and arrange steps/beats on a node-graph timeline (A3). Everything flows through
// the SceneDoc model (the one owner of document state) and the bridge (the one
// path to the game's `choreo` CLI).

import {
  loadScene,
  openSceneDialog,
  saveScene,
  saveSceneDialog,
  validate,
} from "./bridge";
import { SceneDoc, type Beat, type Sequence } from "./scene";
import { buildBeatForm } from "./form";
import { renderTimeline } from "./timeline";
import { drawStage } from "./stage";
import { type PreviewFrame, duration, fetchTimeline, frameAt } from "./preview";

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el;
}

const docName = $("doc-name");
const seqList = $("sequence-list") as HTMLUListElement;
const seqCount = $("seq-count");
const validationOut = $("validation-output") as HTMLPreElement;
const detailTitle = $("detail-title");
const detailBody = $("detail-body");

const stageCanvas = $("stage") as HTMLCanvasElement;
const stageMsg = $("stage-msg");
const scrub = $("scrub") as HTMLInputElement;
const scrubTime = $("scrub-time");
const btnPlay = $("btn-play") as HTMLButtonElement;

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

// ── rendering ────────────────────────────────────────────────────────────────

function renderDocName(): void {
  const name = doc.path ? doc.path.replace(/^.*[\\/]/, "") : "untitled";
  docName.textContent = `${name}${doc.isDirty() ? " •" : ""}`;
  docName.title = doc.path ?? "unsaved scene";
}

function renderSequences(): void {
  const seqs = doc.sequences();
  seqCount.textContent = seqs.length ? `${seqs.length}` : "";
  seqList.innerHTML = "";
  if (seqs.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = doc.path ? "This scene has no sequences yet." : "Open a scene to see its sequences.";
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
  const seq = selectedSeq ? doc.sequence(selectedSeq) : undefined;
  if (!seq) {
    detailTitle.textContent = "Sequence";
    detailBody.appendChild(emptyNote("Select a sequence to see its steps and beats."));
    return;
  }
  detailTitle.textContent = seq.id;

  // Trigger summary line (what starts this sequence).
  const trig = document.createElement("p");
  trig.className = "detail-trigger";
  trig.textContent = `Trigger: ${seq.trigger?.kind ?? "always"}`;
  detailBody.appendChild(trig);

  // The node-graph timeline.
  const tl = document.createElement("div");
  tl.className = "timeline-wrap";
  detailBody.appendChild(tl);
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
  });

  // The inspector for the selected beat (schema-driven form).
  if (selectedBeat) {
    detailBody.appendChild(inspector(seq, selectedBeat[0], selectedBeat[1]));
  }
}

/** After any structural edit, refresh the detail + list + dirty flag + preview. */
function afterStructuralEdit(): void {
  renderDocName();
  renderSequences();
  renderDetail();
  void rebuildPreview();
}

function inspector(seq: Sequence, si: number, bi: number): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "inspector";
  const h = document.createElement("h3");
  h.textContent = "Beat";
  panel.appendChild(h);

  const beat = seq.step?.[si]?.beat?.[bi];
  if (!beat) {
    panel.appendChild(emptyNote("Beat no longer exists."));
    return panel;
  }
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
    drawStage(stageCanvas, null);
    return;
  }
  stageMsg.textContent = "Building preview…";
  const res = await fetchTimeline(doc.toJson(), selectedSeq, 30, 8);
  if (token !== previewToken) return; // superseded by a newer rebuild
  if (!res.ok) {
    stageMsg.textContent = res.error ?? "preview failed";
    drawStage(stageCanvas, null);
    return;
  }
  frames = res.frames;
  const dur = duration(frames);
  scrub.max = String(Math.max(dur, 0.001));
  scrub.value = "0";
  stageMsg.textContent =
    frames.length <= 2
      ? `Sequence '${selectedSeq}' produced no motion.`
      : `${frames.length} frames · ${dur.toFixed(1)}s`;
  drawAt(0);
}

function drawAt(t: number): void {
  playT = t;
  scrub.value = String(t);
  scrubTime.textContent = `${t.toFixed(1)}s`;
  drawStage(stageCanvas, frameAt(frames, t));
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

async function runValidate(): Promise<void> {
  if (!doc.path) {
    setValidation("Save the scene first, then validate.");
    return;
  }
  setValidation("Validating…");
  const r = await validate(doc.path);
  setValidation(r.output, !r.ok);
}

function doNew(): void {
  if (doc.isDirty() && !confirm("Discard unsaved changes?")) return;
  doc = SceneDoc.empty();
  selectedSeq = null;
  selectedBeat = null;
  renderAll();
  void rebuildPreview();
  setValidation("—");
}

// ── wiring ───────────────────────────────────────────────────────────────────

$("btn-new").addEventListener("click", doNew);
$("btn-open").addEventListener("click", () => void doOpen());
$("btn-save").addEventListener("click", () => void doSave(false));
$("btn-save-as").addEventListener("click", () => void doSave(true));
$("btn-validate").addEventListener("click", () => void runValidate());

// transport
btnPlay.addEventListener("click", togglePlay);
$("btn-refresh-preview").addEventListener("click", () => void rebuildPreview());
scrub.addEventListener("input", () => {
  stopPlaying();
  drawAt(Number(scrub.value));
});

window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    void doSave(e.shiftKey);
  } else if ((e.ctrlKey || e.metaKey) && e.key === "o") {
    e.preventDefault();
    void doOpen();
  }
});

renderAll();
