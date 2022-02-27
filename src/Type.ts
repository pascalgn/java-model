import { HasName } from "./common";

interface Type extends HasName {}

/** Type parameter, e.g. `T` in `class MyClass<T> { ... }` */
export class TypeParameter implements HasName {
  name: string;
  constraint?: Constraint;

  constructor(name: string, constraint?: Constraint) {
    this.name = name;
    this.constraint = constraint;
  }
}

/** Type parameter reference, e.g. `T` in `private List<T> list` */
export class TypeParameterReference implements Type {
  name: string;
  parameter: TypeParameter;

  constructor(parameter: TypeParameter) {
    this.name = parameter.name;
    this.parameter = parameter;
  }
}

/** Wildcard, e.g. `?` in `private List<?> list` */
export class Wildcard implements Type {
  readonly name: string = "?";
  constraint?: Constraint;

  constructor(constraint?: Constraint) {
    this.constraint = constraint;
  }
}

export type Constraint = { kind: "super" | "extends"; type: TypeReference };

/** Type argument, e.g. `List<String>` in `private Set<List<String>> set` */
export type TypeArgument = TypeReference | Wildcard;

/** Reference to declared type, e.g. `MyClass<T>` in `private MyClass<T> m` */
export class DeclaredTypeReference implements Type {
  qualifier?: DeclaredTypeReference;
  name: string;
  arguments: TypeArgument[];

  constructor(name: string) {
    this.name = name;
    this.arguments = [];
  }
}

/** Reference to external type, e.g. `List<T>` in `private List<T> list` */
export class ExternalTypeReference implements Type {
  name: string;
  arguments: TypeArgument[];

  constructor(name: string) {
    this.name = name;
    this.arguments = [];
  }
}

export type TypeReference =
  | DeclaredTypeReference
  | ExternalTypeReference
  | TypeParameterReference;
