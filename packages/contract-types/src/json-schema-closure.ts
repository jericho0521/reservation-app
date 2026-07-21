export type JsonSchemaDefinitions = Record<string, unknown>;

function decodeJsonPointerSegment(value: string): string {
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

function referencedDefinitionNames(value: unknown, names: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) referencedDefinitionNames(item, names);
    return;
  }
  if (value === null || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    if (key === "$ref" && typeof child === "string" && child.startsWith("#/$defs/")) {
      names.add(decodeJsonPointerSegment(child.slice("#/$defs/".length)));
      continue;
    }
    referencedDefinitionNames(child, names);
  }
}

export function collectReachableJsonSchemaDefinitions(
  rootName: string,
  definitions: JsonSchemaDefinitions,
): JsonSchemaDefinitions {
  const reachable = new Set<string>();
  const pending = [rootName];

  while (pending.length > 0) {
    const name = pending.pop() as string;
    if (reachable.has(name)) continue;
    const definition = definitions[name];
    if (definition === undefined) {
      throw new Error(`JSON Schema definition ${name} is not registered.`);
    }

    reachable.add(name);
    const references = new Set<string>();
    referencedDefinitionNames(definition, references);
    for (const reference of references) {
      if (!reachable.has(reference)) pending.push(reference);
    }
  }

  return Object.fromEntries(
    Object.entries(definitions).filter(([name]) => reachable.has(name)),
  );
}
