import { describe, it, expect } from "vitest";
import { defaultPairing, previewLine, needsOverwriteWarning } from "./chain_dialog";
import type { Sequence } from "./scene";

describe("defaultPairing", () => {
  it("pairs A's last sequence with B's entry (first non-chained) sequence", () => {
    const fromSeqs = ["intro", "outro"];
    const toSeqs: Sequence[] = [
      { id: "prep", trigger: { kind: "on_sequence_finished", id: "x" } }, // chained → not entry
      { id: "arrive", trigger: { kind: "after_seconds", seconds: 1 } }, // real start → entry
    ];
    expect(defaultPairing(fromSeqs, toSeqs)).toEqual({ fromSeq: "outro", toSeq: "arrive" });
  });

  it("falls back to B's first sequence when every B sequence is chained", () => {
    const toSeqs: Sequence[] = [
      { id: "a", trigger: { kind: "on_sequence_finished", id: "x" } },
      { id: "b", trigger: { kind: "on_sequence_finished", id: "y" } },
    ];
    expect(defaultPairing(["only"], toSeqs).toSeq).toBe("a");
  });
});

describe("previewLine", () => {
  it("reads as plain language", () => {
    expect(previewLine("outro", "arrive")).toBe("When outro finishes, arrive starts.");
  });
});

describe("needsOverwriteWarning", () => {
  it("warns when the target already has a non-chain trigger", () => {
    expect(needsOverwriteWarning({ kind: "after_seconds", seconds: 3 })).toBe(true);
  });
  it("does not warn when there is no trigger or it is already a chain", () => {
    expect(needsOverwriteWarning(undefined)).toBe(false);
    expect(needsOverwriteWarning({ kind: "on_sequence_finished", id: "x" })).toBe(false);
  });
});
