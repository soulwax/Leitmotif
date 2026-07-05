# Leitmotif

> A *leitmotif* is a short musical phrase that follows a character around — you
> hear it, and you know who just walked in. This is the scene-director for
> **EchoWarrior**: a desktop app for people who want to direct the game's cutscenes
> and storylines without learning what a "trigger" is, let alone editing one by hand.

The pitch, plainly: a writer opens Leitmotif, places actors on a stage, scrubs a
timeline, arranges beats, draws lines between scenes to say *this one, then that
one* — and watches a live preview that is not an approximation. It's the game's own
renderer, running headless. What you see is what ships. The writer never opens a
`.toml` file, and honestly, they never should have had to.

## The one architectural rule

Leitmotif does not touch game code. Not "tries not to" — *cannot*. It talks to
EchoWarrior through exactly three shipped artifacts and nothing else:

- **the `choreo` CLI** — `validate | convert | schema | preview | graph`, built from
  the game repo. Every read and write goes through it.
- **`choreography.schema.json`** — generated from the engine's own Rust types, so
  the app's forms and validation can't drift from what the game actually accepts.
- **`ScenePreviewFrame` JSON** — the headless timeline the app draws for live
  preview. No game engine is embedded here; the game does the math, Leitmotif draws
  the dots.

This is the whole reason the project stays sane. The game is free to change its
mind about anything; as long as the CLI and the schema still speak, Leitmotif keeps
working. It's a wall with three doors, and we are very strict about the doors.

## What it does today

The short version: you can author a complete storyline, folder to gold, without
writing a line.

**Edit a scene.** Open a file, see its sequences, click a beat, and edit it in a
form that only ever shows the fields that beat actually uses — the schema decides
what's relevant, so the form can't offer you a field the game will reject. Beats are
draggable cards on a node-graph timeline; drag to reorder, drop to move between
steps. Pick actor and sfx ids from a list fed by the game's real data instead of
typing them and hoping. Every edit flows through one document model (`SceneDoc`),
which is also the single place undo hangs its hat.

**Watch it.** A 2D stage renders the selected sequence — actors as glowing markers
with facing and walk hints, the camera frame panning and zooming — all from the
game's `choreo preview` on your *current, unsaved* scene. Edit a beat, the preview
rebuilds. Click the stage to place a beat's destination instead of typing
coordinates; the cursor turns to a crosshair to tell you it's listening.

**Ship it.** One gold button validates the scene and writes the game's
`choreography.toml` — but only if it's clean. An invalid scene is refused with
human-readable findings and nothing is written, which means the editor is
structurally incapable of breaking the running game. That was the point.

**Get proposed the next move.** This is the part I'm fond of. Leitmotif doesn't
leave a writer staring at a blank card — it proposes. A Tier-1 suggestion engine
(offline, no API key, no network) fans context out to pluggable providers, ranks
what comes back, and gives a slow or misbehaving provider exactly nothing to say, so
the floor never falls out. Every suggestion it makes is valid *by construction* — it
can only draw from the game's real vocabulary and ids — so accepting one can't
produce a scene the game won't play. It shows up as an add-beat picker that leads
with the natural next beat, a one-click *Suggested* chip, ready-made "insert a
moment" blocks, a Fix-it ribbon that turns each validator complaint into a button,
and snap-to-actor placement. There's a discoverable keyboard scheme over all of it,
and a `?` sheet so you don't have to remember it.

**Arrange the whole story.** Beyond single scenes, a folder of scenes is a graph.
Open a folder and the scenes become draggable cards; the arrows between them are the
real chains the game will follow, drawn by the game's own resolver so they can't
lie. Right-click to create, rename, duplicate, delete. Drag a handle off one card
onto another to chain them — "when *this* finishes, start *that*" — and Leitmotif
writes the trigger for you. Node positions live in a `.leitmotif/` sidecar next to
the scenes, so arranging your storyline never touches the game's data.

An **LLM tier** is designed but deliberately unbuilt: it drops in behind the same
provider seam the rules engine already uses. When it lands it reads its key from a
file you control, outside the repo — never one baked into the app. Until then, the
deterministic floor stands on its own, and it owes you nothing.

The remaining direction lives in `LEITMOTIV_DESIGN.md` (the visual bar we hold
ourselves to) and the scene-projects roadmap in the game repo.

## Build & run

```bash
npm install
# Dev — opens the window. Needs the choreo binary on PATH or CHOREO_BIN set:
CHOREO_BIN=../../target/debug/choreo.exe npm run tauri:dev
# Package a Windows installer:
npm run tauri:build
```

Leitmotif needs the game's `choreo` binary at runtime. Build it once in the game
repo (`cargo build --bin choreo`) and either put it on `PATH` or point `CHOREO_BIN`
at it. If the app opens but every button shrugs, this is why.

### VS Code

The shared launch config does the fiddly part for you. **Open the `tools/leitmotif`
folder** — not the game folder — and:

- **Press `F5`** → **▶ Leitmotif (dev)**: builds the `choreo` dependency and launches
  in dev mode with hot-reload. No debugger extension required; the green triangle
  just runs it.
- **`Ctrl+Shift+B`** → **leitmotif: dev (debug)** — the same thing from the build
  side. *Run Task…* also offers the release installer, the frontend build, and a
  plain "run the already-built exe."
- To step through the Rust shell, pick a `Leitmotif: debug Rust shell` config (LLDB
  or MSVC) from Run and Debug.

Every launch sets `CHOREO_BIN` to `../../target/debug/choreo.exe` automatically, so
you don't have to think about it.

> Opening the **game's** root folder and pressing `F5` still runs the game.
> Leitmotif's play button is a different button in a different folder. They don't
> fight.

## Identity

The icon is a lantern flame in fog — the game's recurring motif, warm gold with a
calm teal-white heart. The preview stage carries the same tone on purpose: actors
glow like lanterns in cool haze, so a writer looks at the canvas and sees a *scene*,
not a scatter plot.

## Prerequisites

- Node ≥ 18 and npm (the web frontend).
- The Rust toolchain and Tauri prerequisites (WebView2 on Windows) for the shell.
- The `choreo` binary from the EchoWarrior repo — on `PATH` or via `CHOREO_BIN`.

## Layout

```
leitmotif/
  index.html
  package.json            web frontend (Vite + TypeScript)
  src/                    the web UI — where most of the app lives
    scene.ts              SceneDoc: the one owner of a scene's edit state + undo
    bridge.ts             typed wrappers over the Tauri commands (the only I/O path)
    story.ts              the folder-level story-graph canvas
    suggest.ts            the Tier-1 suggestion engine + provider seam
  src-tauri/              the thin Rust/Tauri shell
    src/main.rs           bridge commands: run choreo, read/write files
    tauri.conf.json
  contract/               bundled contract artifacts (copied from the game repo)
    choreography.schema.json
```

If you're reading the source for the first time, start at `scene.ts` and `bridge.ts`
— everything else is a consumer of those two.
