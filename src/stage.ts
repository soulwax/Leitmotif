// The stage canvas — A4's payoff, and the whole point of the app.
//
// It draws a single `PreviewFrame` (from the headless engine core) onto a 2D
// canvas: each visible actor as a labelled marker with a facing arrow, the walk
// path they're on, and the camera frame that pans/zooms. Because the frames come
// from the game's own `scene_preview`, what the writer sees IS what the game plays.
//
// This is a renderer only — it takes a frame + a fit and paints. The transport
// (play/scrub) lives in main.ts and just hands it different frames.

import type { PreviewActor, PreviewFrame } from "./preview";

const THEME = {
  bg: "#0f0d15",
  grid: "#221e30",
  camera: "#75f0d6",
  path: "#4a4560",
  actor: "#d8b268",
  actorHidden: "#4a4560",
  echo: "#75f0d6",
  label: "#e8e2d6",
  facing: "#e8e2d6",
};

/** World bounds to fit into the canvas. The game arena is 3840×2160. */
const WORLD = { w: 3840, h: 2160 };
const VIEW = { w: 1600, h: 900 }; // the game's camera view size

interface Fit {
  scale: number;
  ox: number;
  oy: number;
  h: number;
}

/** Compute a letterboxed fit of the world into the canvas (world is Y-up; screen
 * is Y-down, so we flip Y). */
function fitWorld(canvas: HTMLCanvasElement): Fit {
  const cw = canvas.width;
  const ch = canvas.height;
  const scale = Math.min(cw / WORLD.w, ch / WORLD.h);
  const ox = (cw - WORLD.w * scale) / 2;
  const oy = (ch - WORLD.h * scale) / 2;
  return { scale, ox, oy, h: ch };
}

function wx(x: number, f: Fit): number {
  return f.ox + x * f.scale;
}
/** Y-up world → Y-down screen. */
function wy(y: number, f: Fit): number {
  return f.oy + (WORLD.h - y) * f.scale;
}

/** Map a browser click on the canvas to a world point (the inverse of the draw
 * math), so a writer places targets by pointing instead of typing coordinates.
 * Accounts for the CSS display size vs. the canvas's intrinsic pixel size, and
 * clamps to the arena. Returns integer world coords. */
export function screenToWorld(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  // CSS pixels → canvas pixels.
  const px = ((clientX - rect.left) / rect.width) * canvas.width;
  const py = ((clientY - rect.top) / rect.height) * canvas.height;
  const f = fitWorld(canvas);
  const worldX = (px - f.ox) / f.scale;
  const worldY = WORLD.h - (py - f.oy) / f.scale; // invert Y (Y-up world)
  return {
    x: Math.round(clamp(worldX, 0, WORLD.w)),
    y: Math.round(clamp(worldY, 0, WORLD.h)),
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Draw a frame onto the stage: a foggy field, the camera frame, and the actors.
 * The look echoes the game — warm intent (gold actors) in cool air (blue-grey
 * fog) — so the preview reads as a *scene*, not a scatter of dots. */
export function drawStage(canvas: HTMLCanvasElement, frame: PreviewFrame | null): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const f = fitWorld(canvas);
  const cw = canvas.width;
  const ch = canvas.height;

  // Fog field: a radial haze from the centre, darkening to the edges.
  const haze = ctx.createRadialGradient(cw / 2, ch * 0.46, ch * 0.1, cw / 2, ch / 2, ch * 0.95);
  haze.addColorStop(0, "#1b1826");
  haze.addColorStop(0.65, "#141019");
  haze.addColorStop(1, "#0d0b12");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, cw, ch);

  // Arena outline (soft) + faint centre cross.
  ctx.strokeStyle = THEME.grid;
  ctx.lineWidth = 1;
  ctx.strokeRect(wx(0, f), wy(WORLD.h, f), WORLD.w * f.scale, WORLD.h * f.scale);
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(wx(WORLD.w / 2, f), wy(WORLD.h, f));
  ctx.lineTo(wx(WORLD.w / 2, f), wy(0, f));
  ctx.moveTo(wx(0, f), wy(WORLD.h / 2, f));
  ctx.lineTo(wx(WORLD.w, f), wy(WORLD.h / 2, f));
  ctx.stroke();
  ctx.restore();

  if (!frame) {
    label(ctx, "no preview", cw / 2, ch / 2, THEME.grid, "center");
    return;
  }

  drawCameraFrame(ctx, f, frame);
  for (const a of frame.actors) {
    if (a.visible) drawActor(ctx, f, a);
  }

  // A whisper of vignette on top, so the eye settles toward the middle.
  const vig = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.35, cw / 2, ch / 2, ch * 0.85);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, cw, ch);
}

