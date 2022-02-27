import { readdirSync, readFileSync, writeFileSync } from "fs";
import { parse } from "../src/parse";

describe("parse", () => {
  test("should parse the files", () => {
    const files = readdirSync("test");
    for (const file of files) {
      if (file.endsWith(".java")) {
        const source = readFileSync(`test/${file}`, "utf8");
        const result = JSON.stringify(parse(source), undefined, 2) + "\n";
        const output_file = `test/${file.slice(0, -5)}.json`;
        const expected = readFileSync(output_file, "utf8");
        if (result !== expected) {
          writeFileSync(output_file, result, "utf8");
          throw new Error("Result doesn't match expected output!");
        }
      }
    }
  });
});
