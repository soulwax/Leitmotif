// The keyboard scheme — one binding table, one listener, one `?` cheat-sheet.
//
// WHY THIS EXISTS: a writer should be able to discover the whole tool from the
// keyboard without a manual. `installKeys` is the single source of truth for
// global shortcuts (folding in what used to be an ad-hoc Ctrl+S/O/Z/Y listener
// in main.ts) and doubles as the generator for the `?` overlay, so the list a
// writer sees can never drift from what's actually wired.

export interface KeyBinding {
  /** e.g. "space", "a", "shift+j", "ctrl+z", "?". Optional "ctrl+"/"shift+"
   * prefixes (in that order) plus a base key. "ctrl" matches Ctrl or Cmd. */
  combo: string;
  /** Shown in the cheat-sheet overlay. */
  label: string;
  run: () => void;
}

interface ParsedCombo {
  ctrl: boolean;
  shift: boolean;
  key: string; // lowercase base key, or a special token ("space", "enter", "escape")
}

function parseCombo(combo: string): ParsedCombo {
  const parts = combo.toLowerCase().split("+");
  let ctrl = false;
  let shift = false;
  let key = "";
  for (const part of parts) {
    if (part === "ctrl") ctrl = true;
    else if (part === "shift") shift = true;
    else key = part;
  }
  return { ctrl, shift, key };
}

/** True if `e` matches `parsed`. Letters compare case-insensitively via
 * `e.key.toLowerCase()`; a few named keys map to their `KeyboardEvent.key`. */
function matches(e: KeyboardEvent, parsed: ParsedCombo): boolean {
  const mod = e.ctrlKey || e.metaKey;
  if (parsed.ctrl !== mod) return false;
  if (parsed.shift !== e.shiftKey) return false;

  switch (parsed.key) {
    case "space":
      return e.key === " ";
    case "enter":
      return e.key === "Enter";
    case "escape":
      return e.key === "Escape";
    case "?":
      return e.key === "?";
    default:
      return e.key.toLowerCase() === parsed.key;
  }
}

/** True if the event originated from a place where the shortcut keys should
 * type instead of act — text inputs, textareas, and contenteditable regions. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** Format a combo string for display, e.g. "shift+j" -> "Shift+J", "?" -> "?". */
function formatCombo(combo: string): string {
  return combo
    .split("+")
    .map((part) => {
      if (part === "ctrl") return "Ctrl";
      if (part === "shift") return "Shift";
      if (part === "space") return "Space";
      if (part === "enter") return "Enter";
      if (part === "escape") return "Esc";
      if (part === "?") return "?";
      return part.toUpperCase();
    })
    .join("+");
}

let overlay: HTMLElement | null = null;

function closeOverlay(): void {
  if (!overlay) return;
  overlay.remove();
  overlay = null;
}

function openOverlay(bindings: KeyBinding[]): void {
  if (overlay) return;

  const backdrop = document.createElement("div");
  backdrop.className = "keys-overlay-backdrop";
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeOverlay();
  });

  const modal = document.createElement("div");
  modal.className = "keys-overlay";

  const head = document.createElement("div");
  head.className = "keys-overlay-head";
  const title = document.createElement("h2");
  title.textContent = "Keyboard shortcuts";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "small ghost keys-overlay-close";
  close.textContent = "✕";
  close.title = "Close (Esc)";
  close.addEventListener("click", () => closeOverlay());
  head.append(title, close);
  modal.appendChild(head);

  const list = document.createElement("div");
  list.className = "keys-overlay-list";
  for (const b of bindings) {
    const row = document.createElement("div");
    row.className = "keys-overlay-row";
    const combo = document.createElement("span");
    combo.className = "keys-overlay-combo";
    combo.textContent = formatCombo(b.combo);
    const label = document.createElement("span");
    label.className = "keys-overlay-label";
    label.textContent = b.label;
    row.append(combo, label);
    list.appendChild(row);
  }
  modal.appendChild(list);

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  overlay = backdrop;
}

function toggleOverlay(bindings: KeyBinding[]): void {
  if (overlay) closeOverlay();
  else openOverlay(bindings);
}

/** Install the one global keydown listener for the whole app. Bindings are
 * matched in order; the first match wins. Typing in an input/textarea/
 * contenteditable element is never intercepted. Also wires `?` to toggle a
 * cheat-sheet overlay listing every binding (including itself), and Escape to
 * close that overlay when it's open. */
export function installKeys(bindings: KeyBinding[]): void {
  window.addEventListener("keydown", (e) => {
    if (isTypingTarget(e.target)) return;

    if (overlay) {
      // While the cheat-sheet is open, only Escape and `?` are live — everything
      // else is suppressed so a stray shortcut can't fire behind the overlay.
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault();
        closeOverlay();
      }
      return;
    }

    for (const b of bindings) {
      if (matches(e, parseCombo(b.combo))) {
        e.preventDefault();
        b.run();
        return;
      }
    }
  });
}

/** Build the standard `?` binding that toggles the cheat-sheet for `bindings`
 * (including itself — call with the full, final array). */
export function helpBinding(bindings: KeyBinding[]): KeyBinding {
  return {
    combo: "?",
    label: "Toggle this help",
    run: () => toggleOverlay(bindings),
  };
}
