// Typed wrappers over the Tauri bridge commands (src-tauri/src/main.rs).
//
// The app talks to the game ONLY through the `choreo` CLI. These wrappers are the
// single place the UI calls it, so the rest of the app never spawns processes or
// knows about the CLI. When running web-only (no Tauri), `invoke` is undefined and
// the calls report a friendly "run inside Tauri" message instead of crashing.

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
