// The node-graph timeline — A3's visual heart.
//
// A sequence is drawn as a horizontal run of Steps (left → right = time), and
// within each step its Beats are stacked as draggable cards (top → bottom = the
// parallel lanes that fire together). You can:
//   • drag a beat card to another position or another step,
//   • add / delete beats and steps,
//   • reorder steps.
// All mutations go through the SceneDoc ops; this file is pure view + interaction.

import type { Sequence } from "./scene";
import type { Suggestion } from "./suggest";
import { verbNames } from "./vocab";

export interface TimelineCallbacks {
  selectBeat: (stepIndex: number, beatIndex: number) => void;
  addBeat: (stepIndex: number) => void;
  deleteBeat: (stepIndex: number, beatIndex: number) => void;
  addStep: () => void;
  deleteStep: (stepIndex: number) => void;
  moveStep: (stepIndex: number, delta: number) => void;
  /** Drag drop: move beat (fromStep,fromBeat) to (toStep,toIndex). */
  moveBeat: (fromStep: number, fromBeat: number, toStep: number, toIndex: number) => void;
  /** Build the contextual "next beat" suggestions for this step (may be empty). */
  suggestBeatsFor?: (stepIndex: number) => Promise<Suggestion[]>;
  /** Apply a chosen suggestion. */
  applySuggestion?: (s: Suggestion) => void;
  /** Add a blank beat of a specific verb. */
  addBeatVerb?: (stepIndex: number, verb: string) => void;
}

interface DragState {
  fromStep: number;
  fromBeat: number;
}

/** Render the timeline for `seq` into `root`. `selected` is the [step,beat] whose
 * card is highlighted (the one open in the inspector), or null. */
export function renderTimeline(
  root: HTMLElement,
  seq: Sequence,
  selected: [number, number] | null,
  cb: TimelineCallbacks,
): void {
  root.innerHTML = "";
  root.className = "timeline";

  let drag: DragState | null = null;

  const steps = seq.step ?? [];
  steps.forEach((step, si) => {
    const col = document.createElement("div");
    col.className = "tl-step";

    // Step header: grip + when + reorder/delete controls.
    const head = document.createElement("div");
    head.className = "tl-step-head";
    const grip = document.createElement("span");
    grip.className = "tl-step-grip";
    grip.textContent = "⁚⁚";
    const when = step.wait_for ? `wait: ${step.wait_for.kind}` : `${step.duration ?? 0}s`;
    const label = document.createElement("span");
    label.className = "tl-step-label";
    label.textContent = `Step ${si + 1}`;
    const timing = document.createElement("span");
    timing.className = "tl-step-when";
    timing.textContent = when;
    head.append(grip, label, timing, ctrl("‹", "Move step left", () => cb.moveStep(si, -1)));
    head.append(ctrl("›", "Move step right", () => cb.moveStep(si, +1)));
    head.append(ctrl("✕", "Delete step", () => cb.deleteStep(si)));
    col.appendChild(head);

    // Beat cards.
    const lane = document.createElement("div");
    lane.className = "tl-lane";
    const beats = step.beat ?? [];

    const makeDrop = (index: number): HTMLElement => {
      const dz = document.createElement("div");
      dz.className = "tl-drop";
      dz.addEventListener("dragover", (e) => {
        e.preventDefault();
        dz.classList.add("over");
      });
      dz.addEventListener("dragleave", () => dz.classList.remove("over"));
      dz.addEventListener("drop", (e) => {
        e.preventDefault();
        dz.classList.remove("over");
        if (drag) cb.moveBeat(drag.fromStep, drag.fromBeat, si, index);
        drag = null;
      });
      return dz;
    };

    lane.appendChild(makeDrop(0));
    beats.forEach((beat, bi) => {
      const card = document.createElement("div");
      const isSel = selected && selected[0] === si && selected[1] === bi;
      card.className = "tl-beat" + (isSel ? " selected" : "");
      card.draggable = true;

      const name = beat.actor ?? "echo";
      const color = actorColor(name);
      const glyph = document.createElement("span");
      glyph.className = "tl-beat-glyph";
      glyph.style.background = color;
      glyph.textContent = name.charAt(0).toUpperCase();
      const body = document.createElement("div");
      body.className = "tl-beat-body";
      const actor = document.createElement("span");
      actor.className = "tl-beat-actor";
      actor.style.color = color;
      actor.textContent = name;
      const sep = document.createTextNode(" · ");
      const verb = document.createElement("span");
      verb.className = "tl-beat-verb";
      verb.textContent = beat.do.replace(/_/g, " ");
      body.append(actor, sep, verb);
      card.append(glyph, body);

      const del = ctrl("✕", "Delete beat", (e) => {
        e.stopPropagation();
        cb.deleteBeat(si, bi);
      });
      del.classList.add("tl-beat-del");
      card.appendChild(del);

      card.addEventListener("click", () => cb.selectBeat(si, bi));
      card.addEventListener("dragstart", (e) => {
        drag = { fromStep: si, fromBeat: bi };
        card.classList.add("dragging");
        e.dataTransfer?.setData("text/plain", `${si}:${bi}`);
      });
      card.addEventListener("dragend", () => card.classList.remove("dragging"));

      lane.appendChild(card);
      lane.appendChild(makeDrop(bi + 1));
    });

    const addBeat = document.createElement("button");
    addBeat.className = "tl-add tl-add-beat";
    addBeat.textContent = "+ beat";
    addBeat.addEventListener("click", (e) => {
      e.stopPropagation();
      if (cb.suggestBeatsFor && cb.applySuggestion && cb.addBeatVerb) {
        void openAddBeatPicker(addBeat, si, cb);
      } else {
        cb.addBeat(si);
      }
    });
    lane.appendChild(addBeat);

    col.appendChild(lane);
    root.appendChild(col);
  });

  // Trailing "+ step" column.
  const addStepCol = document.createElement("div");
  addStepCol.className = "tl-step tl-add-step-col";
  const addStep = document.createElement("button");
  addStep.className = "tl-add tl-add-step";
  addStep.textContent = "+ step";
  addStep.addEventListener("click", () => cb.addStep());
  addStepCol.appendChild(addStep);
  root.appendChild(addStepCol);
}

