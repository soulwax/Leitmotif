// The shared modal scaffold used by every in-app dialog (prompt, confirm, chain).
// A centered box over a backdrop; closes on Escape, backdrop click, or an explicit
// close(value). Kept framework-free and single-purpose so any dialog reuses it.

export function buildDialogShell<T>(
  title: string,
  settle: (value: T | null) => void,
): { backdrop: HTMLElement; box: HTMLElement; close: (value: T | null) => void } {
  const backdrop = document.createElement("div");
  backdrop.className = "lm-dialog-backdrop";
  const box = document.createElement("div");
  box.className = "lm-dialog";
  backdrop.appendChild(box);

  const head = document.createElement("div");
  head.className = "lm-dialog-title";
  head.textContent = title;
  box.appendChild(head);

  let settled = false;
  function close(value: T | null): void {
    if (settled) return;
    settled = true;
    document.removeEventListener("keydown", onEscape);
    backdrop.remove();
    settle(value);
  }
  function onEscape(e: KeyboardEvent): void {
    if (e.key === "Escape") close(null);
  }
  document.addEventListener("keydown", onEscape);
  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) close(null);
  });

  return { backdrop, box, close };
}
