# Leitmotif — Design Prompt / Blueprint

> A prompt you can hand to Claude (or any design tool) to generate real visual
> mockups for the Leitmotif desktop app. It describes *what the app is, who it's
> for, and how it must behave* — not a final pixel spec. Bring your own art
> direction; this is the brief.

---

## One-paragraph brief

Design a **Windows desktop application called Leitmotif**: a scene director for a
2D dark-fantasy action game (*EchoWarrior*). Its users are **non-technical
writers and storytellers**, not programmers. They compose cinematic "scenes" —
characters walking on, turning to speak, a camera leaning in, a companion entering
from off-screen — by arranging **beats on a timeline** and **nodes on a canvas**,
then watch a **live 2D preview** of exactly what the game will play. They must
never see JSON, TOML, or code. The feeling should be closer to a film/animation
timeline tool (think a gentle, approachable Premiere/Spline) than to a code
editor.

## Who it's for

- Writers and narrative designers with **zero programming background**.
- They think in *scenes and story beats*, not data structures.
- Success = a writer who has never seen a curly brace can stage a companion
  walking in and speaking, preview it, and save it — in minutes, unafraid.

## The mental model to make visible

The underlying structure (make it feel natural, don't expose the jargon):

- A **Scene** contains **Sequences** (named story moments, e.g. "Eve's entrance").
- A Sequence plays as **Steps**, one after another (a timeline, left → right).
- Each Step fires **Beats** that happen *at the same time* (parallel lanes/nodes).
- A Beat is a single action by one actor: *walk here, face them, raise the
  lantern, nudge the camera, say a line.*
- A Sequence has a **Trigger** — what starts it (on a mode, an event, a dialogue
  line, or manually).

## Core screens / regions to mock

1. **Scene browser / open-save** — pick or create a scene; clear "unsaved" state.
2. **Sequence list** — the scene's sequences, each with a friendly summary (how
   many steps/beats, what triggers it) and its note.
3. **Timeline + node canvas (the heart)** — the selected sequence as a horizontal
   run of Steps; within each Step, the parallel Beats shown as draggable
   cards/nodes. Reorder steps; add/remove beats; connect sequences that chain
   (one sequence starts another).
4. **Stage / live preview** — a 2D top-down canvas showing the actors at the
   current scrub time: little character markers with names, facing arrows, walk
   paths, visibility, and a camera frame that pans/zooms. A **transport bar**
   (play, pause, scrub) drives it. This preview is computed from the real engine,
   so it is truthful.
5. **Beat inspector** — when a beat is selected, a small form of *only the fields
   that beat needs* (e.g. "Walk to" shows a destination + speed + easing;
   "Say" shows the line + who speaks). Plain-language labels, helpful hints,
   dropdowns for choices. No raw field names, no JSON.
6. **Asset picker** — choose actors, sounds, and other sequences from friendly
   lists (never typed ids).
7. **Validation ribbon** — gentle, human error messages ("Eve has no destination
   to walk to") surfaced inline, not a stack trace.

## Interactions that matter

- **Drag** to reorder steps and to move beats between parallel lanes.
- **Click an actor on the stage** to set where they walk (no typing coordinates).
- **Scrub the timeline** and watch the stage update live.
- **Pick, don't type**: verbs, actors, edges, easings are dropdowns/chips.
- **Undo/redo** everywhere; autosave-friendly "unsaved changes" affordance.

## Tone & art direction

- **Dark-fantasy, introspective, calm.** The game is somber and shadow-themed
  (not comedic, not neon). Warm gold accents against cool blue-grey, like a
  lantern in fog. (Sample palette: bg `#14121a`, panels `#1e1b28`, ink `#e8e2d6`,
  gold `#d8b268`, teal accent `#75f0d6`.)
- Typography: a clean humanist sans for UI; a monospace only for the tiny
  technical bits (sequence ids), never for the writer's prose.
- Generous spacing, soft rounded panels, low visual noise. It should feel like a
  quiet studio, not a control room.
- Avoid anything that reads as "developer tool": no code panes, no bracket-heavy
  text, no dense property grids.

## Hard constraints (must hold in any design)

- **Non-techies never see JSON/TOML.** Those are internal only.
- **The stage preview is authoritative** — it reflects exactly what the game
  plays (it's computed by the game's own logic), so treat it as the source of
  truth the writer trusts.
- **Windows desktop app** (Tauri + web UI). Assume a resizable window, ~1200×800
  default, but design responsively.
- **Every editable value comes from data** the app already knows (the beat
  vocabulary + a machine-readable schema), so forms and pickers can be generated
  rather than hand-built. Design the *shapes* (a field form, a chip picker) to be
  reusable across many beat types.

## Deliverables to ask the design tool for

1. The main window at rest with a scene open (all regions visible).
2. The timeline + node canvas mid-edit (a step selected, beats as cards).
3. The stage/live-preview with the transport bar, an actor mid-walk-in.
4. The beat inspector for two different beats (e.g. "Walk to" and "Say") to show
   how the same form shape adapts.
5. An empty/first-run state that invites a nervous non-technical user in.
6. A light and a dark variant (dark is primary).

## What NOT to design (out of scope for now)

- Editing game data other than scenes (dialogue text, stats, sprites).
- Multi-user collaboration.
- Mobile/tablet layouts.

---

*Context for the curious: Leitmotif authors the game's "choreography" contract and
talks to the game only through a small CLI + a generated JSON schema — so the UI
can be largely generated from data. But the writer should feel none of that; they
should feel like a director.*
