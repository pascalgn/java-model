import { ParserRuleContext } from "antlr4ts";
import { AnnotationContext, ElementValuePairContext } from "java-ast";

export abstract class Model {
  abstract context: ParserRuleContext;

  toJSON() {
    return { ...this, context: undefined };
  }
}

export interface HasName {
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

export function qualifiedName(packageName: string | undefined, name: string) {
  return packageName == undefined ? name : `${packageName}.${name}`;
}

export interface HasAnnotations {
  annotations: Annotation[];
}

export type Expression =
  | string
  | number
  | boolean
  | null
  | { expression: string };

export class Annotation extends Model implements HasName {
  context: AnnotationContext;
  name: string;
  values: AnnotationValue[];

  constructor(context: AnnotationContext, name: string) {
    super();
    this.context = context;
    this.name = name;
    this.values = [];
  }
}

export class AnnotationValue extends Model implements HasName {
  name: string;
  context: AnnotationContext | ElementValuePairContext;
  value: Expression;

  constructor(
    name: string,
    context: AnnotationContext | ElementValuePairContext,
    value: Expression
  ) {
    super();
    this.name = name;
    this.context = context;
    this.value = value;
  }
}
