// The trigger editor — chooses *what starts a sequence*.
//
// Like the beat inspector, it's schema-driven: the trigger kinds and their fields
// come from `ChoreoTrigger` in choreography.schema.json (via schema.ts), so new
// trigger kinds added to the engine appear here for free. A small map adds
// human-friendly labels and hints on top, because "After 150 seconds" reads
// better to a writer than "after_seconds".

import { triggerVariants } from "./schema";

export interface Trigger {
  kind: string;
  [field: string]: unknown;
}

/** Friendly label + one-line description per trigger kind. Anything not listed
 * falls back to the raw kind name — so the engine can add kinds without breaking. */
const TRIGGER_LABELS: Record<string, { label: string; hint: string }> = {
  always: { label: "Always (on start)", hint: "Fires as soon as it's allowed to." },
  manual: { label: "Manually (play_sequence)", hint: "Only starts when your logic or a dialogue line calls it." },
  after_seconds: { label: "After N seconds", hint: "Fires once the run passes this many seconds." },
  after_kills: { label: "After N kills", hint: "Fires once this many enemies have died." },
  at_level: { label: "At level", hint: "Fires when the player reaches this level." },
  on_mode: { label: "On game mode", hint: "Fires when the game enters this mode." },
  on_enemy_killed: { label: "When an enemy dies", hint: "Any enemy, or name one." },
  on_player_low_hp: { label: "When HP drops low", hint: "Fires at or below this HP fraction (0–1)." },
  on_level_up: { label: "On level-up", hint: "Fires when a level-up becomes available." },
  on_upgrade_picked: { label: "When an upgrade is picked", hint: "Any upgrade, or name one." },
  on_dialogue_line: { label: "On a dialogue line", hint: "Any speaker, or name one." },
  on_sequence_finished: { label: "After another sequence", hint: "Chains: fires when that sequence finishes." },
};

/** Plain-language label for a trigger kind (reuses the same vocab as the trigger
 *  editor). Falls back to the raw kind for an unknown one. Used by the chain dialog's
 *  overwrite warning so its copy matches the editor's. */
export function triggerKindLabel(kind: string): string {
  return TRIGGER_LABELS[kind]?.label ?? kind;
}

/** Field-specific input hints (labels + kind → suggestions handled by caller). */
const FIELD_LABEL: Record<string, string> = {
  seconds: "Seconds",
  count: "Kills",
  level: "Level",
  mode: "Mode",
  enemy_id: "Enemy id (optional)",
  fraction: "HP fraction (0–1)",
  upgrade_id: "Upgrade id (optional)",
  speaker: "Speaker (optional)",
  id: "Sequence id",
};

const MODE_VALUES = ["intro", "playing", "level_up", "paused", "victory", "game_over"];

/**
 * Build the trigger editor for a sequence.
 * @param trigger the current trigger (defaults to `{kind:"always"}`)
 * @param sequenceIds ids in the scene, to suggest for `on_sequence_finished`
 * @param onChange fires with the new trigger after any edit
 */
export function buildTriggerForm(
  trigger: Trigger | undefined,
  sequenceIds: string[],
  onChange: (next: Trigger) => void,
): HTMLElement {
  const current: Trigger = trigger ?? { kind: "always" };
  const variants = triggerVariants();
  const root = document.createElement("div");
  root.className = "trigger-form";

  // Kind picker.
  const kinds = variants.map((v) => v.kind);
  root.appendChild(
    selectRow(
      "trigger-kind",
      "Starts",
      current.kind,
      kinds,
      (kind) => {
        // Switching kind resets to just that kind's fields (defaults empty).
        onChange({ kind });
      },
      (k) => TRIGGER_LABELS[k]?.label ?? k,
      TRIGGER_LABELS[current.kind]?.hint ?? "",
    ),
  );

  // Fields for the chosen kind.
  const fields = variants.find((v) => v.kind === current.kind)?.fields ?? [];
  for (const field of fields) {
    root.appendChild(triggerFieldRow(current, field, sequenceIds, onChange));
  }
  return root;
}

