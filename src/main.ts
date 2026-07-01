// Leitmotif A1 — open / save a scene, list its sequences, validate.
//
// This is the first milestone a writer actually touches: the app opens a scene
// file, shows the sequences inside it, saves it back, and reports validation
// errors in human terms. Everything flows through the SceneDoc model (the one
// owner of document state) and the bridge (the one path to the game's `choreo`
// CLI). The visual editor (node graph, canvas, live preview) builds on this.

import {
  loadScene,
  openSceneDialog,
  saveScene,
  saveSceneDialog,
  validate,
} from "./bridge";
import { SceneDoc, type Beat, type Sequence, type Step } from "./scene";
import { buildBeatForm } from "./form";

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

let doc: SceneDoc = SceneDoc.empty();
let selectedSeq: string | null = null;
/** The beat currently open in the inspector, as [stepIndex, beatIndex]. */
let selectedBeat: [number, number] | null = null;

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

  const steps = seq.step ?? [];
  steps.forEach((step, si) => detailBody.appendChild(stepBlock(step, si)));

  if (selectedBeat) {
    detailBody.appendChild(inspector(seq, selectedBeat[0], selectedBeat[1]));
  }
}

function stepBlock(step: Step, si: number): HTMLElement {
  const box = document.createElement("div");
  box.className = "step";
  const head = document.createElement("div");
  head.className = "step-head";
  const when = step.wait_for
    ? `wait_for ${step.wait_for.kind}`
    : `${step.duration ?? 0}s`;
  head.textContent = `Step ${si + 1} · ${when}`;
  box.appendChild(head);

  const beats = step.beat ?? [];
  if (beats.length === 0) {
    box.appendChild(emptyNote("(no beats)"));
  }
  beats.forEach((beat, bi) => {
    const chip = document.createElement("button");
    chip.className =
      "beat-chip" +
      (selectedBeat && selectedBeat[0] === si && selectedBeat[1] === bi ? " selected" : "");
    chip.textContent = `${beat.actor ?? "echo"} · ${beat.do}`;
    chip.addEventListener("click", () => {
      selectedBeat = [si, bi];
      renderDetail();
    });
    box.appendChild(chip);
  });
  return box;
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
  // Edit a copy; commit through the doc so it owns state + dirty tracking.
  panel.appendChild(
    buildBeatForm({ ...beat } as Beat, (next) => {
      doc.edit((data) => {
        const target = data.sequence?.[seqIndex(seq.id)]?.step?.[si]?.beat?.[bi];
        if (target) {
          for (const k of Object.keys(target)) delete (target as Beat)[k];
          Object.assign(target, next);
        }
      });
      renderDocName();
      renderSequences(); // summaries may have changed (e.g. verb count)
    }),
  );
  return panel;
}

function seqIndex(id: string): number {
  return doc.sequences().findIndex((s) => s.id === id);
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
  setValidation("—");
}

// ── wiring ───────────────────────────────────────────────────────────────────

$("btn-new").addEventListener("click", doNew);
$("btn-open").addEventListener("click", () => void doOpen());
$("btn-save").addEventListener("click", () => void doSave(false));
$("btn-save-as").addEventListener("click", () => void doSave(true));
$("btn-validate").addEventListener("click", () => void runValidate());

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
