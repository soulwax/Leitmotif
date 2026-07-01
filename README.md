# Leitmotif

> A *Leitmotif* is a recurring, deliberately-composed theme woven through a work.
> This is the scene-director for **EchoWarrior** — a desktop app that lets
> non-technical writers create intricate movies and storylines by placing actors,
> scrubbing a timeline, and arranging beats, then watch a **live preview** and
> save scenes the game plays verbatim.

Leitmotif is a **Tauri + web** app. It authors the game's *choreography contract*
and never touches game code — it talks to the game only through three shipped
artifacts:

- **`choreo` CLI** — `validate | convert | schema | preview` (in the EchoWarrior repo).
- **`choreography.schema.json`** — generated from the engine's Rust types; drives
  the app's inspector forms and validation.
- **`ScenePreviewFrame` JSON** — the headless scene timeline the app renders for
  live preview (no game engine embedded).

See the design spec in the game repo:
`docs/superpowers/specs/2026-06-30-choreography-gui-app-design.md`, and the living
roadmap `TODO_CHOREO_GUI.md`.

## Status: A1 — open / save / list / validate

- **A0 (done):** Tauri shell + bridge commands (`validate`, `convert`, `preview`,
  `schema`) over the `choreo` CLI, and a bundled `choreography.schema.json`.
- **A1 (done):** a real editing loop — **open** a scene file (native dialog),
  see its **sequences** listed with step/beat/trigger summaries, **save** it back
  (`.toml` for the game or `.json`), and a **validation panel** showing human
  errors from `choreo validate`. Adds `load_scene`/`save_scene` bridge commands
  and the `SceneDoc` document model (the single owner of edit state + dirty
  tracking). Verified: Rust `cargo check` ✓, TypeScript `tsc` ✓, the
  `choreo convert` JSON matches the document model.

Next: **A2** schema-driven beat inspector, **A3** node-graph editor, **A4** actor
canvas + live preview, **A5** timeline, **A6** asset browser, **A7** export,
**A8** packaging.

## Layout

```
leitmotif/
  package.json            web frontend (Vite + TypeScript)
  index.html
  src/                    web UI (TS)
    main.ts               A0: exercises the four bridge commands
    bridge.ts             typed wrappers over the Tauri commands
  src-tauri/              the thin Rust/Tauri shell
    Cargo.toml
    tauri.conf.json
    src/main.rs           bridge commands: run `choreo`, read schema
  contract/               bundled contract artifacts (copied from the game repo)
    choreography.schema.json
  SUBMODULE_SETUP.md      how to push + attach this as a git submodule
```

## Prerequisites

- Node ≥ 18 and npm (for the web frontend).
- The Rust toolchain + Tauri prerequisites (WebView2 on Windows) for the shell.
- The `choreo` binary from the EchoWarrior repo on `PATH`, or its path set via the
  `CHOREO_BIN` env var (see `src-tauri/src/main.rs`).

## Develop

```bash
npm install
npm run tauri:dev     # once @tauri-apps/cli is installed (see package.json)
# or, web-only preview of the UI shell:
npm run dev
```

A0's success check: the app window opens, "Validate stock scene", "Preview
sequence", and "Show schema" buttons return real output from the `choreo` CLI.
