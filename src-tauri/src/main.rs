// Leitmotif — the thin Tauri shell.
//
// The app's only coupling to the game is the `choreo` CLI. These four commands
// are the single place the app runs it; the web UI calls them via `invoke`. The
// UI never spawns processes or knows the CLI's argument shape.
//
// Finding the binary: `CHOREO_BIN` env var if set, else `choreo` on PATH. A
// missing binary yields a clear error the UI surfaces (rather than a panic).

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::process::Command;

/// Resolve the `choreo` binary: `CHOREO_BIN` override, else `choreo` on PATH.
fn choreo_bin() -> String {
    std::env::var("CHOREO_BIN").unwrap_or_else(|_| "choreo".to_string())
}

/// Run `choreo <args>` and return stdout on success, or a combined error string.
/// stdout carries the payload (validation report, JSON timeline, schema); stderr
/// carries human messages. We return whichever is meaningful.
fn run_choreo(args: &[&str]) -> Result<String, String> {
    let output = Command::new(choreo_bin())
        .args(args)
        .output()
        .map_err(|e| format!("could not run `choreo` (set CHOREO_BIN or add it to PATH): {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();

    if output.status.success() {
        // Prefer stdout (the payload); fall back to stderr (e.g. validate's report).
        if stdout.trim().is_empty() {
            Ok(stderr)
        } else {
            Ok(stdout)
        }
    } else {
        // Non-zero exit: surface both streams so the UI shows the findings.
        let mut msg = stderr;
        if !stdout.trim().is_empty() {
            msg.push_str(&stdout);
        }
        if msg.trim().is_empty() {
            msg = format!("`choreo` exited with {}", output.status);
        }
        Err(msg)
    }
}

#[tauri::command]
fn choreo_validate(path: String) -> Result<String, String> {
    // validate prints its report to stderr and exits non-zero on errors; treat a
    // clean run as success and a findings run as an error the UI can display.
    match run_choreo(&["validate", &path]) {
        Ok(report) => Ok(report),
        Err(report) => Err(report),
    }
}

#[tauri::command]
fn choreo_validate_json(path: String) -> Result<String, String> {
    // --json always exits 0 and prints a JSON array; return stdout verbatim.
    run_choreo(&["validate", &path, "--json"])
}

#[tauri::command]
fn choreo_preview(
    path: String,
    sequence: String,
    fps: f32,
    seconds: f32,
) -> Result<String, String> {
    run_choreo(&[
        "preview",
        &path,
        &sequence,
        "--fps",
        &fps.to_string(),
        "--seconds",
        &seconds.to_string(),
    ])
}

#[tauri::command]
fn choreo_schema() -> Result<String, String> {
    run_choreo(&["schema"])
}

#[tauri::command]
fn choreo_assets() -> Result<String, String> {
    run_choreo(&["assets"])
}

#[tauri::command]
fn choreo_convert(input: String, output: String) -> Result<String, String> {
    run_choreo(&["convert", &input, &output])
}

/// A unique temp path in the OS temp dir with the given extension. Used to bridge
/// `choreo convert` (which is file-to-file) into in-memory load/save.
fn temp_path(ext: &str) -> std::path::PathBuf {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("leitmotif-{nanos}.{ext}"))
}

/// Load a scene file (`.toml` or `.json`) and return it as a JSON string — the
/// in-memory form the editor works with. Goes through `choreo convert` so it uses
/// the same validated, lossless path the game trusts.
#[tauri::command]
fn load_scene(path: String) -> Result<String, String> {
    let tmp = temp_path("json");
    let tmp_str = tmp.to_string_lossy().into_owned();
    run_choreo(&["convert", &path, &tmp_str])?;
    let json = std::fs::read_to_string(&tmp).map_err(|e| format!("read converted scene: {e}"));
    let _ = std::fs::remove_file(&tmp);
    json
}

/// Save an editor scene (JSON string) to `path`. If `path` ends in `.toml` the
/// JSON is converted to TOML for the game; a `.json` path is written as JSON.
#[tauri::command]
fn save_scene(path: String, json: String) -> Result<String, String> {
    let tmp = temp_path("json");
    let tmp_str = tmp.to_string_lossy().into_owned();
    std::fs::write(&tmp, &json).map_err(|e| format!("stage scene: {e}"))?;
    let result = run_choreo(&["convert", &tmp_str, &path]);
    let _ = std::fs::remove_file(&tmp);
    result.map(|_| format!("saved {path}"))
}

/// Export a scene to the game: **validate first, then write**. This is the
/// deliberate "publish to the game" act — it refuses to write a scene the game
/// couldn't play, so a writer can never break the running game from the editor.
/// On success returns a friendly confirmation; on validation failure returns the
/// human-readable findings (and writes nothing).
#[tauri::command]
fn export_scene(path: String, json: String) -> Result<String, String> {
    let tmp = temp_path("json");
    let tmp_str = tmp.to_string_lossy().into_owned();
    std::fs::write(&tmp, &json).map_err(|e| format!("stage scene for export: {e}"))?;

    // 1. Validate. `validate` exits non-zero (→ Err) if there are errors.
    let validation = run_choreo(&["validate", &tmp_str]);
    if let Err(findings) = validation {
        let _ = std::fs::remove_file(&tmp);
        return Err(format!("Not exported — the scene has problems:\n{findings}"));
    }

    // 2. Only now write to the game (TOML by extension).
    let result = run_choreo(&["convert", &tmp_str, &path]);
    let _ = std::fs::remove_file(&tmp);
    result.map(|_| format!("Exported to the game: {path}"))
}

/// Preview the *current* (possibly unsaved) editor scene: stage the JSON to a
/// temp file and run `choreo preview` on it, returning the ScenePreviewFrame JSON
/// timeline. This lets the stage reflect live edits without a save.
#[tauri::command]
fn preview_scene(
    json: String,
    sequence: String,
    fps: f32,
    seconds: f32,
) -> Result<String, String> {
    let tmp = temp_path("json");
    let tmp_str = tmp.to_string_lossy().into_owned();
    std::fs::write(&tmp, &json).map_err(|e| format!("stage scene for preview: {e}"))?;
    let result = run_choreo(&[
        "preview",
        &tmp_str,
        &sequence,
        "--fps",
        &fps.to_string(),
        "--seconds",
        &seconds.to_string(),
    ]);
    let _ = std::fs::remove_file(&tmp);
    result
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            choreo_validate,
            choreo_validate_json,
            choreo_preview,
            choreo_schema,
            choreo_assets,
            choreo_convert,
            load_scene,
            save_scene,
            export_scene,
            preview_scene,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Leitmotif");
}
