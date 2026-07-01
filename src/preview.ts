// The headless scene-preview timeline — the JSON shape emitted by
// `choreo preview` (game/scene_preview.rs `ScenePreviewFrame`). The stage canvas
// renders these frames; scrubbing picks the frame at a time.

import { previewScene } from "./bridge";

export interface P2 {
  x: number;
  y: number;
}

export interface PreviewActor {
  id: string;
  pos: P2;
  facing: P2;
  visible: boolean;
  walking: boolean;
  gesture: string | null;
}

export interface PreviewCamera {
  pan: P2;
  zoom: number;
  shake: number;
}

export interface PreviewFrame {
  t: number;
  actors: PreviewActor[];
  camera: PreviewCamera;
  active_sequences: number;
}

export interface PreviewResult {
  ok: boolean;
  frames: PreviewFrame[];
  error?: string;
}

/** Fetch the timeline for `sequence` from the current in-memory scene JSON. */
export async function fetchTimeline(
  sceneJson: string,
  sequence: string,
  fps = 30,
  seconds = 8,
): Promise<PreviewResult> {
  const r = await previewScene(sceneJson, sequence, fps, seconds);
  if (!r.ok) return { ok: false, frames: [], error: r.output };
  try {
    const frames = JSON.parse(r.output) as PreviewFrame[];
    return { ok: true, frames };
  } catch (e) {
    return { ok: false, frames: [], error: `bad preview JSON: ${e}` };
  }
}

/** The frame at or just before time `t` (frames are ascending in t). */
export function frameAt(frames: PreviewFrame[], t: number): PreviewFrame | null {
  if (frames.length === 0) return null;
  let lo = 0;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].t <= t) lo = i;
    else break;
  }
  return frames[lo];
}

/** Total duration of a timeline (t of the last frame). */
export function duration(frames: PreviewFrame[]): number {
  return frames.length ? frames[frames.length - 1].t : 0;
}
