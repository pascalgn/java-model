import {
  Annotation,
  Class,
  CompilationUnit,
  Interface,
  Method,
  Parameter,
  Type,
} from "./model";
import { createVisitor, parse as parseAst } from "java-ast";
import { expression, typeReference } from "./utils";

export function parse(source: string): CompilationUnit {
  let compilationUnit: CompilationUnit | undefined;
  let type: Type | undefined;
  let annotations: Annotation[] = [];

  const visitor = createVisitor({
    visitCompilationUnit(ctx) {
      compilationUnit = new CompilationUnit(ctx);
      visitor.visitChildren(ctx);
    },
    visitPackageDeclaration(ctx) {
      compilationUnit!.packageName = ctx.qualifiedName().text;
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
        annotation.values.push({
          context: ctx,
          name: "value",
          value: expression(ctx.elementValue()!),
        });
      }
      visitor.visitChildren(ctx);
    },
    visitElementValuePair(ctx) {
      const annotation = annotations[annotations.length - 1];
      annotation.values.push({
        context: ctx,
        name: ctx.IDENTIFIER().text,
        value: expression(ctx.elementValue()),
      });
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

function stringLiteralValue(str: string) {
  return str.startsWith('"') && str.endsWith('"') ? str.slice(1, -1) : str;
}