function drawCameraFrame(ctx: CanvasRenderingContext2D, f: Fit, frame: PreviewFrame): void {
  const cam = frame.camera;
  const zoom = cam.zoom || 1;
  const vw = VIEW.w / zoom;
  const vh = VIEW.h / zoom;
  const cx = WORLD.w / 2 + cam.pan.x;
  const cy = WORLD.h / 2 + cam.pan.y;
  const left = cx - vw / 2;
  const top = cy + vh / 2; // Y-up top edge
  const rx = wx(left, f);
  const ry = wy(top, f);
  const rw = vw * f.scale;
  const rh = vh * f.scale;
  ctx.save();
  ctx.strokeStyle = THEME.camera;
  ctx.globalAlpha = 0.45 + Math.min(cam.shake / 16, 0.4);
  ctx.lineWidth = 1.25;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(rx, ry, rw, rh);
  // Bright solid corner ticks (a viewfinder feel).
  ctx.setLineDash([]);
  ctx.lineWidth = 2;
  const t = Math.min(14, rw * 0.12);
  const corner = (cx: number, cy: number, dx: number, dy: number) => {
    ctx.beginPath();
    ctx.moveTo(cx + dx * t, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * t);
    ctx.stroke();
  };
  corner(rx, ry, 1, 1);
  corner(rx + rw, ry, -1, 1);
  corner(rx, ry + rh, 1, -1);
  corner(rx + rw, ry + rh, -1, -1);
  ctx.restore();
}

function drawActor(ctx: CanvasRenderingContext2D, f: Fit, a: PreviewActor): void {
  const x = wx(a.pos.x, f);
  const y = wy(a.pos.y, f);
  const isEcho = a.id === "echo" || a.id === "player";
  const color = isEcho ? THEME.echo : THEME.actor;
  const r = isEcho ? 7 : 6;

  // Soft lantern-like glow (warm gold / cool teal for Echo) so each actor reads
  // as a light in the fog rather than a flat dot.
  const glow = ctx.createRadialGradient(x, y, 1, x, y, 30);
  glow.addColorStop(0, hexA(color, 0.5));
  glow.addColorStop(0.5, hexA(color, 0.14));
  glow.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, 30, 0, Math.PI * 2);
  ctx.fill();

  // Walk path hint: a soft trail behind the direction of travel.
  if (a.walking) {
    ctx.strokeStyle = hexA(color, 0.35);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - a.facing.x * 22, y + a.facing.y * 22);
    ctx.lineTo(x, y);
    ctx.stroke();
    // motion ring
    ctx.strokeStyle = hexA(color, 0.6);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Marker: filled dot with a soft rim.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#0f0d15";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Facing arrow.
  ctx.strokeStyle = THEME.facing;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + a.facing.x * 15, y - a.facing.y * 15);
  ctx.stroke();

  // Gesture pip: a bright ember above the actor.
  if (a.gesture) {
    ctx.fillStyle = "#fff2cf";
    ctx.beginPath();
    ctx.arc(x + 10, y - 10, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Name label with a soft shadow for legibility over the fog.
  ctx.save();
  ctx.shadowColor = "#0d0b12";
  ctx.shadowBlur = 4;
  label(ctx, a.id, x, y - r - 8, THEME.label, "center");
  ctx.restore();
}

/** A hex colour with an alpha, as an rgba() string. */
function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  align: CanvasTextAlign,
): void {
  ctx.fillStyle = color;
  ctx.font = "11px 'Cascadia Code', Consolas, monospace";
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x, y);
}
