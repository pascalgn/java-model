import process from "process";
import { readFileSync, writeFileSync } from "fs";
import { parse } from "../src/parse";
import { Class, ObjectType, ResolvedType } from "../src/Project";

describe("Parser", () => {
  test("should parse the files", () => {
    const source = readFileSync("test/MyClass.java", "utf8");
    const project = parse([source]);
    const compilationUnit = project.findCompilationUnits("test")[0];

    compareResult("test/MyClass.project.json", compilationUnit);

    const types: Record<string, ResolvedType> = {};
    compilationUnit.visitTypes((type) => {
      if (type instanceof Class) {
        for (const method of type.methods) {
          if (method.type instanceof ObjectType) {
            types[method.type.name] = method.type.resolve();
          }
        }
      }
    });

    compareResult("test/MyClass.types.json", types);
  });
});

function compareResult(filename: string, result: unknown) {
  const str = JSON.stringify(result, undefined, 2) + "\n";
  const expected = readFileSync(filename, "utf8");
  if (str !== expected) {
    if (process.env.WRITE_RESULTS == undefined) {
      throw new Error("Result doesn't match expected output!");
    } else {
      writeFileSync(filename, str, "utf8");
      console.log("Result has been written to:", filename);
    }
  }
}
