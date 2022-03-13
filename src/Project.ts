import {
  AnnotationContext,
  AnnotationTypeDeclarationContext,
  ClassDeclarationContext,
  CompilationUnitContext,
  ConstructorDeclarationContext,
  ElementValuePairContext,
  EnumConstantContext,
  EnumDeclarationContext,
  FieldDeclarationContext,
  FormalParameterContext,
  InterfaceDeclarationContext,
  MethodDeclarationContext,
  TypeParameterContext,
} from "java-ast";
import { ParserRuleContext } from "antlr4ts";
import { Property } from "./Property";
import { Expression, Modifier, qualifiedName } from "./common";
import { PrimitiveType } from "./PrimitiveType";
import { resolve } from "./resolve";
import { TypeReference } from "./TypeReference";

export class Project {
  private compilationUnits: CompilationUnit[];
  private types: Record<string, TypeDeclaration>;

  constructor(compilationUnits: CompilationUnit[]) {
    this.compilationUnits = compilationUnits;
    this.types = {};
    for (const compilationUnit of this.compilationUnits) {
      compilationUnit.parent = this;
      compilationUnit.visitTypes((type) => {
        const qualifiedName = type.qualifiedName();
        if (this.types[qualifiedName] == undefined) {
          this.types[qualifiedName] = type;
        } else {
          throw new Error(`Duplicate type name: ${qualifiedName}`);
        }
      });
    }
  }

  visitTypes(callback: (type: TypeDeclaration) => void) {
    for (const compilationUnit of this.compilationUnits) {
      compilationUnit.visitTypes(callback);
    }
  }

  findCompilationUnits(packageName?: string): CompilationUnit[] {
    return this.compilationUnits.filter((cu) => cu.packageName === packageName);
  }

  findType(qualifiedName: string): TypeDeclaration | undefined {
    return this.types[qualifiedName];
  }

  resolve(container: TypeContainer, name: string): ResolvedType {
    return resolve(this, container, name);
  }

  toJSON() {
    return { ...this, types: undefined };
  }
}

export abstract class Model {
  abstract parent: Model | CompilationUnit | Project;
  abstract context: ParserRuleContext;

  project(): Project {
    return this.compilationUnit().parent;
  }

  compilationUnit(): CompilationUnit {
    let p: Model = this;
    while (!(p instanceof CompilationUnit)) {
      p = p.parent as Model;
    }
    return p;
  }

  container(): TypeContainer {
    let p: Model = this;
    while (!(p instanceof TypeDeclaration) && !(p instanceof CompilationUnit)) {
      p = p.parent as Model;
    }
    return p;
  }

  toJSON() {
    return { ...this, context: undefined, parent: undefined };
  }
}

export class CompilationUnit extends Model {
  parent: Project;
  context: CompilationUnitContext;
  packageName?: string;
  imports: string[];
  types: TypeDeclaration[];

  constructor(
    parent: Project,
    context: CompilationUnitContext,
    packageName?: string
  ) {
    super();
    this.parent = parent;
    this.context = context;
    this.packageName = packageName;
    this.types = [];
    this.imports = [];
  }

