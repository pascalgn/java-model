import {
  AnnotationContext,
  ConcreteVisitor,
  createVisitor,
  CreatorContext,
  ElementValueContext,
  ExpressionContext,
  LiteralContext,
  PrimaryContext,
  TypeArgumentContext,
  TypeArgumentsContext,
  TypeArgumentsOrDiamondContext,
  TypeIdentifierContext,
  TypeListContext,
  TypeTypeContext,
  TypeTypeOrVoidContext,
  Visitor
} from "java-ast";
import { JavaLexer } from "java-ast/dist/parser/JavaLexer";
import { IdentifierContext, JavaParser } from "java-ast/dist/parser/JavaParser";
import {
  ANTLRInputStream,
  CommonTokenStream,
  ParserRuleContext
} from "antlr4ts";
import { ParseTree } from "antlr4ts/tree/ParseTree";
import { TerminalNode } from "antlr4ts/tree/TerminalNode";
import { Interval } from "antlr4ts/misc/Interval";
import { Modifier } from "./common";
import {
  ConstructorInvocation,
  Expression,
  ExpressionList,
  Literal,
  Name,
  Token,
  Unknown
} from "./Expression";
import {
  Annotation,
  AnnotationDeclaration,
  AnnotationValue,
  ArrayType,
  Class,
  CompilationUnit,
  Constructor,
  Enum,
  EnumConstant,
  Field,
  HasParameters,
  Interface,
  Method,
  Model,
  ObjectType,
  Parameter,
  Project,
  Record,
  Type,
  TypeArgument,
  TypeContainer,
  TypeDeclaration,
  TypeParameter,
  Wildcard
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

  function addInterfaces(parent?: TypeDeclaration, ctx?: TypeListContext[]) {
    if (type != undefined && ctx != undefined) {
      type.interfaces = ctx.flatMap((c) =>
        c.typeType().map((t) => parseObjectType(parent ?? compilationUnit!, t))
      );
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
      type = new Class(parent, ctx, ctx.identifier().text);
      moveModifiers(type);
      moveAnnotations(type);
      parent.types.push(type);
      setSuperclass(previousType, ctx.typeType());
      addInterfaces(previousType, ctx.typeList());
      visitor.visitChildren(ctx);
      type = previousType;
    },
    visitRecordDeclaration(ctx) {
      let previousType = type;
      const parent = previousType ?? compilationUnit!;
      type = new Record(parent, ctx, ctx.identifier().text);
      moveModifiers(type);
      moveAnnotations(type);
      parent.types.push(type);
      addInterfaces(
        previousType,
        ctx.typeList() ? [ctx.typeList()!] : undefined
      );
      visitor.visitChildren(ctx);
      type = previousType;
    },
    visitRecordComponent(ctx) {
      if (type instanceof Record) {
        const fieldType = parseType(type, ctx.typeType());
        const name = ctx.identifier().text;
        const field = new Field(type, ctx, name, fieldType);
        field.modifiers = [...modifiers];
        copyAnnotationsTo(annotations, field);
        annotations = [];
        type.fields.push(field);
      }
    },
    visitAnnotationTypeDeclaration(ctx) {
      let previousType = type;
      const parent = previousType ?? compilationUnit!;
      type = new AnnotationDeclaration(parent, ctx, ctx.identifier().text);
      moveModifiers(type);
      moveAnnotations(type);
      parent.types.push(type);
      visitor.visitChildren(ctx);
      type = previousType;
    },
    visitInterfaceDeclaration(ctx) {
      let previousType = type;
      const parent = previousType ?? compilationUnit!;
      type = new Interface(parent, ctx, ctx.identifier().text);
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
      type = new Enum(parent, ctx, ctx.identifier().text);
      moveModifiers(type);
      moveAnnotations(type);
      parent.types.push(type);
      addInterfaces(
        previousType,
        ctx.typeList() ? [ctx.typeList()!] : undefined
      );
      visitor.visitChildren(ctx);
      type = previousType;
    },
    visitEnumConstant(ctx) {
      const parent = type as Enum;
      parent.constants.push(
        new EnumConstant(parent, ctx, ctx.identifier().text)
      );
    },
    visitTypeParameter(ctx) {
      typeParameter = new TypeParameter(type!, ctx, ctx.identifier().text);
      visitor.visitChildren(ctx);
      if (type != undefined) {
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
      const container = type ?? compilationUnit!;
      annotations.push(parseAnnotation(ctx, container, dummyParent));
    },
    visitMethodDeclaration(ctx) {
      const methodName = ctx.identifier().text;
      const returnType = ctx.typeTypeOrVoid();
      const method = new Method(
        type!,
        ctx,
        methodName,
        parseType(type!, returnType)
      );
      moveModifiers(method);
      moveAnnotations(method);
      if (type instanceof Class) {
        type.methods.push(method);
      }
      hasParameters = method;
      visitor.visitChildren(ctx);
    },
    visitInterfaceMethodDeclaration(ctx) {
      const methodName = ctx.interfaceCommonBodyDeclaration().identifier().text;
      const returnType = ctx.interfaceCommonBodyDeclaration().typeTypeOrVoid()!;
      const method = new Method(
        type!,
        ctx,
        methodName,
        parseType(type!, returnType)
      );
      moveModifiers(method);
      moveAnnotations(method);
      if (type instanceof Interface) {
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
          const name = variable.variableDeclaratorId().identifier().text;
          const field = new Field(type, ctx, name, fieldType);
          field.modifiers = [...modifiers];
          copyAnnotationsTo(annotations, field);
          if (variable.variableInitializer()?.expression() != undefined) {
            field.initializer = parseExpression(
              variable.variableInitializer()!.expression()!,
              type
            );
          }
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
    }
  });

  const ast = parseAst(source);
  visitor.visit(ast);

  return compilationUnit!;
}

function parseAst(source: string) {
  const chars = new ANTLRInputStream(source);
  const lexer = new JavaLexer(chars);
  const tokens = new CommonTokenStream(lexer);
  const parser = new JavaParser(tokens);
  parser.removeErrorListeners();
  parser.addErrorListener({
    syntaxError: (
      recognizer,
      offendingSymbol,
      line,
      charPositionInLine,
      msg
    ) => {
      throw new Error(`syntax error: ${msg}`);
    }
  });
  return parser.compilationUnit();
}

function parseAnnotation(
  ctx: AnnotationContext,
  container: TypeContainer,
  parent: Model
) {
  const name =
    ctx
      .qualifiedName()
      ?.identifier()
      .map((id) => id.text)
      .join(".") ?? "";
  const annotation = new Annotation(parent, ctx, name);
  if (ctx.elementValue() != undefined) {
    annotation.values.push(
      parseAnnotationValue(ctx.elementValue()!, container, annotation, "value")
    );
  }
  const pairs = ctx.elementValuePairs()?.elementValuePair();
  if (pairs != undefined) {
    for (const pair of pairs) {
      annotation.values.push(
        parseAnnotationValue(
          pair.elementValue(),
          container,
          annotation,
          pair.identifier().text
        )
      );
    }
  }
  return annotation;
}

function parseAnnotationValue(
  ctx: ElementValueContext,
  container: TypeContainer,
  parent: Annotation,
  name: string
) {
  const result = new AnnotationValue(parent, ctx, name, undefined as any);
  result.value = parseAnnotationValueValue(ctx, container, result);
  return result;
}

function parseAnnotationValueValue(
  ctx: ElementValueContext,
  container: TypeContainer,
  parent: Model
): Expression {
  const result = createVisitor<Expression | undefined>({
    defaultResult: () => undefined,
    aggregateResult,
    visitExpression(ctx) {
      return parseExpression(ctx, container);
    },
    visitAnnotation(ctx) {
      return parseAnnotation(ctx, container, parent);
    },
    visitElementValueArrayInitializer(ctx) {
      return simplifyExpressions(
        ctx
          .elementValue()
          .map((v) => parseAnnotationValueValue(v, container, parent))
      );
    }
  }).visit(ctx);
  return requireValue(
    result,
    () => "could not parse annotation value: " + ctx.text
  );
}

function parseExpression(
  ctx: ExpressionContext,
  container: TypeContainer
): Expression {
  function parseType(ctx: CreatorContext) {
    const name = ctx.createdName();
    if (name.primitiveType() == undefined) {
      let type: ObjectType | undefined;
      for (let i = 0; i < name.childCount; i++) {
        const child = name.getChild(i);
        if (
          child instanceof IdentifierContext ||
          child instanceof TypeIdentifierContext
        ) {
          if (type == undefined) {
            type = new ObjectType(container, child.text);
          } else {
            const qualifier = type;
            type = new ObjectType(container, child.text);
            type.qualifier = qualifier;
          }
        } else if (child instanceof TypeArgumentsOrDiamondContext) {
          type!.arguments =
            child
              .typeArguments()
              ?.typeArgument()
              ?.map((arg) => parseTypeArgument(container, arg)) ?? [];
        }
      }
      return type!;
    } else {
      const comp = new PrimitiveType(name.primitiveType()!.text);
      return new ArrayType(comp, ctx.arrayCreatorRest()!.LBRACK().length);
    }
  }

  function parse(ctx: ParseTree): Expression | Expression[] {
    if (ctx instanceof LiteralContext) {
      if (ctx.integerLiteral() != undefined) {
        return new Literal(Number(ctx.text.replace(/(_|[lL]$)/g, "")));
      } else if (ctx.floatLiteral() != undefined) {
        return new Literal(Number(ctx.text.replace(/[fFdD]$/, "")));
      } else {
        return new Literal(JSON.parse(ctx.text));
      }
    } else if (
      ctx instanceof PrimaryContext ||
      ctx instanceof ExpressionContext
    ) {
      return parseChildren(ctx);
    } else if (ctx instanceof CreatorContext) {
      const type = parseType(ctx);
      const args = ctx
        ?.classCreatorRest()
        ?.arguments()
        .expressionList()
        ?.expression()
        .map((e) => parseExpression(e, container));
      return new ConstructorInvocation(type, args);
    } else if (ctx instanceof IdentifierContext) {
      return new Name(ctx.text);
    } else if (ctx instanceof TerminalNode) {
      if (ctx.symbol.type === JavaLexer.IDENTIFIER) {
        return new Name(ctx.text);
      } else {
        return new Token(ctx.text);
      }
    } else if (ctx instanceof ParserRuleContext) {
      return new Unknown(
        ctx.start.inputStream!.getText(
          new Interval(ctx.start.startIndex, ctx.stop?.stopIndex ?? -1)
        )
      );
    } else {
      throw new Error("unexpected AST node: " + ctx.constructor.name);
    }
  }

  function parseChildren(ctx: ParserRuleContext): Expression[] {
    return (ctx.children ?? []).map((child) => parse(child)).flat();
  }

  return simplifyExpressions(parseChildren(ctx));
}

function simplifyExpressions(expressions: Expression[]): Expression {
  const isToken = (e: Expression, token: string) =>
    e instanceof Token && e.code === token;

  const isString = (e: Expression): e is { value: string } =>
    e instanceof Literal && typeof e.value === "string";

  let result = expressions;
  while (true) {
    if (
      result.length > 1 &&
      isToken(result[0], "(") &&
      isToken(result[result.length - 1], ")")
    ) {
      result = result.slice(1, -1);
    } else if (
      result.length === 2 &&
      (isToken(result[0], "+") || isToken(result[0], "-")) &&
      result[1] instanceof Literal
    ) {
      if (isToken(result[0], "-")) {
        (result[1].value as number) *= -1;
      }
      result = result.slice(1);
    } else if (
      result.length === 2 &&
      isToken(result[0], "new") &&
      result[1] instanceof ConstructorInvocation
    ) {
      result = result.slice(1);
    } else if (
      result.length > 2 &&
      isString(result[0]) &&
      isToken(result[1], "+") &&
      isString(result[2])
    ) {
      result[0].value += result[2].value;
      result = result.slice(0, 1);
    } else {
      let modified = false;

      if (!modified) {
        break;
      }
    }
  }

  return result.length === 1 ? result[0] : new ExpressionList(result);
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
  const visitor = createVisitor<Type | undefined>({
    defaultResult: () => undefined,
    aggregateResult,
    visitTypeType(ctx) {
      const type = visitChildren(this, ctx);
      if (ctx.LBRACK().length > 0) {
        if (type instanceof ArrayType || type == undefined) {
          throw new Error("invalid type: " + ctx.text);
        } else {
          return new ArrayType(type, ctx.LBRACK().length);
        }
      } else {
        return type;
      }
    },
    visitTypeTypeOrVoid(ctx) {
      if (ctx.VOID() == undefined) {
        return visitChildren(this, ctx);
      } else {
        return PrimitiveType.VOID;
      }
    },
    visitClassOrInterfaceType(ctx) {
      let type: ObjectType | undefined;
      for (let i = 0; i < ctx.childCount; i++) {
        const child = ctx.getChild(i);
        if (
          child instanceof IdentifierContext ||
          child instanceof TypeIdentifierContext
        ) {
          if (type == undefined) {
            type = new ObjectType(container, child.text);
          } else {
            const qualifier = type;
            type = new ObjectType(container, child.text);
            type.qualifier = qualifier;
          }
        } else if (child instanceof TypeArgumentsContext) {
          type!.arguments = child
            .typeArgument()
            .map((arg) => parseTypeArgument(container, arg));
        }
      }
      return type!;
    },
    visitPrimitiveType(ctx) {
      return new PrimitiveType(ctx.text);
    },
    visitAnnotation(ctx) {
      return undefined;
    }
  });
  const result = visitor.visit(ctx);
  return requireValue(result, () => "could not parse type: " + ctx.text);
}

function aggregateResult(prev: any, next: any) {
  if (prev == undefined && next == undefined) {
    return undefined;
  } else if (prev == undefined && next != undefined) {
    return next;
  } else if (prev != undefined && next == undefined) {
    return prev;
  } else {
    throw new AggregateError(prev, next);
  }
}

class AggregateError extends Error {
  readonly prev: unknown;
  readonly next: unknown;

  constructor(prev: unknown, next: unknown) {
    super("cannot aggregate two values");
    this.prev = prev;
    this.next = next;
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
    throw new Error(`invalid type, expected class: ${JSON.stringify(ref)}`);
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
      throw new Error(`invalid type argument: ${JSON.stringify(ref)}`);
    }
  } else {
    const ref = new Wildcard();
    if (ctx.EXTENDS() != undefined) {
      ref.constraint = {
        kind: "extends",
        type: parseObjectType(container, ctx.typeType()!)
      };
    } else if (ctx.SUPER() != undefined) {
      ref.constraint = {
        kind: "super",
        type: parseObjectType(container, ctx.typeType()!)
      };
    }
    return ref;
  }
}

function visitChildren<T>(visitor: Visitor<T>, ctx: ParserRuleContext): T {
  return (visitor as unknown as ConcreteVisitor<T>).visitChildren(ctx);
}

function requireValue<T>(value: T | undefined, error: () => string): T {
  if (value == undefined) {
    throw new Error(error());
  } else {
    return value;
  }
}
