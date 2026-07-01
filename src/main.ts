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
import { SceneDoc, type Sequence } from "./scene";

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el;
}

const docName = $("doc-name");
const seqList = $("sequence-list") as HTMLUListElement;
const seqCount = $("seq-count");
const validationOut = $("validation-output") as HTMLPreElement;

let doc: SceneDoc = SceneDoc.empty();
let selectedSeq: string | null = null;

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
    renderSequences();
  });
  return li;
}

function renderAll(): void {
  renderDocName();
  renderSequences();
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
