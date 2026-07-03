// The Project document layer: owns many scenes (one SceneDoc each) and which one is
// active. The editor reads Project.activeDoc(); the story canvas reads Project.graph.
// SceneDoc is unchanged (one file, its own undo/dirty). This layer adds NO mutation
// path — it composes existing SceneDocs.

import { SceneDoc } from "./scene";
import { listSceneDir, sceneGraph, loadScene, saveScene, deleteSceneFile } from "./bridge";
import type { StoryGraph } from "./graph";

/** Derive a scene id from a loaded SceneDoc: prefer the `scene` field, fall back to
 *  the file stem, then to the path. */
function sceneIdFor(doc: SceneDoc): string {
  try {
    const data = JSON.parse(doc.toJson()) as { scene?: string };
    if (data.scene) return data.scene;
  } catch {
    /* fall through */
  }
  const path = doc.path ?? "";
  const stem = path.replace(/^.*[\\/]/, "").replace(/\.toml$/i, "");
  return stem || path || "scene";
}

export class Project {
  folderPath: string | null = null;
  activeSceneId: string | null = null;
  graph: StoryGraph = { nodes: [], edges: [] };
  private docs = new Map<string, SceneDoc>();

  static empty(): Project {
    return new Project();
  }

  /** Load every *.toml in `folder` into a SceneDoc map and fetch the resolved graph.
   *  Bridge failures degrade to an empty project (no throw). */
  static async open(folder: string): Promise<Project> {
    const p = new Project();
    p.folderPath = folder;
    const paths = await listSceneDir(folder);
    for (const path of paths) {
      const r = await loadScene(path);
      if (!r.ok) continue; // skip a file that won't load; graph still renders
      const doc = SceneDoc.fromJson(r.output, path);
      p.docs.set(sceneIdFor(doc), doc);
    }
    p.graph = await sceneGraph(folder);
    return p;
  }

  /** Test-only / internal: insert a pre-built doc under a scene id. */
  addDoc(sceneId: string, doc: SceneDoc): void {
    this.docs.set(sceneId, doc);
  }

  doc(sceneId: string): SceneDoc | undefined {
    return this.docs.get(sceneId);
  }

  sceneIds(): string[] {
    return [...this.docs.keys()];
  }

  activeDoc(): SceneDoc | null {
    return this.activeSceneId ? this.docs.get(this.activeSceneId) ?? null : null;
  }

  setActive(sceneId: string): void {
    if (this.docs.has(sceneId)) this.activeSceneId = sceneId;
  }

  hasScene(sceneId: string): boolean {
    return this.docs.has(sceneId);
  }

  /** The on-disk path for a scene id in this project's folder. */
  private pathFor(sceneId: string): string {
    return `${this.folderPath ?? "."}/${sceneId}.toml`;
  }

  /** Create a blank scene. Returns false if the id already exists (no overwrite). */
  async createScene(sceneId: string): Promise<boolean> {
    if (this.docs.has(sceneId)) return false;
    const doc = SceneDoc.empty();
    doc.edit((d) => {
      d.scene = sceneId;
    });
    const path = this.pathFor(sceneId);
    const r = await saveScene(path, doc.toJson());
    if (!r.ok) return false;
    // Re-open at the saved path so doc.path is set for later save/delete.
    this.docs.set(sceneId, SceneDoc.fromJson(doc.toJson(), path));
    return true;
  }

  /** Copy an existing scene under a new, deduped id. Returns the new id or null. */
  async duplicateScene(sourceId: string): Promise<string | null> {
    const src = this.docs.get(sourceId);
    if (!src) return null;
    let newId = `${sourceId}_copy`;
    let n = 2;
    while (this.docs.has(newId)) newId = `${sourceId}_copy${n++}`;
    const json = src.toJson();
    const copy = SceneDoc.fromJson(json, this.pathFor(newId));
    copy.edit((d) => {
      d.scene = newId;
    });
    const path = this.pathFor(newId);
    const r = await saveScene(path, copy.toJson());
    if (!r.ok) return null;
    this.docs.set(newId, SceneDoc.fromJson(copy.toJson(), path));
    return newId;
  }

  /** Rename = save-new + delete-old (save before delete so a failure never loses a
   *  scene). Returns false on collision or on a failed save. */
  async renameScene(oldId: string, newId: string): Promise<boolean> {
    if (oldId === newId) return true;
    if (this.docs.has(newId)) return false; // collision
    const doc = this.docs.get(oldId);
    if (!doc) return false;
    const oldPath = doc.path ?? this.pathFor(oldId);
    const newPath = this.pathFor(newId);
    doc.edit((d) => {
      d.scene = newId;
    });
    const saved = await saveScene(newPath, doc.toJson());
    if (!saved.ok) return false; // abort before deleting the old file — no data loss
    await deleteSceneFile(oldPath); // a failure here leaves a recoverable duplicate
    this.docs.delete(oldId);
    this.docs.set(newId, SceneDoc.fromJson(doc.toJson(), newPath));
    if (this.activeSceneId === oldId) this.activeSceneId = newId;
    return true;
  }

  /** Delete a scene's file and drop it from the map. */
  async deleteScene(sceneId: string): Promise<boolean> {
    const doc = this.docs.get(sceneId);
    if (!doc) return false;
    const path = doc.path ?? this.pathFor(sceneId);
    const r = await deleteSceneFile(path);
    if (!r.ok) return false;
    this.docs.delete(sceneId);
    if (this.activeSceneId === sceneId) this.activeSceneId = null;
    return true;
  }
}
