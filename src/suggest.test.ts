import { describe, it, expect, beforeEach } from "vitest";
import {
  suggestions, registerProvider, _resetProviders,
  type Suggestion, type SuggestContext, type SuggestionProvider,
} from "./suggest";

const emptyCtx: SuggestContext = {
  scene: { sequence: [] }, seqId: null, stepIndex: null, selectedBeat: null,
  actors: [], sfx: [], frame: null, findings: [],
};
function stub(name: string, out: Suggestion[] | Promise<Suggestion[]>): SuggestionProvider {
  return { name, suggest: () => Promise.resolve(out) };
}
const s = (id: string, confidence: number): Suggestion =>
  ({ id, kind: "beat", label: id, confidence, apply: () => {} });

describe("suggestions engine", () => {
  beforeEach(() => _resetProviders());

  it("merges providers and ranks by confidence descending", async () => {
    registerProvider(stub("a", [s("x", 0.2), s("y", 0.9)]));
    registerProvider(stub("b", [s("z", 0.5)]));
    const out = await suggestions(emptyCtx);
    expect(out.map((o) => o.id)).toEqual(["y", "z", "x"]);
  });

  it("dedupes by id (first wins)", async () => {
    registerProvider(stub("a", [s("x", 0.9)]));
    registerProvider(stub("b", [s("x", 0.1)]));
    const out = await suggestions(emptyCtx);
    expect(out.filter((o) => o.id === "x")).toHaveLength(1);
    expect(out[0].confidence).toBe(0.9);
  });

  it("a throwing provider contributes nothing (graceful degradation)", async () => {
    registerProvider({ name: "boom", suggest: () => Promise.reject(new Error("x")) });
    registerProvider(stub("ok", [s("y", 0.5)]));
    const out = await suggestions(emptyCtx);
    expect(out.map((o) => o.id)).toEqual(["y"]);
  });

  it("a provider slower than the timeout contributes nothing", async () => {
    registerProvider({
      name: "slow",
      suggest: () => new Promise((r) => setTimeout(() => r([s("late", 1)]), 100)),
    });
    registerProvider(stub("fast", [s("y", 0.5)]));
    const out = await suggestions(emptyCtx, 20);
    expect(out.map((o) => o.id)).toEqual(["y"]);
  });
});
