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

/** Draw a frame. `viewCenter` re-centres the camera frame (the preview camera is
 * anchored at the arena centre by default). */
export function drawStage(canvas: HTMLCanvasElement, frame: PreviewFrame | null): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const f = fitWorld(canvas);

  // Background + arena outline.
  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = THEME.grid;
  ctx.lineWidth = 1;
  ctx.strokeRect(wx(0, f), wy(WORLD.h, f), WORLD.w * f.scale, WORLD.h * f.scale);

  // Faint centre grid lines.
  ctx.beginPath();
  ctx.moveTo(wx(WORLD.w / 2, f), wy(WORLD.h, f));
  ctx.lineTo(wx(WORLD.w / 2, f), wy(0, f));
  ctx.moveTo(wx(0, f), wy(WORLD.h / 2, f));
  ctx.lineTo(wx(WORLD.w, f), wy(WORLD.h / 2, f));
  ctx.stroke();

  if (!frame) {
    label(ctx, "no preview", canvas.width / 2, canvas.height / 2, THEME.grid, "center");
    return;
  }

  // Camera frame (pan + zoom around the arena centre).
  drawCameraFrame(ctx, f, frame);

  // Actors.
  for (const a of frame.actors) {
    if (!a.visible) continue;
    drawActor(ctx, f, a);
  }
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
  ctx.save();
  ctx.strokeStyle = THEME.camera;
  ctx.globalAlpha = 0.5 + Math.min(cam.shake / 16, 0.4);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(wx(left, f), wy(top, f), vw * f.scale, vh * f.scale);
  ctx.restore();
}

function drawActor(ctx: CanvasRenderingContext2D, f: Fit, a: PreviewActor): void {
  const x = wx(a.pos.x, f);
  const y = wy(a.pos.y, f);
  const isEcho = a.id === "echo" || a.id === "player";
  const color = isEcho ? THEME.echo : THEME.actor;

  // Walk path hint: a short line in the facing direction if walking.
  if (a.walking) {
    ctx.strokeStyle = THEME.path;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + a.facing.x * 26, y - a.facing.y * 26); // facing is Y-up
    ctx.stroke();
  }

  // Marker.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, isEcho ? 7 : 6, 0, Math.PI * 2);
  ctx.fill();
  if (a.walking) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Facing arrow (Y-up → screen Y-down).
  ctx.strokeStyle = THEME.facing;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + a.facing.x * 14, y - a.facing.y * 14);
  ctx.stroke();

  // Gesture pip.
  if (a.gesture) {
    ctx.fillStyle = THEME.camera;
    ctx.beginPath();
    ctx.arc(x + 9, y - 9, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Name label.
  label(ctx, a.id, x, y - 16, THEME.label, "center");
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
