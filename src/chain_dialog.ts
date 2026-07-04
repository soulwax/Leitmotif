// The sequence-pairing dialog: after a writer drags a chain from scene A to scene B,
// this asks which sequence in A finishes → which sequence in B starts, then returns the
// pair (or null on cancel). The trigger WRITE happens in Project.chainScenes; this only
// gathers the choice. Pure helpers (default pairing, preview text, overwrite check) are
// split out and unit-tested; the DOM overlay reuses the shared dialog shell.

import { buildDialogShell } from "./dialog";
import type { Sequence } from "./scene";

/** B's "entry sequence" = the first whose trigger is NOT on_sequence_finished (a real
 *  start), else B's first. Default source = A's last sequence. */
export function defaultPairing(
  fromSeqs: string[],
  toSeqs: Sequence[],
): { fromSeq: string; toSeq: string } {
  const fromSeq = fromSeqs[fromSeqs.length - 1] ?? "";
  const entry = toSeqs.find((s) => s.trigger?.kind !== "on_sequence_finished") ?? toSeqs[0];
  return { fromSeq, toSeq: entry?.id ?? "" };
}

export function previewLine(fromSeq: string, toSeq: string): string {
  return `When ${fromSeq} finishes, ${toSeq} starts.`;
}

/** True when the target sequence already has a real (non-chain) start condition that a
 *  new chain would replace — the dialog warns before overwriting it. */
export function needsOverwriteWarning(trigger: Sequence["trigger"]): boolean {
  return !!trigger && trigger.kind !== "on_sequence_finished";
}

/** Open the pairing dialog. Resolves to the chosen {fromSeq,toSeq} on Chain, or null on
 *  Cancel/Escape/backdrop. `targetTriggerLabelFor` gives a plain label for the currently
 *  selected target sequence's existing trigger (for the overwrite warning), or null. */
export function openChainDialog(
  fromScene: string,
  fromSeqs: string[],
  toScene: string,
  toSeqs: Sequence[],
  targetTriggerLabelFor: (toSeqId: string) => string | null,
): Promise<{ fromSeq: string; toSeq: string } | null> {
  return new Promise((resolve) => {
    const { backdrop, box, close } = buildDialogShell<{ fromSeq: string; toSeq: string }>(
      `Chain ${fromScene} → ${toScene}`,
      resolve,
    );

    const def = defaultPairing(fromSeqs, toSeqs);

    const mkSelect = (ids: string[], selected: string): HTMLSelectElement => {
      const sel = document.createElement("select");
      sel.className = "lm-dialog-input";
      for (const id of ids) {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = id;
        if (id === selected) opt.selected = true;
        sel.appendChild(opt);
      }
      return sel;
    };

    const fromSel = mkSelect(fromSeqs, def.fromSeq);
    const toSel = mkSelect(toSeqs.map((s) => s.id), def.toSeq);

    const line1 = document.createElement("div");
    line1.className = "lm-dialog-msg";
    line1.append("When ", fromSel, " finishes, start ", toSel);
    box.appendChild(line1);

    const preview = document.createElement("div");
    preview.className = "chain-preview";
    box.appendChild(preview);

    const warn = document.createElement("div");
    warn.className = "chain-warn";
    warn.hidden = true;
    box.appendChild(warn);

    const refresh = (): void => {
      preview.textContent = previewLine(fromSel.value, toSel.value);
      const label = targetTriggerLabelFor(toSel.value);
      if (label) {
        warn.hidden = false;
        warn.textContent = `⚠ This replaces ${toSel.value}'s current start: ${label}`;
      } else {
        warn.hidden = true;
      }
    };
    fromSel.addEventListener("change", refresh);
    toSel.addEventListener("change", refresh);
    refresh();

    const actions = document.createElement("div");
    actions.className = "lm-dialog-actions";
    const cancel = document.createElement("button");
    cancel.className = "small ghost";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => close(null));
    const ok = document.createElement("button");
    ok.className = "small gold";
    ok.textContent = "Chain";
    ok.addEventListener("click", () => close({ fromSeq: fromSel.value, toSeq: toSel.value }));
    actions.append(cancel, ok);
    box.appendChild(actions);

    document.body.appendChild(backdrop);
    fromSel.focus();
  });
}
