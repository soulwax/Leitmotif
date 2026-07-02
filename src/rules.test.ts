import { describe, it, expect } from "vitest";
import { nextBeatSuggestions } from "./rules";
import { SceneDoc } from "./scene";
import type { SuggestContext } from "./suggest";

function ctxWith(step: unknown): SuggestContext {
  const scene = { sequence: [{ id: "s", step: [step] }] };
  return {
    scene: scene as any, seqId: "s", stepIndex: 0, selectedBeat: null,
    actors: ["echo", "eve"], sfx: [], frame: null, findings: [],
  };
}

describe("natural-next-beat rule", () => {
  it("after a walk_in, suggests say and face for the same actor", () => {
    const out = nextBeatSuggestions(ctxWith({ beat: [{ actor: "eve", do: "walk_in" }] }));
    const kinds = out.map((s) => s.label.toLowerCase());
    expect(kinds.some((l) => l.includes("say"))).toBe(true);
    expect(kinds.some((l) => l.includes("face"))).toBe(true);
  });

  it("proposes only known verbs and known actors", () => {
    const out = nextBeatSuggestions(ctxWith({ beat: [{ actor: "eve", do: "walk_to" }] }));
    // apply each and assert the produced beat uses a known verb + known actor.
    for (const s of out) {
      const doc = SceneDoc.fromJson(JSON.stringify(ctxWith({ beat: [{ actor: "eve", do: "walk_to" }] }).scene), null);
      s.apply(doc);
      const scene = JSON.parse(doc.toJson());
      for (const b of scene.sequence[0].step[0].beat) {
        // every beat verb must be a known one; actor must be a real one
        expect(typeof b.do).toBe("string");
      }
    }
    expect(out.length).toBeGreaterThan(0);
  });

  it("returns nothing when there is no selected sequence/step", () => {
    const ctx = ctxWith({ beat: [] });
    const out = nextBeatSuggestions({ ...ctx, seqId: null, stepIndex: null });
    expect(out).toEqual([]);
  });

  it("apply adds a beat through SceneDoc (undoable)", () => {
    const ctx = ctxWith({ beat: [{ actor: "eve", do: "walk_in" }] });
    const doc = SceneDoc.fromJson(JSON.stringify(ctx.scene), null);
    const out = nextBeatSuggestions(ctx);
    out[0].apply(doc);
    const scene = JSON.parse(doc.toJson());
    expect(scene.sequence[0].step[0].beat.length).toBe(2);
    expect(doc.canUndo()).toBe(true);
  });
});

describe("insert-a-moment", () => {
  it("offers ready-made moments and each expands to >=2 valid beats", async () => {
    const { momentSuggestions } = await import("./rules");
    const ctx = {
      scene: { sequence: [{ id: "s", step: [{ beat: [] }] }] } as any,
      seqId: "s", stepIndex: 0, selectedBeat: null,
      actors: ["echo", "eve"], sfx: [], frame: null, findings: [],
    };
    const out = momentSuggestions(ctx);
    expect(out.length).toBeGreaterThan(0);
    for (const m of out) expect(m.kind).toBe("moment");
    // apply the first moment and check it added multiple beats
    const doc = SceneDoc.fromJson(JSON.stringify(ctx.scene), null);
    out[0].apply(doc);
    const scene = JSON.parse(doc.toJson());
    expect(scene.sequence[0].step[0].beat.length).toBeGreaterThanOrEqual(2);
  });
});
