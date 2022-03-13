import {
  createVisitor,
  parse as parseAst,
  LiteralContext,
  TypeArgumentContext,
  TypeArgumentsContext,
  TypeTypeContext,
  TypeTypeOrVoidContext,
  ConcreteVisitor,
  TypeListContext,
} from "java-ast";
import { JavaLexer } from "java-ast/dist/parser/JavaLexer";
import { AbstractParseTreeVisitor } from "antlr4ts/tree/AbstractParseTreeVisitor";
import { ParserRuleContext } from "antlr4ts";
import { ParseTree } from "antlr4ts/tree/ParseTree";
import { RuleNode } from "antlr4ts/tree/RuleNode";
import { TerminalNode } from "antlr4ts/tree/TerminalNode";
import { Expression, Modifier } from "./common";
import {
  Class,
  CompilationUnit,
  Constructor,
  TypeDeclaration,
  Field,
  HasParameters,
  Interface,
  Method,
  Parameter,
  Project,
  TypeParameter,
  Enum,
  TypeArgument,
  ArrayType,
  ObjectType,
  Type,
  Wildcard,
  TypeContainer,
  Model,
  Annotation,
  AnnotationValue,
  AnnotationDeclaration,
  NormalTypeDeclaration,
} from "./Project";
import { PrimitiveType } from "./PrimitiveType";

type Sync = { files: string[]; read: (file: string) => string };
type Async = { files: string[]; readAsync: (file: string) => Promise<string> };

export function parse(sources: string[]): Project;
export function parse(input: Sync): Project;
export function parse(input: Async): Promise<Project>;
export function parse(
  input: string[] | Sync | Async
): Project | Promise<Project> {
  if (Array.isArray(input)) {
    return new Project(input.map((source) => parseFile(source)));
  } else if ("readAsync" in input) {
    return parseAsync(input);
  } else {
    return parseSync(input);
  }
}

function parseSync(input: Sync) {
  return new Project(
    input.files.map((file) => {
      let source;
      try {
        source = input.read(file);
      } catch (e) {
        errorRead(file, e);
      }
      try {
        return parseFile(source);
      } catch (e) {
        errorParse(file, e);
      }
    })
  );
}

async function parseAsync(input: Async) {
  const compilationUnits: CompilationUnit[] = [];
  for (const file of input.files) {
    let source;
    try {
      source = await input.readAsync(file);
    } catch (e) {
      errorRead(file, e);
    }
    try {
      compilationUnits.push(parseFile(source));
    } catch (e) {
      errorParse(file, e);
    }
  }
  return new Project(compilationUnits);
}

function errorRead(file: string, e: any): never {
  e.message = `could not read file '${file}': ${e.message}`;
  throw e;
}

function errorParse(file: string, e: any): never {
  e.message = `could not parse file '${file}': ${e.message}`;
  throw e;
}

