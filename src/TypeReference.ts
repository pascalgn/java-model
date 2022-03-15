import { simpleName } from "./common";
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

const NUMBER_TYPES = [
  "java.lang.Byte",
  "java.lang.Double",
  "java.lang.Float",
  "java.lang.Integer",
  "java.lang.Long",
  "java.lang.Short",
];

/** Fully qualified type reference */
export class TypeReference {
  qualifiedName: string;

  constructor(qualifiedName: string) {
    this.qualifiedName = qualifiedName;
  }

  get name() {
    return simpleName(this.qualifiedName);
  }

  canonicalName = () => this.qualifiedName;

  isVoid = () => this.qualifiedName === "java.lang.Void";
  isBoolean = () => this.qualifiedName === "java.lang.Boolean";
  isNumber = () => NUMBER_TYPES.includes(this.qualifiedName);
  isString = () => this.qualifiedName === "java.lang.String";

  boxed(): this is TypeReference & { qualifiedName: BoxName } {
    return BOX_TYPES.hasOwnProperty(this.qualifiedName);
  }

  unbox(): PrimitiveType {
    if (this.boxed()) {
      return new PrimitiveType(BOX_TYPES[this.qualifiedName]);
    } else {
      throw new Error(`not a box type: ${this.qualifiedName}`);
    }
  }
}