/** A stable accent colour per actor, so a writer can track who's who at a glance.
 * Echo/player get the game's cool teal; everyone else a warm rotation. */
const ACTOR_COLORS = ["#d8b268", "#c58fd6", "#8fb8d6", "#d69f8f", "#a8d68f", "#d68fb0"];
function actorColor(name: string): string {
  const id = name.toLowerCase();
  if (id === "echo" || id === "player") return "#75f0d6";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ACTOR_COLORS[h % ACTOR_COLORS.length];
}

/** A tiny control button. */
function ctrl(glyph: string, title: string, onClick: (e: MouseEvent) => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "tl-ctrl";
  b.textContent = glyph;
  b.title = title;
  b.addEventListener("click", onClick);
  return b;
}

/** Open the "never a blank card" add-beat picker anchored under `anchor`. Top
 * rows are the engine's contextual suggestions (apply directly); below a
 * divider, the full verb list adds a blank beat of that verb. Closes on choice,
 * outside click, or Escape. */
async function openAddBeatPicker(
  anchor: HTMLElement,
  si: number,
  cb: TimelineCallbacks,
): Promise<void> {
  closeAnyOpenPicker();

  const picker = document.createElement("div");
  picker.className = "tl-picker";

  const loading = document.createElement("div");
  loading.className = "tl-picker-loading";
  loading.textContent = "Thinking…";
  picker.appendChild(loading);

  anchorPicker(picker, anchor);
  document.body.appendChild(picker);
  openPicker = picker;

  const closeAndCleanup = (): void => closeAnyOpenPicker();
  // Defer listener registration so the click that opened the picker doesn't
  // immediately close it.
  window.setTimeout(() => {
    document.addEventListener("mousedown", onOutsideClick);
    document.addEventListener("keydown", onEscape);
  }, 0);
  function onOutsideClick(e: MouseEvent): void {
    if (picker.contains(e.target as Node) || e.target === anchor) return;
    closeAndCleanup();
  }
  function onEscape(e: KeyboardEvent): void {
    if (e.key === "Escape") closeAndCleanup();
  }
  pickerCleanup = () => {
    document.removeEventListener("mousedown", onOutsideClick);
    document.removeEventListener("keydown", onEscape);
  };

  let suggested: Suggestion[] = [];
  try {
    suggested = cb.suggestBeatsFor ? await cb.suggestBeatsFor(si) : [];
  } catch {
    suggested = [];
  }
  // The picker may have been closed (or reopened elsewhere) while awaiting.
  if (openPicker !== picker) return;

  picker.innerHTML = "";

  if (suggested.length > 0) {
    const heading = document.createElement("div");
    heading.className = "tl-picker-heading";
    heading.textContent = "Adds the natural next beat";
    picker.appendChild(heading);

    suggested.forEach((s) => {
      const row = document.createElement("button");
      row.className = "tl-picker-row tl-picker-suggestion";
      const label = document.createElement("span");
      label.className = "tl-picker-row-label";
      label.textContent = s.label;
      row.appendChild(label);
      if (s.detail) {
        const detail = document.createElement("span");
        detail.className = "tl-picker-row-detail";
        detail.textContent = s.detail;
        row.appendChild(detail);
      }
      row.addEventListener("click", () => {
        cb.applySuggestion?.(s);
        closeAnyOpenPicker();
      });
      picker.appendChild(row);
    });

    const divider = document.createElement("div");
    divider.className = "tl-picker-divider";
    picker.appendChild(divider);
  }

  const otherHeading = document.createElement("div");
  otherHeading.className = "tl-picker-heading";
  otherHeading.textContent = "Or pick another:";
  picker.appendChild(otherHeading);

  const verbList = document.createElement("div");
  verbList.className = "tl-picker-verbs";
  verbNames().forEach((verb) => {
    const btn = document.createElement("button");
    btn.className = "tl-picker-row tl-picker-verb";
    btn.textContent = verb.replace(/_/g, " ");
    btn.addEventListener("click", () => {
      cb.addBeatVerb?.(si, verb);
      closeAnyOpenPicker();
    });
    verbList.appendChild(btn);
  });
  picker.appendChild(verbList);
}

let openPicker: HTMLElement | null = null;
let pickerCleanup: (() => void) | null = null;

function closeAnyOpenPicker(): void {
  if (pickerCleanup) pickerCleanup();
  pickerCleanup = null;
  if (openPicker) openPicker.remove();
  openPicker = null;
}

/** Position `picker` just under `anchor`, clamped to the viewport. */
function anchorPicker(picker: HTMLElement, anchor: HTMLElement): void {
  picker.style.position = "fixed";
  const rect = anchor.getBoundingClientRect();
  picker.style.left = `${Math.round(rect.left)}px`;
  picker.style.top = `${Math.round(rect.bottom + 4)}px`;
}
