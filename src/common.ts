interface HasName {
  name: string;
}

export function findObject<T extends HasName>(
  arr: T[],
  name: string
): T | undefined {
  return arr.find((obj) => obj.name === name);
}

export function requireObject<T extends HasName>(arr: T[], name: string): T {
  const obj = findObject(arr, name);
  if (obj == undefined) {
    throw new Error(`Required object not found: ${name}`);
  }
  return obj;
}

export function qualifiedName(qualifier: string | undefined, name: string) {
  return qualifier == undefined ? name : `${qualifier}.${name}`;
}

export function simpleName(qualifiedName: string) {
  const idx = qualifiedName.lastIndexOf(".");
  return idx === -1 ? qualifiedName : qualifiedName.slice(idx + 1);
}

export function splitName(name: string): { qualifier?: string; name: string } {
  const idx = name.indexOf(".");
  return idx === -1
    ? { name }
    : { qualifier: name.slice(0, idx), name: name.slice(idx + 1) };
}

export type Modifier =
  | "public"
  | "protected"
  | "private"
  | "abstract"
  | "static"
  | "final"
  | "transient"
  | "volatile"
  | "synchronized"
  | "native"
  | "strictfp";
