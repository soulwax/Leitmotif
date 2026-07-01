// Beat vocabulary — which fields each beat verb actually uses, and the enums for
// the engine's free-string fields.
//
// WHY THIS EXISTS: the generated JSON Schema models `BeatDef` as one flat object
// with every field optional (the engine picks fields per `do` verb at runtime),
// and the string fields (`do`, `ease`, `direction`, `from`) are free strings — the
// engine validates them, the schema doesn't enumerate them. So the schema gives us
// each field's *type, description, and default*, but not "which fields does
// `walk_to` use" or "what are the legal `ease` values." This small curated map
// supplies exactly that missing relevance + enum layer.
//
// It mirrors `translate_beat` in the engine (src/game/choreography.rs). If a verb
// or field changes there, update it here. (Longer term this could move into the
// schema via schemars attributes — the A2 finding.)

export interface VerbSpec {
  /** Fields shown in the inspector for this verb, in order. `actor` is implicit. */
  fields: string[];
  /** One-line description of what the verb does (for the picker). */
  hint: string;
}

/** Enums for the engine's free-string fields (from the engine's parse fns). */
export const FIELD_ENUMS: Record<string, string[]> = {
  ease: ["linear", "in", "out", "in_out"],
  direction: ["up", "down", "left", "right"],
  from: ["north", "south", "east", "west", "nearest"],
};

/** The beat verbs the engine understands, grouped, with their relevant fields.
 * Field names match `BeatDef` in the schema so form values map straight back. */
export const BEAT_VERBS: Record<string, VerbSpec> = {
  // movement & pose
  walk_to: { fields: ["x", "y", "speed", "ease"], hint: "Walk to a world point." },
  walk_to_actor: {
    fields: ["target", "radius", "speed"],
    hint: "Walk to within a standoff of another actor.",
  },
  walk_in: {
    fields: ["from", "target", "radius", "x", "y", "speed"],
    hint: "Enter from off-screen on a view edge and walk in (A*).",
  },
  teleport_to: { fields: ["x", "y"], hint: "Instant placement, no animation." },
  face: { fields: ["direction"], hint: "Snap to a cardinal facing." },
  look_at: { fields: ["target", "turn_time"], hint: "Turn to face an actor/point." },
  idle: { fields: [], hint: "Stop and idle." },
  play_anim: { fields: ["name"], hint: "Play a named sprite animation once." },
  set_speed: { fields: ["speed"], hint: "Set the actor's walk speed." },

  // tiny gestures (sugar verbs each imply a gesture)
  gesture: { fields: ["name"], hint: "Play a named micro-gesture." },
  flinch: { fields: [], hint: "A small flinch." },
  nod: { fields: [], hint: "A nod." },
  headshake: { fields: [], hint: "A head shake." },
  recoil: { fields: [], hint: "A recoil." },
  hop: { fields: [], hint: "A hop." },
  raise_lantern: { fields: [], hint: "Raise the lantern." },
  lower_lantern: { fields: [], hint: "Lower the lantern." },
  weight_shift: { fields: [], hint: "Shift weight." },
  breathe: { fields: [], hint: "A breath." },

  // staging
  show: { fields: [], hint: "Reveal the actor." },
  reveal: { fields: [], hint: "Reveal the actor (alias of show)." },
  hide: { fields: [], hint: "Hide the actor." },

  // camera (a world beat)
  camera: {
    fields: ["x", "y", "zoom", "shake", "duration"],
    hint: "Bounded camera nudge (pan/zoom/shake).",
  },
  wait: { fields: [], hint: "A pure pause (the step's duration times it)." },

  // expression, voice & world → shared commands
  say: { fields: ["text", "duration", "speaker"], hint: "Queue a spoken line." },
  queue_dialogue: { fields: ["text", "duration", "speaker"], hint: "Queue dialogue." },
  play_sfx: { fields: ["id"], hint: "Play a sound effect." },
  spawn_fx: { fields: ["id", "x", "y", "radius"], hint: "Spawn a transient VFX." },
  set_flag: { fields: ["flag"], hint: "Set a story flag." },
  set_weather: { fields: ["preset"], hint: "Change the weather preset." },
  grant_xp: { fields: ["amount"], hint: "Grant XP." },
  heal: { fields: ["amount"], hint: "Heal the player." },
  spawn_enemy: { fields: ["kind", "x", "y"], hint: "Spawn an enemy." },
};

/** All verb names, for the "do" picker. */
export function verbNames(): string[] {
  return Object.keys(BEAT_VERBS);
}

/** Fields to show for a verb (empty if unknown → show nothing but the verb). */
export function fieldsForVerb(verb: string): string[] {
  return BEAT_VERBS[verb]?.fields ?? [];
}