function parseFile(source: string): CompilationUnit {
  const dummyProject = {} as Project;
  const dummyParent = {} as Model;

  let compilationUnit: CompilationUnit | undefined;
  let modifiers: Modifier[] = [];
  let type: TypeDeclaration | undefined;
  let typeParameter: TypeParameter | undefined;
  let annotations: Annotation[] = [];
  let hasParameters: HasParameters | undefined;

  function addModifier(node: unknown, modifier: Modifier) {
    if (node != undefined) {
      modifiers.push(modifier);
    }
  }

  function moveModifiers(obj: { modifiers: Modifier[] }) {
    obj.modifiers = modifiers;
    modifiers = [];
  }

  function moveAnnotations(obj: Model & { annotations: Annotation[] }) {
    obj.annotations = annotations;
    for (const annotation of obj.annotations) {
      annotation.parent = obj;
    }
    annotations = [];
  }

  function setSuperclass(parent?: TypeDeclaration, ctx?: TypeTypeContext) {
    if (type instanceof Class && ctx != undefined) {
      type.superclass = parseObjectType(parent ?? compilationUnit!, ctx);
    }
  }

  function addInterfaces(parent?: TypeDeclaration, ctx?: TypeListContext) {
    if (type instanceof NormalTypeDeclaration && ctx != undefined) {
      type.interfaces = ctx
        .typeType()
        .map((t) => parseObjectType(parent ?? compilationUnit!, t));
    }
  }

  const visitor = createVisitor({
    visitCompilationUnit(ctx) {
      compilationUnit = new CompilationUnit(dummyProject, ctx);
      visitor.visitChildren(ctx);
    },
    visitPackageDeclaration(ctx) {
      compilationUnit!.packageName = ctx.qualifiedName().text;
    },
    visitImportDeclaration(ctx) {
      if (ctx.STATIC() == undefined) {
        const importName =
          ctx.qualifiedName().text + (ctx.MUL() == undefined ? "" : ".*");
        compilationUnit!.imports.push(importName);
      }
    },
    visitModifier(ctx) {
      addModifier(ctx.NATIVE(), "native");
      addModifier(ctx.SYNCHRONIZED(), "synchronized");
      addModifier(ctx.TRANSIENT(), "transient");
      addModifier(ctx.VOLATILE(), "volatile");
      visitor.visitChildren(ctx);
    },
    visitClassOrInterfaceModifier(ctx) {
      addModifier(ctx.ABSTRACT(), "abstract");
      addModifier(ctx.FINAL(), "final");
      addModifier(ctx.PRIVATE(), "private");
      addModifier(ctx.PROTECTED(), "protected");
      addModifier(ctx.PUBLIC(), "public");
      addModifier(ctx.STATIC(), "static");
      addModifier(ctx.STRICTFP(), "strictfp");
      visitor.visitChildren(ctx);
    },
    visitClassDeclaration(ctx) {
      let previousType = type;
      const parent = previousType ?? compilationUnit!;
      type = new Class(parent, ctx, ctx.IDENTIFIER().text);
      moveModifiers(type);
      moveAnnotations(type);
      parent.types.push(type);
      setSuperclass(previousType, ctx.typeType());
      addInterfaces(previousType, ctx.typeList());
      visitor.visitChildren(ctx);
      type = previousType;
    },
    visitAnnotationTypeDeclaration(ctx) {
      let previousType = type;
      const parent = previousType ?? compilationUnit!;
      type = new AnnotationDeclaration(parent, ctx, ctx.IDENTIFIER().text);
      moveModifiers(type);
      moveAnnotations(type);
      parent.types.push(type);
      visitor.visitChildren(ctx);
      type = previousType;
    },
    visitInterfaceDeclaration(ctx) {
      let previousType = type;
      const parent = previousType ?? compilationUnit!;
      type = new Interface(parent, ctx, ctx.IDENTIFIER().text);
      moveModifiers(type);
      moveAnnotations(type);
      parent.types.push(type);
      addInterfaces(previousType, ctx.typeList());
      visitor.visitChildren(ctx);
      type = previousType;
    },
    visitEnumDeclaration(ctx) {
      let previousType = type;
      const parent = previousType ?? compilationUnit!;
      type = new Enum(parent, ctx, ctx.IDENTIFIER().text);
      moveModifiers(type);
      moveAnnotations(type);
      parent.types.push(type);
      addInterfaces(previousType, ctx.typeList());
      visitor.visitChildren(ctx);
      type = previousType;
    },
    visitTypeParameter(ctx) {
      typeParameter = new TypeParameter(type!, ctx, ctx.IDENTIFIER().text);
      visitor.visitChildren(ctx);
      if (type instanceof NormalTypeDeclaration) {
        type.parameters.push(typeParameter);
      }
    },
    visitTypeBound(ctx) {
      if (typeParameter != undefined) {
        for (const t of ctx.typeType()) {
          typeParameter.constraints.push(parseObjectType(type!, t));
        }
      }
    },
    visitAnnotation(ctx) {
      const annotation = new Annotation(
        dummyParent,
        ctx,
        ctx
          .qualifiedName()
          .IDENTIFIER()
          .map((id) => id.text)
          .join(".")
      );
      annotations.push(annotation);
      if (ctx.elementValue() != undefined) {
        annotation.values.push(
          new AnnotationValue(
            annotation,
            ctx,
            "value",
            expression(ctx.elementValue()!)
          )
        );
      }
      visitor.visitChildren(ctx);
    },
    visitElementValuePair(ctx) {
      const annotation = annotations[annotations.length - 1];
      annotation.values.push(
        new AnnotationValue(
          annotation,
          ctx,
          ctx.IDENTIFIER().text,
          expression(ctx.elementValue())
        )
      );
    },
    visitMethodDeclaration(ctx) {
      const methodName = ctx.IDENTIFIER().text;
      const returnType = ctx.typeTypeOrVoid();
      const method = new Method(
        type!,
        ctx,
        methodName,
        parseType(type!, returnType)
      );
      moveModifiers(method);
      moveAnnotations(method);
      if (type instanceof Class || type instanceof Interface) {
        type.methods.push(method);
      }
      hasParameters = method;
      visitor.visitChildren(ctx);
    },
    visitConstructorDeclaration(ctx) {
      const constructor = new Constructor(type!, ctx);
      moveModifiers(constructor);
      moveAnnotations(constructor);
      if (type instanceof Class) {
        type.constructors.push(constructor);
      }
      hasParameters = constructor;
      visitor.visitChildren(ctx);
    },
    visitFieldDeclaration(ctx) {
      if (type instanceof Class) {
        const fieldType = parseType(type, ctx.typeType());
        for (const variable of ctx.variableDeclarators().variableDeclarator()) {
          const name = variable.variableDeclaratorId().IDENTIFIER().text;
          const field = new Field(type, ctx, name, fieldType);
          field.modifiers = [...modifiers];
          copyAnnotationsTo(annotations, field);
          type.fields.push(field);
        }
      }
      modifiers = [];
      annotations = [];
    },
    visitTypeType() {},
    visitFormalParameter(ctx) {
      visitor.visitChildren(ctx);
      if (hasParameters != undefined) {
        const parameter = new Parameter(
          hasParameters as Method | Constructor,
          ctx,
          ctx.variableDeclaratorId().text,
          parseType(type!, ctx.typeType())
        );
        moveAnnotations(parameter);
        hasParameters.parameters.push(parameter);
      }
    },
  });

  const ast = parseAst(source);
  visitor.visit(ast);

  return compilationUnit!;
}

