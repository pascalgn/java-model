import { findObject } from "./common";
import {
  TypeDeclaration,
  Class,
  Enum,
  Field,
  isBoolean,
  isVoid,
  Method,
  Type,
  NormalTypeDeclaration,
} from "./Project";

export class Property {
  static isGetter(method: Method): boolean {
    return (
      method.isPublic() &&
      !method.modifiers.includes("static") &&
      method.parameters.length === 0 &&
      !isVoid(method.type) &&
      (isBoolean(method.type)
        ? method.name.match(/^(is|get)./)
        : method.name.match(/^get./)) != undefined
    );
  }

  static isSetter(method: Method): boolean {
    return (
      method.isPublic() &&
      !method.modifiers.includes("static") &&
      isVoid(method.type) &&
      method.parameters.length === 1 &&
      !isVoid(method.parameters[0].type) &&
      method.name.match(/^set./) != undefined
    );
  }

  static getterName(field: Field) {
    return isBoolean(field.type)
      ? `is${capitalize(field.name)}`
      : `get${capitalize(field.name)}`;
  }

  static setterName(field: Field) {
    return `set${capitalize(field.name)}`;
  }

  static propertyName(method: Method): string {
    if (method.name.startsWith("get")) {
      return decapitalize(method.name.slice(3));
    } else if (method.name.startsWith("set")) {
      return decapitalize(method.name.slice(3));
    } else if (isBoolean(method.type) && method.name.startsWith("is")) {
      return decapitalize(method.name.slice(2));
    } else {
      throw new Error(`not an accessor: ${method.name}`);
    }
  }

  static properties(type: NormalTypeDeclaration): Property[] {
    const properties: Property[] = [];
    if (type instanceof Class || type instanceof Enum) {
      for (const field of type.fields) {
        if (!field.modifiers.includes("static")) {
          let property = findObject(properties, field.name);
          if (property == undefined) {
            property = new Property(type, field.type, field.name);
            property.field = field;
            properties.push(property);
          } else {
            throw new Error(`duplicate field name: ${field.name}`);
          }
        }
      }
    }
    for (const method of type.methods) {
      if (Property.isGetter(method)) {
        const name = Property.propertyName(method);
        let property = findObject(properties, name);
        if (property == undefined) {
          property = new Property(type, method.type, name);
          properties.push(property);
        }
        property.getter = method;
      }
    }
    for (const method of type.methods) {
      if (Property.isSetter(method)) {
        const name = Property.propertyName(method);
        let property = findObject(properties, name);
        if (property == undefined) {
          property = new Property(type, method.type, name);
          properties.push(property);
        }
        property.setter = method;
      }
    }
    return properties;
  }

  parent: TypeDeclaration;
  type: Type;
  name: string;
  field?: Field;
  getter?: Method;
  setter?: Method;

  constructor(parent: TypeDeclaration, type: Type, name: string) {
    this.parent = parent;
    this.type = type;
    this.name = name;
  }

  toJSON() {
    return { ...this, parent: undefined };
  }
}

function capitalize(str: string) {
  return str.length === 0 ? "" : str[0].toUpperCase() + str.slice(1);
}

function decapitalize(str: string) {
  return str.length === 0
    ? ""
    : str.length > 1 && str.slice(0, 2) === str.slice(0, 2).toUpperCase()
    ? str
    : str[0].toLowerCase() + str.slice(1);
}
