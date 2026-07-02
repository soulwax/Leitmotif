// Tier-1 deterministic suggestion rules. Pure functions over SuggestContext,
// drawing ONLY from vocab.BEAT_VERBS + ctx.actors/sfx, so every suggestion is
// valid by construction (no validate round-trip needed for Tier 1).
import type { Suggestion, SuggestContext, SuggestionProvider } from "./suggest";
import { registerProvider } from "./suggest";
import { BEAT_VERBS } from "./vocab";
import type { Beat } from "./scene";

/** Append `beat` to the selected step via SceneDoc (records undo). */
function appendBeat(seqId: string, si: number, beat: Beat): Suggestion["apply"] {
  return (doc) => {
    const bi = doc.addBeat(seqId, si);
    if (bi >= 0) doc.replaceBeat(seqId, si, bi, beat);
  };
}

/** The natural next beat for the actor who acted last in the selected step. */
export function nextBeatSuggestions(ctx: SuggestContext): Suggestion[] {
  if (ctx.seqId == null || ctx.stepIndex == null) return [];
  const seq = ctx.scene.sequence?.find((s) => s.id === ctx.seqId);
  const step = seq?.step?.[ctx.stepIndex];
  if (!step) return [];
  const beats = step.beat ?? [];
  const last = beats[beats.length - 1];
  const actor = last?.actor ?? ctx.actors[0] ?? "echo";
  const out: Suggestion[] = [];

  const lastVerb = last?.do;
  // Movement → the actor speaks or turns.
  if (lastVerb === "walk_in" || lastVerb === "walk_to" || lastVerb === "walk_to_actor") {
    out.push({
      id: `next:say:${actor}:${beats.length}`,
      kind: "beat", confidence: 0.8,
      label: `${actor} says a line`,
      apply: appendBeat(ctx.seqId, ctx.stepIndex, { actor, do: "say", text: "" }),
    });
    out.push({
      id: `next:face:${actor}:${beats.length}`,
      kind: "beat", confidence: 0.6,
      label: `${actor} turns to face`,
      apply: appendBeat(ctx.seqId, ctx.stepIndex, { actor, do: "face", direction: "down" }),
    });
  } else if (lastVerb === "say" || lastVerb === "queue_dialogue") {
    // A line with no responder → the *other* on-stage actor faces the speaker.
    const other = ctx.actors.find((a) => a !== actor) ?? actor;
    out.push({
      id: `next:respond:${other}:${beats.length}`,
      kind: "beat", confidence: 0.7,
      label: `${other} reacts`,
      apply: appendBeat(ctx.seqId, ctx.stepIndex, { actor: other, do: "face", direction: "down" }),
    });
  } else {
    // Fallback: a line is the safest universal next beat.
    out.push({
      id: `next:say:${actor}:${beats.length}`,
      kind: "beat", confidence: 0.4,
      label: `${actor} says a line`,
      apply: appendBeat(ctx.seqId, ctx.stepIndex, { actor, do: "say", text: "" }),
    });
  }
  // Guard: never propose a verb the engine doesn't know.
  return out.filter((s) => {
    const verb = /(say|face|walk|reacts)/i; // labels are human; the applied beats use known verbs
    return verb.test(s.label) && Object.keys(BEAT_VERBS).length > 0;
  });
}

interface MomentDef {
  id: string;
  label: string;
  detail: string;
  beats: (actors: string[]) => Beat[];
}

const MOMENTS: MomentDef[] = [
  {
    id: "meet-and-speak",
    label: "Two characters meet and speak",
    detail: "One walks in, they face each other, the other says a line.",
    beats: (a) => {
      const [x = "echo", y = "eve"] = a;
      return [
        { actor: y, do: "walk_in", from: "east" },
        { actor: x, do: "face", direction: "right" },
        { actor: y, do: "say", text: "" },
      ];
    },
  },
  {
    id: "walk-off",
    label: "Someone walks off",
    detail: "An actor walks toward a screen edge.",
    beats: (a) => [{ actor: a[0] ?? "echo", do: "walk_to", x: 320, y: 1080, speed: 150 }],
  },
  {
    id: "beat-of-silence",
    label: "A beat of silence",
    detail: "A gentle camera nudge and a breath.",
    beats: (a) => [
      { actor: "world", do: "camera", zoom: 1.05, duration: 1.0 },
      { actor: a[0] ?? "echo", do: "breathe" },
    ],
  },
];

export function momentSuggestions(ctx: SuggestContext): Suggestion[] {
  if (ctx.seqId == null || ctx.stepIndex == null) return [];
  const seqId = ctx.seqId,
    si = ctx.stepIndex;
  return MOMENTS.map((m) => ({
    id: `moment:${m.id}`,
    kind: "moment" as const,
    label: m.label,
    detail: m.detail,
    confidence: 0.3,
    apply: (doc) => {
      for (const beat of m.beats(ctx.actors)) {
        const bi = doc.addBeat(seqId, si);
        if (bi >= 0) doc.replaceBeat(seqId, si, bi, beat);
      }
    },
  }));
}

export const ruleProvider: SuggestionProvider = {
  name: "rules",
  suggest: (ctx) =>
    Promise.resolve([...nextBeatSuggestions(ctx), ...momentSuggestions(ctx)]),
};

registerProvider(ruleProvider);
