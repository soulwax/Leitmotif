// Typed wrappers over the Tauri bridge commands (src-tauri/src/main.rs).
//
// The app talks to the game ONLY through the `choreo` CLI. These wrappers are the
// single place the UI calls it, so the rest of the app never spawns processes or
// knows about the CLI. When running web-only (no Tauri), `invoke` is undefined and
// the calls report a friendly "run inside Tauri" message instead of crashing.

import type { Finding } from "./suggest";
import { buildStoryGraph, type StoryGraph, type StoryGraphJson } from "./graph";

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

async function getInvoke(): Promise<Invoke | null> {
  // Tauri v2 exposes the API as an installed module. Import lazily so a pure web
  // `vite dev` (no Tauri) still loads the UI.
  try {
    const mod = await import("@tauri-apps/api/core");
    return mod.invoke as Invoke;
  } catch {
    return null;
  }
}

export interface BridgeResult {
  ok: boolean;
  output: string;
}

async function call(cmd: string, args: Record<string, unknown>): Promise<BridgeResult> {
  const invoke = await getInvoke();
  if (!invoke) {
    return {
      ok: false,
      output:
        "Not running inside Tauri — bridge commands need the desktop shell.\n" +
        "Run `npm run tauri:dev` (with the choreo binary on PATH or CHOREO_BIN set).",
    };
  }
  try {
    const output = await invoke<string>(cmd, args);
    return { ok: true, output };
  } catch (e) {
    return { ok: false, output: String(e) };
  }
}

/** Deep-validate a scene file; returns the human-readable findings report. */
export function validate(path: string): Promise<BridgeResult> {
  return call("choreo_validate", { path });
}

/** Structured findings for the Fix-it ribbon. Runs `choreo validate <path> --json`
 * via the existing bridge and parses the array. Returns [] if unavailable. */
export async function validateJson(path: string): Promise<Finding[]> {
  const r = await call("choreo_validate_json", { path });
  if (!r.ok) return [];
  try {
    const parsed = JSON.parse(r.output);
    return Array.isArray(parsed) ? (parsed as Finding[]) : [];
  } catch {
    return [];
  }
}

/** Scene `*.toml` file paths in a folder, for the Project loader. [] on any failure. */
export async function listSceneDir(folder: string): Promise<string[]> {
  const r = await call("list_scene_dir", { folder });
  if (!r.ok) return [];
  try {
    const parsed = JSON.parse(r.output);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/** The resolved story graph for a folder (via `choreo graph --json`). Empty graph on
 *  any failure — not in Tauri, choreo missing, non-zero exit, or parse error. */
export async function sceneGraph(folder: string): Promise<StoryGraph> {
  const r = await call("choreo_graph", { folder });
  if (!r.ok) return { nodes: [], edges: [] };
  try {
    return buildStoryGraph(JSON.parse(r.output) as StoryGraphJson);
  } catch {
    return { nodes: [], edges: [] };
  }
}

/** Headless scene timeline (JSON) for a sequence. */
export function preview(
  path: string,
  sequence: string,
  fps = 30,
  seconds = 8,
): Promise<BridgeResult> {
  return call("choreo_preview", { path, sequence, fps, seconds });
}

/** The generated JSON Schema (drives inspector forms + validation). */
export function schema(): Promise<BridgeResult> {
  return call("choreo_schema", {});
}

/** Actor + sfx ids from the game data (JSON), for the picker (see `choreo assets`). */
export function assets(): Promise<BridgeResult> {
  return call("choreo_assets", {});
}

/** Convert between TOML and JSON (by output extension). */
export function convert(input: string, output: string): Promise<BridgeResult> {
  return call("choreo_convert", { input, output });
}

/** Load a scene file (.toml/.json) as a JSON string (the editor's in-memory form). */
export function loadScene(path: string): Promise<BridgeResult> {
  return call("load_scene", { path });
}

/** Save an editor scene (JSON string) to `path` (.toml converts for the game). */
export function saveScene(path: string, json: string): Promise<BridgeResult> {
  return call("save_scene", { path, json });
}

/** The editor layout sidecar JSON for a folder ("" if absent or on any failure). */
export async function readLayout(folder: string): Promise<string> {
  const r = await call("read_layout", { folder });
  return r.ok ? r.output : "";
}

/** Persist the layout sidecar. Degrades to a failed BridgeResult (caller shows a
 *  non-blocking notice) — never throws. */
export function writeLayout(folder: string, json: string): Promise<BridgeResult> {
  return call("write_layout", { folder, json });
}

/** Delete a scene .toml file. Degrades to a failed BridgeResult on error. */
export function deleteSceneFile(path: string): Promise<BridgeResult> {
  return call("delete_scene_file", { path });
}

/** Export to the game: validates first, then writes. Refuses to write an invalid
 * scene (the returned error carries the human findings). */
export function exportScene(path: string, json: string): Promise<BridgeResult> {
  return call("export_scene", { path, json });
}

/** Preview the current (possibly unsaved) scene JSON: returns a JSON timeline of
 * ScenePreviewFrames for `sequence`. */
export function previewScene(
  json: string,
  sequence: string,
  fps = 30,
  seconds = 8,
): Promise<BridgeResult> {
  return call("preview_scene", { json, sequence, fps, seconds });
}

// ── native file dialogs (Tauri dialog plugin) ────────────────────────────────

const SCENE_FILTERS = [{ name: "Choreography scene", extensions: ["toml", "json"] }];

/** Native "open file" dialog. Returns the chosen path, or null if cancelled or
 * running web-only. */
export async function openSceneDialog(): Promise<string | null> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ multiple: false, filters: SCENE_FILTERS });
    return typeof picked === "string" ? picked : null;
  } catch {
    return null;
  }
}

/** Native "save file" dialog. Returns the chosen path, or null. */
export async function saveSceneDialog(defaultPath?: string): Promise<string | null> {
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const picked = await save({ filters: SCENE_FILTERS, defaultPath });
    return picked ?? null;
  } catch {
    return null;
  }
}