  visitTypes(callback: (type: TypeDeclaration) => void) {
    function visit(type: TypeDeclaration) {
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

export type TypeContainer = CompilationUnit | TypeDeclaration;

/** Non-primitive type, e.g. `List<T>` in `private List<T> m` */
export class ObjectType {
  container: TypeContainer;
  qualifier?: ObjectType;
  name: string;
  arguments: TypeArgument[];

  private resolved?: ResolvedType;

  constructor(container: TypeContainer, name: string) {
    this.container = container;
    this.name = name;
    this.arguments = [];
  }

  resolve(): ResolvedType {
    if (this.resolved == undefined) {
      this.resolved = this.container
        .project()
        .resolve(this.container, this._name());
    }
    return this.resolved;
  }

  private _name(): string {
    return qualifiedName(this.qualifier?._name(), this.name);
  }

  toJSON() {
    return { ...this, container: undefined, resolved: undefined };
  }
}

/** Type argument, e.g. `List<String>` in `private Set<List<String>> set` */
export type TypeArgument = ObjectType | ArrayType | Wildcard;

/** Wildcard, e.g. `?` in `private List<?> list` */
export class Wildcard {
  readonly name: string = "?";
  constraint?: Constraint;

  constructor(constraint?: Constraint) {
    this.constraint = constraint;
  }
}

export type Constraint = { kind: "super" | "extends"; type: ObjectType };

/** Array type, e.g. `int[][]` or `String[]` */
export class ArrayType {
  component: PrimitiveType | ObjectType;
  dimension: number;

  constructor(component: PrimitiveType | ObjectType, dimension: number) {
    this.component = component;
    this.dimension = dimension;
  }

  get name(): string {
    return this.component.name + "[]".repeat(this.dimension);
  }
}

export type Type = PrimitiveType | ObjectType | ArrayType;

export function isVoid(type: Type) {
  return typeEquals(type, "void", "java.lang.Void");
}

export function isBoolean(type: Type) {
  return typeEquals(type, "boolean", "java.lang.Boolean");
}

export function isString(type: Type) {
  return typeEquals(type, "", "java.lang.String");
}

function typeEquals(type: Type, primitive: string, object: string) {
  if (type instanceof PrimitiveType) {
    return type.name === primitive;
  } else if (type instanceof ObjectType) {
    const resolved = type.resolve();
    return resolved instanceof TypeReference && resolved.name === object;
  } else if (type instanceof TypeReference) {
    return type.name === object;
  } else {
    return false;
  }
}

export type ResolvedType = TypeDeclaration | TypeParameter | TypeReference;

export class Annotation extends Model {
  parent: Model;
  context: AnnotationContext;
  name: string;
  values: AnnotationValue[];

  private resolved?: AnnotationDeclaration | TypeReference;

  constructor(parent: Model, context: AnnotationContext, name: string) {
    super();
    this.parent = parent;
    this.context = context;
    this.name = name;
    this.values = [];
  }

  resolve(): AnnotationDeclaration | TypeReference {
    if (this.resolved == undefined) {
      const resolved = this.parent
        .project()
        .resolve(this.parent.container(), this.name);
      if (
        resolved instanceof AnnotationDeclaration ||
        resolved instanceof TypeReference
      ) {
        this.resolved = resolved;
      } else {
        throw new Error(
          `invalid type: ${resolved.name} (${resolved.constructor.name})`
        );
      }
    }
    return this.resolved;
  }

  toJSON() {
    return {
      ...this,
      parent: undefined,
      context: undefined,
      resolved: undefined,
    };
  }
}

export class AnnotationValue extends Model {
  parent: Annotation;
  context: AnnotationContext | ElementValuePairContext;
  name: string;
  value: Expression;

  constructor(
    parent: Annotation,
    context: AnnotationContext | ElementValuePairContext,
    name: string,
    value: Expression
  ) {
    super();
    this.parent = parent;
    this.context = context;
    this.name = name;
    this.value = value;
  }
}

/** Class, interface, enum or annotation declaration */
export abstract class TypeDeclaration extends Model {
  parent: TypeContainer;
  name: string;
  modifiers: Modifier[];
  annotations: Annotation[];
  /** Nested types */
  types: TypeDeclaration[];

  constructor(parent: TypeContainer, name: string) {
    super();
    this.parent = parent;
    this.name = name;
    this.modifiers = [];
    this.annotations = [];
    this.types = [];
  }

  qualifiedName(): string {
    const parentName =
      this.parent instanceof CompilationUnit
        ? this.parent.packageName
        : this.parent.qualifiedName();
    return parentName == undefined ? this.name : `${parentName}.${this.name}`;
  }

  visitParents(callback: (type: TypeDeclaration) => void) {
    let p = this.parent;
    while (p instanceof TypeDeclaration) {
      callback(p);
      p = p.parent;
    }
    return;
  }

  /** Find recursively in this type and parents */
  findObject<T>(
    callback: (type: TypeDeclaration) => T | undefined
  ): T | undefined {
    let p: TypeDeclaration | CompilationUnit = this;
    while (p instanceof TypeDeclaration) {
      const obj = callback(p);
      if (obj != undefined) {
        return obj;
      }
      p = p.parent;
    }
    return;
  }

  boxed() {
    return false;
  }

  hasAnnotation(qualifiedName: string) {
    return hasAnnotation(this.annotations, qualifiedName);
  }
}

function hasAnnotation(annotations: Annotation[], qualifiedName: string) {
  return annotations.some(
    (annotation) => annotation.resolve().qualifiedName() === qualifiedName
  );
}

export class AnnotationDeclaration extends TypeDeclaration {
  context: AnnotationTypeDeclarationContext;

  constructor(
    parent: TypeContainer,
    context: AnnotationTypeDeclarationContext,
    name: string
  ) {
    super(parent, name);
    this.context = context;
  }
}

/** Class, interface or enum declaration */
export abstract class NormalTypeDeclaration extends TypeDeclaration {
  parameters: TypeParameter[];
  interfaces: ObjectType[];
  methods: Method[];

  constructor(parent: TypeContainer, name: string) {
    super(parent, name);
    this.parameters = [];
    this.interfaces = [];
    this.methods = [];
  }

  properties() {
    return Property.properties(this);
  }
}

/** Type parameter, e.g. `T` in `class MyClass<T> { ... }` */
export class TypeParameter extends Model {
  parent: TypeDeclaration;
  context: TypeParameterContext;
  name: string;
  /** Type constraints, e.g. `T extends Serializable & Closeable` */
  constraints: ObjectType[];

  constructor(
    parent: TypeDeclaration,
    context: TypeParameterContext,
    name: string
  ) {
    super();
    this.parent = parent;
    this.context = context;
    this.name = name;
    this.constraints = [];
  }
}

export class Interface extends NormalTypeDeclaration {
  context: InterfaceDeclarationContext;

  constructor(
    parent: TypeContainer,
    context: InterfaceDeclarationContext,
    name: string
  ) {
    super(parent, name);
    this.context = context;
  }
}

export class Class extends NormalTypeDeclaration {
  context: ClassDeclarationContext;
  superclass?: ObjectType;
  constructors: Constructor[];
  fields: Field[];

  constructor(
    parent: TypeContainer,
    context: ClassDeclarationContext,
    name: string
  ) {
    super(parent, name);
    this.context = context;
    this.constructors = [];
    this.fields = [];
  }
}

export class Enum extends NormalTypeDeclaration {
  context: EnumDeclarationContext;
  constants: EnumConstant[];
  constructors: Constructor[];
  fields: Field[];

  constructor(
    parent: TypeContainer,
    context: EnumDeclarationContext,
    name: string
  ) {
    super(parent, name);
    this.context = context;
    this.constants = [];
    this.constructors = [];
    this.fields = [];
  }
}

export class EnumConstant extends Model {
  parent: Enum;
  context: EnumConstantContext;
  name: string;

  constructor(parent: Enum, context: EnumConstantContext, name: string) {
    super();
    this.parent = parent;
    this.context = context;
    this.name = name;
  }
}

export abstract class TypeMember extends Model {
  parent: TypeDeclaration;
  name: string;
  abstract type?: Type;
  modifiers: Modifier[];
  annotations: Annotation[];

  constructor(parent: TypeDeclaration, name: string) {
    super();
    this.parent = parent;
    this.name = name;
    this.modifiers = [];
    this.annotations = [];
  }

  isPublic() {
    return this.parent instanceof Interface
      ? !this.modifiers.includes("private") &&
          !this.modifiers.includes("protected")
      : this.modifiers.includes("public");
  }

  hasAnnotation(qualifiedName: string) {
    return hasAnnotation(this.annotations, qualifiedName);
  }
}

export interface HasParameters {
  parameters: Parameter[];
}

export class Constructor extends TypeMember implements HasParameters {
  context: ConstructorDeclarationContext;
  readonly type = undefined;
  parameters: Parameter[];

  constructor(parent: TypeDeclaration, context: ConstructorDeclarationContext) {
    super(parent, parent.name);
    this.context = context;
    this.parameters = [];
  }
}

export class Method extends TypeMember implements HasParameters {
  context: MethodDeclarationContext;
  type: Type;
  parameters: Parameter[];

  constructor(
    parent: TypeDeclaration,
    context: MethodDeclarationContext,
    name: string,
    type: Type
  ) {
    super(parent, name);
    this.context = context;
    this.type = type;
    this.parameters = [];
  }
}

export class Parameter extends Model {
  parent: Method | Constructor;
  context: FormalParameterContext;
  name: string;
  type: Type;
  annotations: Annotation[];

  constructor(
    parent: Method | Constructor,
    context: FormalParameterContext,
    name: string,
    type: Type
  ) {
    super();
    this.parent = parent;
    this.context = context;
    this.name = name;
    this.type = type;
    this.annotations = [];
  }

  hasAnnotation(qualifiedName: string) {
    return hasAnnotation(this.annotations, qualifiedName);
  }
}

export class Field extends TypeMember {
  context: FieldDeclarationContext;
  type: Type;

  constructor(
    parent: TypeDeclaration,
    context: FieldDeclarationContext,
    name: string,
    type: Type
  ) {
    super(parent, name);
    this.context = context;
    this.type = type;
  }
}
