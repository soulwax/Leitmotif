// A minimal reusable context menu. One menu at a time, dismissed on outside-click,
// Escape, or selection, and clamped to the viewport. Mirrors the add-beat picker's
// lifecycle (timeline.ts): single-instance, deferred listeners, cleanup on every path.

export interface MenuItem {
  label: string;
  disabled?: boolean;
  run: () => void;
}

let openMenu: HTMLElement | null = null;
let menuCleanup: (() => void) | null = null;

export function closeContextMenu(): void {
  if (menuCleanup) menuCleanup();
  menuCleanup = null;
  if (openMenu) openMenu.remove();
  openMenu = null;
}

export function openContextMenu(x: number, y: number, items: MenuItem[]): void {
  closeContextMenu();

  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  for (const item of items) {
    const el = document.createElement("button");
    el.className = "ctx-menu-item";
    el.textContent = item.label;
    if (item.disabled) {
      el.disabled = true;
    } else {
      el.addEventListener("click", () => {
        closeContextMenu();
        item.run();
      });
    }
    menu.appendChild(el);
  }

  // Provisional position, then clamp AFTER mount so we can measure real size.
  menu.style.position = "fixed";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  const left = Math.max(4, Math.min(x, window.innerWidth - rect.width - 4));
  const top = Math.max(4, Math.min(y, window.innerHeight - rect.height - 4));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  openMenu = menu;

  // Defer listener registration so the click/contextmenu that opened it doesn't
  // immediately dismiss it.
  window.setTimeout(() => {
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
  }, 0);
  function onOutside(e: MouseEvent): void {
    if (!menu.contains(e.target as Node)) closeContextMenu();
  }
  function onEscape(e: KeyboardEvent): void {
    if (e.key === "Escape") closeContextMenu();
  }
  menuCleanup = () => {
    document.removeEventListener("mousedown", onOutside);
    document.removeEventListener("keydown", onEscape);
  };
}
