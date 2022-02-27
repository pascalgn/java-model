import {
  AnnotationContext,
  LiteralContext,
  TypeTypeContext,
  TypeTypeOrVoidContext,
} from "java-ast";
import { JavaLexer } from "java-ast/dist/parser/JavaLexer";
import { AbstractParseTreeVisitor } from "antlr4ts/tree/AbstractParseTreeVisitor";
import { ParserRuleContext } from "antlr4ts";
import { ParseTree } from "antlr4ts/tree/ParseTree";
import { RuleNode } from "antlr4ts/tree/RuleNode";
import { TerminalNode } from "antlr4ts/tree/TerminalNode";
import { Expression, TypeReference } from "./model";

export function qualifiedName(packageName: string | undefined, name: string) {
  return packageName == undefined ? name : `${packageName}.${name}`;
}

export function expression(ctx: ParserRuleContext): Expression {
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

export function typeReference(
  ctx: TypeTypeContext | TypeTypeOrVoidContext
): TypeReference {
  const visitor = new (class extends AbstractParseTreeVisitor<string> {
    visitChildren = (node: RuleNode) =>
      node instanceof AnnotationContext ? "" : super.visitChildren(node);
    visitTerminal = (node: TerminalNode) => node.text;
    defaultResult = () => "";
    aggregateResult = (aggregate: string, nextResult: string) =>
      aggregate + nextResult;
  })();
  const name = ctx.accept(visitor);
  return new TypeReference(ctx, name);
}
