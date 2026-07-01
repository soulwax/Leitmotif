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

- **A2 (done):** select a sequence → see its **steps and beats**, click a beat →
  edit it in a **schema-driven form**. The form shows only the fields that beat's
  verb uses, with types/descriptions read from the generated
  `choreography.schema.json` and enums from a small beat-vocabulary map
  (`src/vocab.ts`). Edits route through `SceneDoc`. **Finding:** the schema drives
  field *metadata* well (types, descriptions, and — for triggers/wait_for — whole
  variant sets), but the engine's free-string beat fields (`do`, `ease`,
  `direction`, `from`) aren't enumerated in the schema, so a curated vocab map
  supplies verb→field relevance + those enums. That map could later move into the
  schema via `schemars` attributes (a cheap game-crate change).

- **A3 (done):** the **node-graph timeline** — a sequence is drawn as a
  horizontal run of steps, each holding its beats as **draggable cards**
  (parallel lanes). Drag a beat to reorder it within a step or move it to another
  step; add/delete beats and steps; reorder steps. Sequence **chaining** is shown
  in the list (`↳ after X` / `→ Y`) from `on_sequence_finished` triggers. All
  mutations go through structured `SceneDoc` ops (add/remove/move step + beat), so
  the model stays the single owner of state (and the one seam for undo, A-later).

- **A4 (done):** the **live preview** — a 2D stage canvas that renders the
  selected sequence and a **transport** (play / scrub / rebuild). Actors appear as
  labelled markers with facing arrows, walk hints, visibility, and the camera
  frame pans/zooms — all from the game's own headless `scene_preview` (via a new
  `preview_scene` bridge command that runs `choreo preview` on the *current,
  possibly unsaved* scene). Editing a beat rebuilds the preview. This is the
  keystone: **what the writer sees is what the game plays**, with no game engine
  embedded. Verified: `tsc` ✓, `cargo check` ✓, and the JSON-scene →
  `choreo preview` → frames pipeline (e.g. Eve enters from off-screen and stops at
  her mark over 138 frames).

- **A6 (done):** **pick ids, never type them.** Actor, target, and sfx fields in
  the beat form become datalist pickers fed by the game's real data — via a new
  `choreo assets` command (dumps actor + sfx ids as JSON) surfaced through a
  `choreo_assets` bridge command and loaded once into an assets store. Writers
  pick a known id or type a new one (mods may use ids the data doesn't list yet),
  so scenes stay valid without a writer memorizing ids.

Next: **A5** richer transport/timeline sync, **A7** export, **A8** packaging. See
`LEITMOTIV_DESIGN.md` for the visual design brief (and the bar we hold ourselves
to). See also `TODO_CHOREO_GUI.md` in the game repo for the roadmap.

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
