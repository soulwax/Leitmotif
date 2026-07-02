// The Project document layer: owns many scenes (one SceneDoc each) and which one is
// active. The editor reads Project.activeDoc(); the story canvas reads Project.graph.
// SceneDoc is unchanged (one file, its own undo/dirty). This layer adds NO mutation
// path — it composes existing SceneDocs.

import { SceneDoc } from "./scene";
import { listSceneDir, sceneGraph, loadScene } from "./bridge";
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
}
