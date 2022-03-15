import { Annotation, ArrayType, ObjectType } from "./Project";

export type Expression =
  | ExpressionList
  | Annotation
  | Literal
  | ConstructorInvocation
  | Name
  | Token
  | Unknown;

export class ExpressionList {
  expressions: Expression[];

  constructor(expressions: Expression[]) {
    this.expressions = expressions;
  }
}

export class Literal {
  value: string | number | boolean | null;

  constructor(value: string | number | boolean | null) {
    this.value = value;
  }
}

export class ConstructorInvocation {
  target: ObjectType | ArrayType;
  arguments: Expression[];

  constructor(target: ObjectType | ArrayType, args: Expression[] = []) {
    this.target = target;
    this.arguments = args;
  }
}

export class Name {
  name: string;

  constructor(name: string) {
    this.name = name;
  }
}

export class Token {
  code: string;

  constructor(code: string) {
    this.code = code;
  }
}

export class Unknown {
  code: string;

  constructor(code: string) {
    this.code = code;
  }
}
