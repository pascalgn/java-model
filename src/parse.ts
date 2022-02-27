import {
  createVisitor,
  parse as parseAst,
  LiteralContext,
  TypeArgumentContext,
  TypeArgumentsContext,
  TypeTypeContext,
  TypeTypeOrVoidContext,
} from "java-ast";
import { JavaLexer } from "java-ast/dist/parser/JavaLexer";
import { AbstractParseTreeVisitor } from "antlr4ts/tree/AbstractParseTreeVisitor";
import { ParserRuleContext } from "antlr4ts";
import { ParseTree } from "antlr4ts/tree/ParseTree";
import { RuleNode } from "antlr4ts/tree/RuleNode";
import { TerminalNode } from "antlr4ts/tree/TerminalNode";
import {
  DeclaredTypeReference,
  ExternalTypeReference,
  TypeArgument,
  TypeReference,
  Wildcard,
} from "./Type";
import { AnnotationValue, Expression } from "./common";
import {
  Class,
  CompilationUnit,
  DeclaredType,
  Field,
  Interface,
  Method,
  Parameter,
  Project,
} from "./Project";
import { Annotation } from "./common";

export function parse(source: string): CompilationUnit {
  let compilationUnit: CompilationUnit | undefined;
  let type: DeclaredType | undefined;
  let annotations: Annotation[] = [];

  const visitor = createVisitor({
    visitCompilationUnit(ctx) {
      compilationUnit = new CompilationUnit(dummyProject, ctx);
      visitor.visitChildren(ctx);
    },
    visitPackageDeclaration(ctx) {
      compilationUnit!.packageName = ctx.qualifiedName().text;
    },
    visitImportDeclaration(ctx) {
      const importName =
        ctx.qualifiedName().text + (ctx.MUL() == undefined ? "" : ".*");
      compilationUnit!.imports.push(importName);
    },
    visitClassDeclaration(ctx) {
      let previousType = type;
      const parent = previousType ?? compilationUnit!;
      type = new Class(ctx, ctx.IDENTIFIER().text, parent);
      type.annotations = annotations;
      annotations = [];
      (previousType?.types ?? compilationUnit!.types).push(type);
      visitor.visitChildren(ctx);
      type = previousType;
    },
    visitAnnotation(ctx) {
      const annotation = new Annotation(
        ctx,
        ctx.qualifiedName().IDENTIFIER(0).text
      );
      annotations.push(annotation);
      if (ctx.elementValue() != undefined) {
        annotation.values.push(
          new AnnotationValue("value", ctx, expression(ctx.elementValue()!))
        );
      }
      visitor.visitChildren(ctx);
    },
    visitElementValuePair(ctx) {
      const annotation = annotations[annotations.length - 1];
      annotation.values.push(
        new AnnotationValue(
          ctx.IDENTIFIER().text,
          ctx,
          expression(ctx.elementValue())
        )
      );
    },
    visitMethodDeclaration(ctx) {
      const methodName = ctx.IDENTIFIER().text;
      const returnType = ctx.typeTypeOrVoid();
      const method = new Method(ctx, methodName, typeReference(returnType));
      method.annotations = annotations;
      annotations = [];
      if (type instanceof Class || type instanceof Interface) {
        type.methods.push(method);
      }
      visitor.visitChildren(ctx);
    },
    visitFieldDeclaration(ctx) {
      if (type instanceof Class) {
        const fieldType = typeReference(ctx.typeType());
        for (const variable of ctx.variableDeclarators().variableDeclarator()) {
          const name = variable.variableDeclaratorId().IDENTIFIER().text;
          type.fields.push(new Field(ctx, name, fieldType));
        }
      }
    },
    visitTypeType() {},
    visitFormalParameter(ctx) {
      visitor.visitChildren(ctx);
      if (type instanceof Class || type instanceof Interface) {
        const method = type.methods[type.methods.length - 1];
        const parameter = new Parameter(
          ctx,
          ctx.variableDeclaratorId().text,
          typeReference(ctx.typeType())
        );
        parameter.annotations = annotations;
        annotations = [];
        method.parameters.push(parameter);
      }
    },
  });

  const ast = parseAst(source);
  visitor.visit(ast);

  return compilationUnit!;
}

const dummyProject = new Project();

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

function typeReference(
  ctx: TypeTypeContext | TypeTypeOrVoidContext
): TypeReference {
  const visitor = createVisitor<TypeReference | undefined>({
    defaultResult() {
      return undefined;
    },
    aggregateResult(cur, next) {
      if (cur == undefined) {
        return next;
      } else {
        throw new Error(`Unexpected argument: ${cur}`);
      }
    },
    visitClassOrInterfaceType(ctx) {
      let ref: DeclaredTypeReference | undefined;
      for (let i = 0; i < ctx.childCount; i++) {
        const child = ctx.getChild(i);
        if (child instanceof TerminalNode) {
          if (child.symbol.type === JavaLexer.IDENTIFIER) {
            if (ref == undefined) {
              ref = new DeclaredTypeReference(child.text);
            } else {
              const qualifier = ref;
              ref = new DeclaredTypeReference(child.text);
              ref.qualifier = qualifier;
            }
          }
        } else if (child instanceof TypeArgumentsContext) {
          ref!.arguments = child.typeArgument().map(typeArgument);
        }
      }
      return ref!;
    },
    visitPrimitiveType(ctx) {
      return new ExternalTypeReference(ctx.text);
    },
  });
  return ctx.accept(visitor)!;
}

function typeArgument(ctx: TypeArgumentContext): TypeArgument {
  if (ctx.QUESTION() == undefined) {
    return typeReference(ctx.typeType()!);
  } else {
    const ref = new Wildcard();
    if (ctx.EXTENDS() != undefined) {
      ref.constraint = {
        kind: "extends",
        type: typeReference(ctx.typeType()!),
      };
    } else if (ctx.SUPER() != undefined) {
      ref.constraint = {
        kind: "super",
        type: typeReference(ctx.typeType()!),
      };
    }
    return ref;
  }
}
