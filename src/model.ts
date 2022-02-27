import { ParserRuleContext } from "antlr4ts";
import {
  AnnotationContext,
  ClassDeclarationContext,
  CompilationUnitContext,
  ElementValuePairContext,
  EnumConstantContext,
  EnumDeclarationContext,
  FieldDeclarationContext,
  FormalParameterContext,
  InterfaceDeclarationContext,
  MethodDeclarationContext,
  TypeTypeContext,
  TypeTypeOrVoidContext,
} from "java-ast";

export class CompilationUnit implements HasContext {
  context: CompilationUnitContext;
  packageName?: string;
  imports: string[];
  types: Type[];

  constructor(context: CompilationUnitContext, packageName?: string) {
    this.context = context;
    this.packageName = packageName;
    this.types = [];
    this.imports = [];
  }

  json(space?: number | string): string {
    function replacer(key: string, value: unknown): unknown {
      return key === "context" ? undefined : value;
    }
    return JSON.stringify(this, replacer, space);
  }

  visitTypes(callback: (type: Type) => void) {
    function visit(type: Type) {
      callback(type);
      for (const t of type.types) {
        visit(t);
      }
    }
    for (const type of this.types) {
      visit(type);
    }
  }

  findImport(name: string) {
    return this.imports.find((i) => i.endsWith(`.${name}`));
  }
}

export interface HasContext {
  context: ParserRuleContext;
}

export interface HasName {
  name: string;
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

export abstract class Type implements HasContext, HasName, HasAnnotations {
  abstract context: ParserRuleContext;
  parent: CompilationUnit | Type;
  name: string;
  types: Type[];
  annotations: Annotation[];

  constructor(name: string, parent: CompilationUnit | Type) {
    this.name = name;
    this.parent = parent;
    this.types = [];
    this.annotations = [];
  }

  qualifiedName(): string {
    const parentName =
      this.parent instanceof CompilationUnit
        ? this.parent.packageName
        : this.parent.qualifiedName();
    return parentName == undefined ? this.name : `${parentName}.${this.name}`;
  }

  toJSON() {
    return {
      ...this,
      parent:
        this.parent instanceof CompilationUnit
          ? "*(<compilation unit>)"
          : `*(${this.parent.name})`,
    };
  }
}

export class Interface extends Type {
  context: InterfaceDeclarationContext;
  interfaces: TypeReference[];
  methods: Method[];

  constructor(
    context: InterfaceDeclarationContext,
    name: string,
    parent: CompilationUnit | Type
  ) {
    super(name, parent);
    this.context = context;
    this.interfaces = [];
    this.methods = [];
  }
}

export class Class extends Type {
  context: ClassDeclarationContext;
  superclass?: TypeReference;
  interfaces: TypeReference[];
  methods: Method[];
  fields: Field[];

  constructor(
    context: ClassDeclarationContext,
    name: string,
    parent: CompilationUnit | Type
  ) {
    super(name, parent);
    this.context = context;
    this.interfaces = [];
    this.methods = [];
    this.fields = [];
  }
}

export class Enum extends Type {
  context: EnumDeclarationContext;
  interfaces: TypeReference[];
  constants: EnumConstant[];

  constructor(
    context: EnumDeclarationContext,
    name: string,
    parent: CompilationUnit | Type
  ) {
    super(name, parent);
    this.context = context;
    this.interfaces = [];
    this.constants = [];
  }
}

export class EnumConstant implements HasContext, HasName {
  context: EnumConstantContext;
  name: string;

  constructor(context: EnumConstantContext, name: string) {
    this.context = context;
    this.name = name;
  }
}

export class Annotation implements HasName {
  context: AnnotationContext;
  name: string;
  values: AnnotationValue[];

  constructor(context: AnnotationContext, name: string) {
    this.context = context;
    this.name = name;
    this.values = [];
  }
}

export class AnnotationValue implements HasName {
  name: string;
  context: AnnotationContext | ElementValuePairContext;
  value: Expression;

  constructor(
    name: string,
    context: AnnotationContext | ElementValuePairContext,
    value: Expression
  ) {
    this.name = name;
    this.context = context;
    this.value = value;
  }
}

export abstract class TypeMember implements HasName, HasAnnotations {
  name: string;
  annotations: Annotation[];

  constructor(name: string) {
    this.name = name;
    this.annotations = [];
  }
}

export class TypeReference implements HasName {
  context: TypeTypeContext | TypeTypeOrVoidContext;
  name: string;
  parameters: TypeReference[];

  constructor(context: TypeTypeContext | TypeTypeOrVoidContext, name: string) {
    this.context = context;
    this.name = name;
    this.parameters = [];
  }
}

export class Method extends TypeMember {
  context: MethodDeclarationContext;
  returnType: TypeReference;
  parameters: Parameter[];

  constructor(
    context: MethodDeclarationContext,
    name: string,
    returnType: TypeReference
  ) {
    super(name);
    this.context = context;
    this.returnType = returnType;
    this.parameters = [];
  }
}

export class Parameter implements HasName, HasAnnotations {
  context: FormalParameterContext;
  name: string;
  type: TypeReference;
  annotations: Annotation[];

  constructor(
    context: FormalParameterContext,
    name: string,
    type: TypeReference
  ) {
    this.context = context;
    this.name = name;
    this.type = type;
    this.annotations = [];
  }
}

export class Field extends TypeMember {
  context: FieldDeclarationContext;
  type: TypeReference;

  constructor(
    context: FieldDeclarationContext,
    name: string,
    type: TypeReference
  ) {
    super(name);
    this.context = context;
    this.type = type;
  }
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
