import { TypeReference } from "./TypeReference";

const PRIMITIVE_TYPES = {
  boolean: "java.lang.Boolean",
  byte: "java.lang.Byte",
  char: "java.lang.Character",
  double: "java.lang.Double",
  float: "java.lang.Float",
  int: "java.lang.Integer",
  long: "java.lang.Long",
  short: "java.lang.Short",
  void: "java.lang.Void",
};

type PrimitiveName = keyof typeof PRIMITIVE_TYPES;

const NUMBER_TYPES = ["byte", "double", "float", "int", "long", "short"];

/** Primitive type, e.g. `int` or `void` */
export class PrimitiveType {
  static VOID = new PrimitiveType("void");

  name: PrimitiveName;

  constructor(name: string) {
    if (!isPrimitiveType(name)) {
      throw new Error(`invalid primitive type name: ${name}`);
    }
    this.name = name;
  }

  get qualifiedName() {
    return this.name;
  }

  canonicalName = () => this.name;

  isVoid = () => this.name === "void";
  isBoolean = () => this.name === "boolean";
  isNumber = () => NUMBER_TYPES.includes(this.name);
  isString = () => false;

  box() {
    return new TypeReference(PRIMITIVE_TYPES[this.name]);
  }
}

export function isPrimitiveType(name: string): name is PrimitiveName {
  return PRIMITIVE_TYPES.hasOwnProperty(name);
}
