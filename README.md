# java-model

[![npm version](https://img.shields.io/npm/v/java-model.svg?style=flat-square)](https://www.npmjs.com/package/java-model)

Provides high-level access to the Java type model, based on [java-ast](https://github.com/pascalgn/java-ast).

## Usage

```java
class A {
    private int i;
}

record B(String s) {
}

enum C { C1, C2 }
```

```typescript
import { readFileSync } from "node:fs";
import { parse } from "java-model";

const project = parse({
    files: inputFiles,
    read: (file) => readFileSync(file, "utf8")
});

project.visitTypes((type) => {
   console.log(type.name);
   console.log(type.qualifiedName);
   console.log(type.properties());
});
```

## License

[MIT](LICENSE)
