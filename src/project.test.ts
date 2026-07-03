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

import { vi } from "vitest";
// Stub the bridge so CRUD tests exercise the docs-map logic, not real I/O.
vi.mock("./bridge", () => ({
  saveScene: vi.fn(async () => ({ ok: true, output: "ok" })),
  deleteSceneFile: vi.fn(async () => ({ ok: true, output: "ok" })),
  listSceneDir: vi.fn(async () => []),
  sceneGraph: vi.fn(async () => ({ nodes: [], edges: [] })),
  loadScene: vi.fn(async () => ({ ok: false, output: "" })),
}));

describe("Project CRUD", () => {
  function seeded(): Project {
    const p = Project.empty();
    p.folderPath = "/proj";
    p.addDoc("vale", SceneDoc.fromJson(JSON.stringify({ scene: "vale", sequence: [] }), "/proj/vale.toml"));
    return p;
  }

  it("creates a new scene and refuses a duplicate id", async () => {
    const p = seeded();
    expect(await p.createScene("dawn")).toBe(true);
    expect(p.sceneIds()).toContain("dawn");
    expect(await p.createScene("vale")).toBe(false); // collision
  });

  it("deletes a scene from the map", async () => {
    const p = seeded();
    expect(await p.deleteScene("vale")).toBe(true);
    expect(p.sceneIds()).not.toContain("vale");
  });

  it("renames a scene (old id gone, new id present) and refuses a colliding target", async () => {
    const p = seeded();
    await p.createScene("dawn");
    expect(await p.renameScene("vale", "dusk")).toBe(true);
    expect(p.sceneIds()).toContain("dusk");
    expect(p.sceneIds()).not.toContain("vale");
    expect(await p.renameScene("dusk", "dawn")).toBe(false); // target exists
  });

  it("duplicates a scene under a new distinct id", async () => {
    const p = seeded();
    const newId = await p.duplicateScene("vale");
    expect(newId).toBeTruthy();
    expect(newId).not.toBe("vale");
    expect(p.sceneIds()).toContain(newId!);
  });
});
