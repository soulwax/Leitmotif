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

- **A7 (done):** **Export to game** — the culminating act. One gold button
  validates the scene and, *only if it's clean*, writes the `choreography.toml`
  the game reads. An invalid scene is refused with human-readable findings and
  nothing is written, so the editor can never break the running game. This closes
  the loop: author in Leitmotif → export → the game plays it.
- **A8 (groundwork):** packaging is configured — `tauri.conf.json` builds an NSIS
  Windows installer with product identity, publisher, and description. `npm run
  tauri:build` produces the `.exe` once real artwork replaces the placeholder
  `icon.ico`. (Signing the installer is a later, machine-specific step.)

- **Design (done):** the **Studio** visual design is live — the app now wears the
  game's dark-fantasy, lantern-in-fog identity. Three columns (Sequences ·
  stage-over-timeline · Inspector), Instrument Sans for UI, Newsreader italic for
  the writer's prose, Space Mono for the technical bits; gold-gradient actions, a
  foggy radial stage with a live-preview pulse and a "Now" readout, actor-coloured
  beat glyphs on the timeline, and an autosave validation ribbon. The reference
  mockup lives in `design/design-reference.html`; the port is a pure re-skin —
  every logic seam (SceneDoc, timeline, forms, stage, trigger, preview) is
  unchanged. A dev-only `window.__lmLoad(json)` seam (stripped from production
  builds) lets the UI be driven headlessly for visual checks.

- **Polish (ongoing):**
  - **Place by pointing** — click the stage to set a selected beat's destination
    (walk_to, teleport_to, walk_in, spawn_*), so a writer never types coordinates.
    The cursor turns to a crosshair when a placeable beat is selected.
  - **Undo / redo** — `Ctrl+Z` / `Ctrl+Y` (and toolbar buttons), history recorded
    at the single `SceneDoc.edit` seam, so every structural change is reversible.
  - **Trigger editor** — choose *what starts a sequence* from a friendly,
    schema-driven dropdown ("After N seconds", "When an enemy dies", "After
    another sequence"…) with the right fields for each kind (mode dropdown,
    sequence-id suggestions, numbers). Updates the chaining edges + preview live;
    fully undoable. This makes the whole authoring surface editable — a writer can
    build a scene's beats *and* decide when it plays, without touching data.

- **Smart authoring aids (Layer 2A — done):** Leitmotif proposes the next move
  instead of leaving a writer facing a blank card. A **Tier-1 suggestion engine**
  (`src/suggest.ts`) fans context out to pluggable `SuggestionProvider`s, then
  merges, de-dupes, ranks by confidence, and isolates each provider behind a
  timeout — so a slow or throwing provider simply contributes nothing. The shipped
  `RuleProvider` (`src/rules.ts`) is **deterministic, offline, and needs no API
  key**; every suggestion it makes is **valid by construction** (it draws only from
  the beat vocabulary in `src/vocab.ts` and the actor/sfx ids the game reports), and
  every one applies through `SceneDoc`, so it's a single undoable step. It powers
  five surfaces:
  - **Action-picker add-beat** — the timeline's `+ beat` opens a picker whose top
    rows are the natural next beats for that step, over the full verb list.
  - **✦ Suggested chip** — one click in the inspector applies the best next beat.
  - **Insert a moment** — ready-made multi-beat blocks (two characters meet and
    speak, someone walks off, a beat of silence).
  - **Fix-it / Fix-all ribbon** — the validation area turns each fixable finding
    from `choreo validate --json` into a one-click fix (qualify a bare reference,
    retarget a dangling chain); unfixable findings still show as plain text.
  - **Snap-to-actor** — placing a beat near a character offers "Beside X" instead
    of a raw coordinate.

  A **discoverable keyboard scheme** covers the whole loop (`space` play, `a`
  add-beat, `enter` accept the suggestion, `j`/`k` move, `x` delete, `f`/`shift+f`
  fix, `ctrl+z`/`ctrl+y` undo/redo) with a **`?` cheat-sheet** listing every
  binding. Shortcuts are suppressed while typing in a field.

  An **LLM tier is a future, opt-in drop-in** behind the same `SuggestionProvider`
  seam — nothing about it is built or required today; the rules-only floor stands on
  its own with no network and no key. When it lands, it will read its key from a
  user-managed, git-ignored file outside the repo (or the OS keychain), never a
  key baked into the app.

Remaining polish lives in `LEITMOTIV_DESIGN.md` (the visual design brief and the
bar we hold ourselves to) and `TODO_CHOREO_GUI.md` in the game repo (the roadmap).

## Build & run

```bash
npm install
# Dev (opens the window; needs the choreo binary on PATH or CHOREO_BIN set):
CHOREO_BIN=../../target/debug/choreo.exe npm run tauri:dev
# Package a Windows installer:
npm run tauri:build
```

Leitmotif needs the game's `choreo` binary at runtime — build it once in the game
repo with `cargo build --bin choreo`, then point `CHOREO_BIN` at it (or put it on
`PATH`).

### VS Code

Shared commands ship in `.vscode/`. **Open the `tools/leitmotif` folder** (not the
game folder) in VS Code, and:

- **Just press `F5`** → **▶ Leitmotif (dev)** — builds the `choreo` dependency and
  launches the app in dev mode (hot-reload UI). No debugger extension needed; the
  green play button just runs it. (`▶ Leitmotif (release exe)` runs an
  already-built exe instead.)
- **Run Build Task** (`Ctrl+Shift+B`) → **leitmotif: dev (debug)** — same launch
  from the build side.
- **Terminal → Run Task…** also offers: *build release (installer)*, *build
  frontend*, *build choreo (dependency)*, *run release exe*.
- To **step through the Rust shell**, pick the `Leitmotif: debug Rust shell`
  configs (LLDB or MSVC) from the Run and Debug dropdown. Recommended extensions
  are suggested via `.vscode/extensions.json`.

Every task/launch sets `CHOREO_BIN` to `../../target/debug/choreo.exe`
automatically, so the app finds the game's CLI without extra setup.

> The **game's** own `F5` (open the EchoWarrior root folder) still runs the game —
> Leitmotif's play button is separate, active only when this folder is open.

## Identity

Leitmotif's icon is a **lantern flame in the fog** — the game's recurring visual
motif, warm gold with a calm teal-white heart. It's authored as
`src-tauri/icons/leitmotif-source.svg` and generated with `npm run tauri icon`.
The preview stage carries the same tone: actors glow like lanterns in cool haze,
so the writer sees a *scene*, not a scatter of dots.

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
