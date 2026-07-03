import { describe, it, expect } from "vitest";
import { mergeLayout, parseSavedLayout, type SavedLayout } from "./layout_store";
import type { StoryLayout } from "./story";

function auto(): StoryLayout {
  return {
    pos: new Map([
      ["a", { x: 10, y: 10 }],
      ["b", { x: 200, y: 10 }],
    ]),
    width: 400,
    height: 200,
  };
}

describe("mergeLayout", () => {
  it("lets a saved position override the auto one, keeping auto for the rest", () => {
    const saved: SavedLayout = { version: 1, positions: { a: { x: 500, y: 600 } } };
    const merged = mergeLayout(auto(), saved);
    expect(merged.pos.get("a")).toEqual({ x: 500, y: 600 }); // saved wins
    expect(merged.pos.get("b")).toEqual({ x: 200, y: 10 }); // auto kept
  });

  it("ignores a saved id that is not in the auto layout", () => {
    const saved: SavedLayout = { version: 1, positions: { ghost: { x: 1, y: 1 } } };
    const merged = mergeLayout(auto(), saved);
    expect(merged.pos.has("ghost")).toBe(false);
    expect(merged.pos.get("a")).toEqual({ x: 10, y: 10 });
  });

  it("returns the auto layout unchanged for null saved", () => {
    const merged = mergeLayout(auto(), null);
    expect(merged.pos.get("a")).toEqual({ x: 10, y: 10 });
    expect(merged.pos.get("b")).toEqual({ x: 200, y: 10 });
  });

  it("grows width/height to fit a saved position beyond the auto bounds", () => {
    const saved: SavedLayout = { version: 1, positions: { a: { x: 900, y: 700 } } };
    const merged = mergeLayout(auto(), saved);
    expect(merged.width).toBeGreaterThanOrEqual(900);
    expect(merged.height).toBeGreaterThanOrEqual(700);
  });
});

describe("parseSavedLayout", () => {
  it("parses a valid sidecar", () => {
    expect(parseSavedLayout('{"version":1,"positions":{"a":{"x":1,"y":2}}}')).toEqual({
      version: 1,
      positions: { a: { x: 1, y: 2 } },
    });
  });
  it("returns null for null, empty, or malformed input (never throws)", () => {
    expect(parseSavedLayout(null)).toBeNull();
    expect(parseSavedLayout("not json")).toBeNull();
    expect(parseSavedLayout("{}")).toBeNull(); // missing positions
    expect(parseSavedLayout('{"version":1}')).toBeNull();
  });
});
