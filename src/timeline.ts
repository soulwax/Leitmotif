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

export interface TimelineCallbacks {
  selectBeat: (stepIndex: number, beatIndex: number) => void;
  addBeat: (stepIndex: number) => void;
  deleteBeat: (stepIndex: number, beatIndex: number) => void;
  addStep: () => void;
  deleteStep: (stepIndex: number) => void;
  moveStep: (stepIndex: number, delta: number) => void;
  /** Drag drop: move beat (fromStep,fromBeat) to (toStep,toIndex). */
  moveBeat: (fromStep: number, fromBeat: number, toStep: number, toIndex: number) => void;
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

    // Step header: when + reorder/delete controls.
    const head = document.createElement("div");
    head.className = "tl-step-head";
    const when = step.wait_for ? `wait: ${step.wait_for.kind}` : `${step.duration ?? 0}s`;
    const label = document.createElement("span");
    label.className = "tl-step-label";
    label.textContent = `Step ${si + 1}`;
    const timing = document.createElement("span");
    timing.className = "tl-step-when";
    timing.textContent = when;
    head.append(label, timing, ctrl("‹", "Move step left", () => cb.moveStep(si, -1)));
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

      const verb = document.createElement("span");
      verb.className = "tl-beat-verb";
      verb.textContent = beat.do;
      const actor = document.createElement("span");
      actor.className = "tl-beat-actor";
      actor.textContent = beat.actor ?? "echo";
      card.append(actor, verb);

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
    addBeat.addEventListener("click", () => cb.addBeat(si));
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

/** A tiny control button. */
function ctrl(glyph: string, title: string, onClick: (e: MouseEvent) => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "tl-ctrl";
  b.textContent = glyph;
  b.title = title;
  b.addEventListener("click", onClick);
  return b;
}
