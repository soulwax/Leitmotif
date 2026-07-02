import { describe, it, expect } from "vitest";
import { Project } from "./project";
import { SceneDoc } from "./scene";

describe("Project", () => {
  it("keys docs by scene id and tracks the active doc", () => {
    const p = Project.empty();
    const sceneJson = JSON.stringify({ scene: "vale", sequence: [{ id: "intro", step: [] }] });
    const d = SceneDoc.fromJson(sceneJson, "vale.toml");
    p.addDoc("vale", d); // test-only insertion helper
    expect(p.sceneIds()).toEqual(["vale"]);
    expect(p.activeDoc()).toBeNull();
    p.setActive("vale");
    expect(p.activeSceneId).toBe("vale");
    expect(p.activeDoc()).toBe(d);
  });

  it("returns null active doc for an empty project", () => {
    expect(Project.empty().activeDoc()).toBeNull();
  });
});
