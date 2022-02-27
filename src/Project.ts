import { ParserRuleContext } from "antlr4ts";
import {
  ClassDeclarationContext,
  CompilationUnitContext,
  EnumConstantContext,
  EnumDeclarationContext,
  FieldDeclarationContext,
  FormalParameterContext,
  InterfaceDeclarationContext,
  MethodDeclarationContext,
} from "java-ast";
import {
  Annotation,
  HasAnnotations,
  HasName,
  Model,
  qualifiedName,
} from "./common";
import { parse } from "./parse";
import { TypeReference } from "./Type";

export class Project {
  compilationUnits: CompilationUnit[];
  typeCache: Record<string, DeclaredType>;

  constructor() {
    this.compilationUnits = [];
    this.typeCache = {};
  }

  add(source: string) {
    const compilationUnit = parse(source);
    compilationUnit.project = this;
    this.compilationUnits.push(compilationUnit);
  }

  findType(packageName: string | undefined, name: string) {
    return this.typeCache[qualifiedName(packageName, name)];
  }

  toJSON() {
    return { ...this, typeCache: undefined };
  }
}

export class CompilationUnit extends Model {
  context: CompilationUnitContext;
  project: Project;
  packageName?: string;
  imports: string[];
  types: DeclaredType[];

  constructor(
    project: Project,
    context: CompilationUnitContext,
    packageName?: string
  ) {
    super();
    this.project = project;
    this.context = context;
    this.packageName = packageName;
    this.types = [];
    this.imports = [];
  }

  visitTypes(callback: (type: DeclaredType) => void) {
    function visit(type: DeclaredType) {
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

  toJSON() {
    return { ...this, context: undefined, project: "*(<project>)" };
  }
}

export interface HasParent {
  parent: DeclaredType | CompilationUnit;
}

/** Declared type, e.g. `class MyClass { ... }` */
export abstract class DeclaredType
  extends Model
  implements HasName, HasAnnotations
{
  parent: CompilationUnit | DeclaredType;
  name: string;
  /** Nested types */
  types: DeclaredType[];
  annotations: Annotation[];

  constructor(name: string, parent: CompilationUnit | DeclaredType) {
    super();
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
      context: undefined,
      parent:
        this.parent instanceof CompilationUnit
          ? "*(<compilation unit>)"
          : `*(${this.parent.name})`,
    };
  }
}

export class Interface extends DeclaredType {
  context: InterfaceDeclarationContext;
  interfaces: TypeReference[];
  methods: Method[];

  constructor(
    context: InterfaceDeclarationContext,
    name: string,
    parent: CompilationUnit | DeclaredType
  ) {
    super(name, parent);
    this.context = context;
    this.interfaces = [];
    this.methods = [];
  }
}

export class Class extends DeclaredType {
  context: ClassDeclarationContext;
  superclass?: TypeReference;
  interfaces: TypeReference[];
  methods: Method[];
  fields: Field[];

  constructor(
    context: ClassDeclarationContext,
    name: string,
    parent: CompilationUnit | DeclaredType
  ) {
    super(name, parent);
    this.context = context;
    this.interfaces = [];
    this.methods = [];
    this.fields = [];
  }
}

export class Enum extends DeclaredType {
  context: EnumDeclarationContext;
  interfaces: TypeReference[];
  constants: EnumConstant[];

  constructor(
    context: EnumDeclarationContext,
    name: string,
    parent: CompilationUnit | DeclaredType
  ) {
    super(name, parent);
    this.context = context;
    this.interfaces = [];
    this.constants = [];
  }
}

export class EnumConstant extends Model implements HasName {
  context: EnumConstantContext;
  name: string;

  constructor(context: EnumConstantContext, name: string) {
    super();
    this.context = context;
    this.name = name;
  }
}

export abstract class TypeMember
  extends Model
  implements HasName, HasAnnotations
{
  name: string;
  annotations: Annotation[];

  constructor(name: string) {
    super();
    this.name = name;
    this.annotations = [];
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

export class Parameter extends Model implements HasName, HasAnnotations {
  context: FormalParameterContext;
  name: string;
  type: TypeReference;
  annotations: Annotation[];

  constructor(
    context: FormalParameterContext,
    name: string,
    type: TypeReference
  ) {
    super();
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