function expression(ctx: ParserRuleContext): Expression {
  const nodes: ParseTree[] = [];
  const visitor = new (class extends AbstractParseTreeVisitor<void> {
    visitChildren = (node: RuleNode) =>
      node instanceof LiteralContext
        ? nodes.push(node)
        : super.visitChildren(node);
    visitTerminal = (node: TerminalNode) => nodes.push(node);
    defaultResult = () => undefined;
  })();
  ctx.accept(visitor);
  if (nodes.length === 1 && nodes[0] instanceof LiteralContext) {
    return JSON.parse(nodes[0].text);
  } else {
    return { expression: nodes.map((n) => n.text).join("") };
  }
}

function copyAnnotationsTo(annotations: Annotation[], target: Field) {
  target.annotations = annotations.map((a) => {
    const copy = new Annotation(target, a.context, a.name);
    copy.values = a.values.map(
      (v) => new AnnotationValue(copy, v.context, v.name, v.value)
    );
    return copy;
  });
}

function parseType(
  container: TypeContainer,
  ctx: TypeTypeContext | TypeTypeOrVoidContext
): Type {
  let result: Type | undefined;
  const visitor: ConcreteVisitor<void> = createVisitor({
    visitTypeType(ctx) {
      visitor.visitChildren(ctx);
      if (ctx.LBRACK().length > 0) {
        if (result instanceof ArrayType || result == undefined) {
          throw new Error("invalid type!");
        } else {
          result = new ArrayType(result, ctx.LBRACK().length);
        }
      }
    },
    visitTypeTypeOrVoid(ctx) {
      if (ctx.VOID() == undefined) {
        visitor.visitChildren(ctx);
      } else {
        result = PrimitiveType.VOID;
      }
    },
    visitClassOrInterfaceType(ctx) {
      let type: ObjectType | undefined;
      for (let i = 0; i < ctx.childCount; i++) {
        const child = ctx.getChild(i);
        if (child instanceof TerminalNode) {
          if (child.symbol.type === JavaLexer.IDENTIFIER) {
            if (type == undefined) {
              type = new ObjectType(container, child.text);
            } else {
              const qualifier = type;
              type = new ObjectType(container, child.text);
              type.qualifier = qualifier;
            }
          }
        } else if (child instanceof TypeArgumentsContext) {
          type!.arguments = child
            .typeArgument()
            .map((arg) => parseTypeArgument(container, arg));
        }
      }
      result = type;
    },
    visitPrimitiveType(ctx) {
      result = new PrimitiveType(ctx.text);
    },
  });
  ctx.accept(visitor);
  if (result == undefined) {
    throw new Error("Failed to create reference");
  } else {
    return result;
  }
}

function parseObjectType(
  container: TypeContainer,
  ctx: TypeTypeContext | TypeTypeOrVoidContext
): ObjectType {
  const ref = parseType(container, ctx);
  if (ref instanceof ObjectType) {
    return ref;
  } else {
    throw new Error(`Invalid type, expected class: ${JSON.stringify(ref)}`);
  }
}

function parseTypeArgument(
  container: TypeContainer,
  ctx: TypeArgumentContext
): TypeArgument {
  if (ctx.QUESTION() == undefined) {
    const ref = parseType(container, ctx.typeType()!);
    if (ref instanceof ObjectType || ref instanceof ArrayType) {
      return ref;
    } else {
      throw new Error(`Invalid type argument: ${JSON.stringify(ref)}`);
    }
  } else {
    const ref = new Wildcard();
    if (ctx.EXTENDS() != undefined) {
      ref.constraint = {
        kind: "extends",
        type: parseObjectType(container, ctx.typeType()!),
      };
    } else if (ctx.SUPER() != undefined) {
      ref.constraint = {
        kind: "super",
        type: parseObjectType(container, ctx.typeType()!),
      };
    }
    return ref;
  }
}
