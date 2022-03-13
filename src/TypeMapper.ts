import { PrimitiveType } from "./PrimitiveType";
import { ArrayType, ObjectType, Type, TypeArgument, Wildcard } from "./Project";

export interface TypeMapper {
  map(type: Type | TypeArgument): string;
}

interface Mapping {
  primitive?(type: PrimitiveType, mapper: TypeMapper): string;
  object?(type: ObjectType, mapper: TypeMapper): string;
  array?(type: ArrayType, mapper: TypeMapper): string;
  wildcard?(type: Wildcard, mapper: TypeMapper): string;
}

const defaultMapping = {
  array(type: ArrayType, mapper: TypeMapper) {
    return `${mapper.map(type.component)}${"[]".repeat(type.dimension)}`;
  },
  wildcard(type: Wildcard, mapper: TypeMapper) {
    return (
      "?" +
      (type.constraint == undefined
        ? ""
        : ` ${type.constraint.kind} ${mapper.map(type.constraint.type)}`)
    );
  },
};

export function createTypeMapper(mapping: Mapping): TypeMapper {
  function map(type: Type | TypeArgument): string {
    let result: string | undefined;
    if (type instanceof PrimitiveType) {
      result = mapping.primitive?.(type, { map });
    } else if (type instanceof ObjectType) {
      result = mapping.object?.(type, { map });
    } else if (type instanceof ArrayType) {
      result = (mapping.array ?? defaultMapping.array)(type, { map });
    } else if (type instanceof Wildcard) {
      result = (mapping.wildcard ?? defaultMapping.wildcard)(type, { map });
    }
    if (result == undefined) {
      throw new Error(`no mapping for ${type.name} (${type.constructor.name})`);
    } else {
      return result;
    }
  }
  return { map };
}