function triggerFieldRow(
  trigger: Trigger,
  field: string,
  sequenceIds: string[],
  onChange: (next: Trigger) => void,
): HTMLElement {
  const label = FIELD_LABEL[field] ?? titleCase(field);
  const value = trigger[field];
  const emit = (v: unknown): void => {
    const next: Trigger = { ...trigger };
    if (v === "" || v === undefined) delete next[field];
    else next[field] = v;
    onChange(next);
  };

  if (field === "mode") {
    return selectRow(
      `trg-${field}`,
      label,
      typeof value === "string" ? value : MODE_VALUES[0],
      MODE_VALUES,
      (v) => emit(v),
      (v) => v,
      "",
    );
  }
  if (field === "id" && sequenceIds.length > 0) {
    return suggestRow(`trg-${field}`, label, str(value), sequenceIds, emit);
  }
  if (isNumberField(field)) {
    return numberRow(`trg-${field}`, label, typeof value === "number" ? value : undefined, emit);
  }
  return textRow(`trg-${field}`, label, str(value), emit);
}

function isNumberField(field: string): boolean {
  return field === "seconds" || field === "count" || field === "level" || field === "fraction";
}

// ── small input builders (kept local so the trigger editor is self-contained) ──

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function row(id: string, label: string, control: HTMLElement, hint: string): HTMLElement {
  const wrap = document.createElement("label");
  wrap.className = "form-row";
  wrap.htmlFor = id;
  const cap = document.createElement("span");
  cap.className = "form-label";
  cap.textContent = label;
  wrap.append(cap, control);
  if (hint) {
    const h = document.createElement("span");
    h.className = "form-desc";
    h.textContent = hint;
    wrap.appendChild(h);
  }
  return wrap;
}

function textRow(id: string, label: string, value: string, onInput: (v: string) => void): HTMLElement {
  const input = document.createElement("input");
  input.id = id;
  input.type = "text";
  input.value = value;
  input.addEventListener("input", () => onInput(input.value.trim()));
  return row(id, label, input, "");
}

function numberRow(
  id: string,
  label: string,
  value: number | undefined,
  onInput: (v: number | undefined) => void,
): HTMLElement {
  const input = document.createElement("input");
  input.id = id;
  input.type = "number";
  input.step = "any";
  input.value = value === undefined ? "" : String(value);
  input.addEventListener("input", () => {
    const t = input.value.trim();
    onInput(t === "" ? undefined : Number(t));
  });
  return row(id, label, input, "");
}

function selectRow(
  id: string,
  label: string,
  value: string,
  options: string[],
  onChange: (v: string) => void,
  optLabel: (v: string) => string,
  hint: string,
): HTMLElement {
  const sel = document.createElement("select");
  sel.id = id;
  const opts = options.includes(value) ? options : [value, ...options];
  for (const o of opts) {
    const opt = document.createElement("option");
    opt.value = o;
    opt.textContent = optLabel(o);
    if (o === value) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => onChange(sel.value));
  return row(id, label, sel, hint);
}

function suggestRow(
  id: string,
  label: string,
  value: string,
  suggestions: string[],
  onInput: (v: string) => void,
): HTMLElement {
  const input = document.createElement("input");
  input.id = id;
  input.type = "text";
  input.value = value;
  input.setAttribute("list", `dl-${id}`);
  input.autocomplete = "off";
  input.addEventListener("input", () => onInput(input.value.trim()));
  const dl = document.createElement("datalist");
  dl.id = `dl-${id}`;
  for (const s of suggestions) {
    const opt = document.createElement("option");
    opt.value = s;
    dl.appendChild(opt);
  }
  const wrap = row(id, label, input, "");
  wrap.appendChild(dl);
  return wrap;
}

function titleCase(field: string): string {
  return field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
