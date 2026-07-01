// Reads field metadata (type, description, default) out of the generated
// choreography JSON Schema. This is the "schema-driven" half of the inspector:
// the vocab map says WHICH fields a verb uses; the schema says what each field IS.
//
// The schema is bundled at contract/choreography.schema.json and imported at build
// time (Vite resolves the JSON), so it always matches the shipped contract.

import schemaJson from "../contract/choreography.schema.json";

type Json = Record<string, unknown>;

const schema = schemaJson as unknown as Json;
const defs = ((schema.$defs as Json) ?? {}) as Record<string, Json>;

export type FieldKind = "number" | "string" | "boolean" | "unknown";

export interface FieldMeta {
  kind: FieldKind;
  description: string;
  /** For enum-ish fields; empty otherwise. */
  enumValues: string[];
}

/** Normalize a schema type that may be `"number"` or `["number","null"]`. */
function normalizeType(t: unknown): FieldKind {
  const one = Array.isArray(t) ? t.find((x) => x !== "null") : t;
  switch (one) {
    case "number":
    case "integer":
      return "number";
    case "string":
      return "string";
    case "boolean":
      return "boolean";
    default:
      return "unknown";
  }
}

/** Field metadata for a property of a named definition (e.g. "BeatDef", "x"). */
export function fieldMeta(defName: string, field: string): FieldMeta {
  const props = (defs[defName]?.properties as Record<string, Json>) ?? {};
  const p = props[field] ?? {};
  const enumValues = Array.isArray(p.enum) ? (p.enum as string[]) : [];
  return {
    kind: normalizeType(p.type),
    description: typeof p.description === "string" ? p.description : "",
    enumValues,
  };
}

/** The tagged variants of a `oneOf` definition (ChoreoTrigger, WaitForDef): each
 * is `{ kind, fields[] }` where `kind` is the const/enum tag value. Used to drive
 * the trigger / wait_for pickers straight from the schema. */
export interface TaggedVariant {
  kind: string;
  fields: string[];
}

export function taggedVariants(defName: string): TaggedVariant[] {
  const d = defs[defName] ?? {};
  const oneOf = (d.oneOf as Json[]) ?? [];
  const out: TaggedVariant[] = [];
  for (const v of oneOf) {
    const props = (v.properties as Record<string, Json>) ?? {};
    const kindProp = (props.kind as Json) ?? {};
    const kind =
      (typeof kindProp.const === "string" && kindProp.const) ||
      (Array.isArray(kindProp.enum) && (kindProp.enum as string[])[0]) ||
      "";
    if (!kind) continue;
    out.push({
      kind,
      fields: Object.keys(props).filter((k) => k !== "kind"),
    });
  }
  return out;
}

/** Trigger kinds available (from the schema), for the sequence trigger picker. */
export function triggerVariants(): TaggedVariant[] {
  return taggedVariants("ChoreoTrigger");
}

/** wait_for kinds available (from the schema). */
export function waitForVariants(): TaggedVariant[] {
  return taggedVariants("WaitForDef");
}
