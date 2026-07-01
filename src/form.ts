// The schema-driven form builder — A2's payoff.
//
// Given a beat, it renders an editable form: a `do` (verb) picker, then one input
// per field that verb uses. Each input's TYPE, DESCRIPTION, and ENUM come from the
// generated schema (schema.ts) where available, with the vocab map (vocab.ts)
// supplying verb→field relevance and the free-string enums the schema can't. Edits
// call back so the SceneDoc stays the one owner of state.
//
// The point: adding a field to a beat in the engine + regenerating the schema makes
// it appear here automatically (once the vocab map lists it for the verb) — no
// bespoke form code per field.

import { fieldMeta } from "./schema";
import { FIELD_ENUMS, fieldsForVerb, verbNames } from "./vocab";
import { actorIds, sfxIds } from "./assets";
import type { Beat } from "./scene";

/** Suggested id values for a field (from the game asset catalog), or [] for none.
 * These back a datalist so the writer can pick OR type (mods may use new ids). */
function suggestionsFor(verb: string, field: string): string[] {
  if (field === "actor" || field === "target") return actorIds();
  if (field === "id" && (verb === "play_sfx" || verb === "spawn_fx")) return sfxIds();
  return [];
}

/** Build an editable form for `beat`. `onChange` fires after any edit with the
 * updated beat (a fresh object). */
export function buildBeatForm(beat: Beat, onChange: (next: Beat) => void): HTMLElement {
  const root = document.createElement("div");
  root.className = "beat-form";

  const emit = (): void => onChange({ ...beat });

  // actor + verb are always shown. Actor is a datalist (pick a known id or type).
  root.appendChild(
    suggestRow(
      "actor",
      "Actor",
      beat.actor ?? "echo",
      actorIds(),
      (v) => {
        beat.actor = v;
        emit();
      },
      "Which actor this beat targets — echo, world, or a character id.",
    ),
  );

  root.appendChild(
    selectRow("do", "Do (verb)", beat.do, verbNames(), (v) => {
      beat.do = v;
      // Prune fields the new verb doesn't use, so the form stays honest.
      const keep = new Set(["actor", "do", ...fieldsForVerb(v)]);
      for (const k of Object.keys(beat)) {
        if (!keep.has(k)) delete beat[k];
      }
      onChange({ ...beat });
    }, "The action this beat performs."),
  );

  const fields = fieldsForVerb(beat.do);
  if (fields.length === 0) {
    const none = document.createElement("p");
    none.className = "form-none";
    none.textContent = "This verb takes no extra fields.";
    root.appendChild(none);
  }

  for (const field of fields) {
    root.appendChild(fieldRow(beat, beat.do, field, emit));
  }
  return root;
}

/** Render one field, choosing input type from the schema + vocab enums. */
function fieldRow(beat: Beat, verb: string, field: string, emit: () => void): HTMLElement {
  const meta = fieldMeta("BeatDef", field);
  const enumValues = FIELD_ENUMS[field] ?? meta.enumValues;
  const label = titleCase(field);
  const desc = meta.description || enumHint(field);
  const current = beat[field];

  // Id fields (actor/target/sfx) become datalist pickers when the catalog has
  // suggestions — pick a known id or type a new one.
  const suggestions = suggestionsFor(verb, field);
  if (suggestions.length > 0) {
    return suggestRow(
      field,
      label,
      typeof current === "string" ? current : "",
      suggestions,
      (v) => {
        if (v === "") delete beat[field];
        else beat[field] = v;
        emit();
      },
      desc,
    );
  }

  if (enumValues.length > 0) {
    return selectRow(
      field,
      label,
      typeof current === "string" ? current : enumValues[0],
      enumValues,
      (v) => {
        beat[field] = v;
        emit();
      },
      desc,
    );
  }
  if (meta.kind === "number") {
    return numberRow(field, label, typeof current === "number" ? current : undefined, (v) => {
      if (v === undefined) delete beat[field];
      else beat[field] = v;
      emit();
    }, desc);
  }
  // default: string (text, id, name, flag, speaker, preset, kind, …)
  return textRow(field, label, typeof current === "string" ? current : "", (v) => {
    if (v === "") delete beat[field];
    else beat[field] = v;
    emit();
  }, desc);
}

// ── small input builders ─────────────────────────────────────────────────────

function row(id: string, label: string, control: HTMLElement, desc: string): HTMLElement {
  const wrap = document.createElement("label");
  wrap.className = "form-row";
  wrap.htmlFor = `f-${id}`;
  const cap = document.createElement("span");
  cap.className = "form-label";
  cap.textContent = label;
  wrap.append(cap, control);
  if (desc) {
    const d = document.createElement("span");
    d.className = "form-desc";
    d.textContent = desc;
    wrap.appendChild(d);
  }
  return wrap;
}

function textRow(
  id: string,
  label: string,
  value: string,
  onInput: (v: string) => void,
  desc: string,
): HTMLElement {
  const input = document.createElement("input");
  input.id = `f-${id}`;
  input.type = "text";
  input.value = value;
  input.addEventListener("input", () => onInput(input.value));
  return row(id, label, input, desc);
}

function numberRow(
  id: string,
  label: string,
  value: number | undefined,
  onInput: (v: number | undefined) => void,
  desc: string,
): HTMLElement {
  const input = document.createElement("input");
  input.id = `f-${id}`;
  input.type = "number";
  input.step = "any";
  input.value = value === undefined ? "" : String(value);
  input.addEventListener("input", () => {
    const t = input.value.trim();
    onInput(t === "" ? undefined : Number(t));
  });
  return row(id, label, input, desc);
}

function selectRow(
  id: string,
  label: string,
  value: string,
  options: string[],
  onChange: (v: string) => void,
  desc: string,
): HTMLElement {
  const sel = document.createElement("select");
  sel.id = `f-${id}`;
  const opts = options.includes(value) ? options : [value, ...options];
  for (const o of opts) {
    const opt = document.createElement("option");
    opt.value = o;
    opt.textContent = o;
    if (o === value) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => onChange(sel.value));
  return row(id, label, sel, desc);
}

/** A text input backed by a datalist of `suggestions` — the writer picks a known
 * id or types a new one (mods may reference ids the game data doesn't list yet). */
function suggestRow(
  id: string,
  label: string,
  value: string,
  suggestions: string[],
  onInput: (v: string) => void,
  desc: string,
): HTMLElement {
  const input = document.createElement("input");
  input.id = `f-${id}`;
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
  const wrap = row(id, label, input, desc);
  wrap.appendChild(dl);
  return wrap;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function titleCase(field: string): string {
  return field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function enumHint(field: string): string {
  const e = FIELD_ENUMS[field];
  return e ? `one of: ${e.join(" | ")}` : "";
}
