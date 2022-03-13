import { PrimitiveType } from "./PrimitiveType";

const BOX_TYPES = {
  "java.lang.Boolean": "boolean",
  "java.lang.Byte": "byte",
  "java.lang.Character": "char",
  "java.lang.Double": "double",
  "java.lang.Float": "float",
  "java.lang.Integer": "int",
  "java.lang.Long": "long",
  "java.lang.Short": "short",
  "java.lang.Void": "void",
};

type BoxName = keyof typeof BOX_TYPES;

/** Fully qualified type reference */
export class TypeReference {
  name: string;

  constructor(qualifiedName: string) {
    this.name = qualifiedName;
  }

  qualifiedName() {
    return this.name;
  }

  boxed(): this is TypeReference & { name: BoxName } {
    return BOX_TYPES.hasOwnProperty(this.name);
  }

  unbox(): PrimitiveType {
    if (this.boxed()) {
      return new PrimitiveType(BOX_TYPES[this.name]);
    } else {
      throw new Error(`not a box type: ${this.name}`);
    }
  }
}
