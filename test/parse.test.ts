import { readdirSync, readFileSync } from "fs";
import { parse } from "../src/parse";

describe("parse", () => {
  test("should parse the files", () => {
    const files = readdirSync("test");
    for (const file of files) {
      if (file.endsWith(".java")) {
        const source = readFileSync(`test/${file}`, "utf8");
        const result = parse(source);
        const json = readFileSync(`test/${file.slice(0, -5)}.json`, "utf8");
        expect(result.json(2)).toEqual(json.trim());
      }
    }
  });
});
