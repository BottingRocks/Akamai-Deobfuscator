import fs from "fs";
import { types as t, traverse } from "@babel/core";
import { parse } from "@babel/parser";

const REMOVE_KEYS = ["leadingComments", "trailingComments", "innerComments", "tokens", "start", "end", "loc", "extra"];

export function deleteBannedKeys(node) {
  if (node === undefined || node === null) {
    return;
  }
  Object.entries(node).forEach(([key, value]) => {
    if (REMOVE_KEYS.includes(key)) {
      delete node[key];
    }

    if (typeof node[key] === "object") {
      deleteBannedKeys(node[key]);
    }
  });
}

export function cloneNode(node) {
  const _node = JSON.parse(JSON.stringify(node));
  deleteBannedKeys(_node);

  return _node;
}
export function fromFile(file, sourceType) {
  const source = fs.readFileSync(file, { encoding: "UTF-8" }).toString();
  const ast = parse(source, {
    sourceType: sourceType === "module" ? sourceType : "script",
  });
  delete ast.comments;
  return { ast, source };
}

export function fromString(string, sourceType) {
  const ast = parse(string, {
    sourceType: sourceType === "module" ? sourceType : "script",
  });
  delete ast.comments;
  return ast;
}

export function valueToNode(value) {
  let node = null;

  if (value && typeof value === "object" && value.constructor === Object) {
  } else if (Array.isArray(value)) {
    node = t.arrayExpression(value.map((elem) => valueToNode(elem)));
  } else if (Number.isInteger(value)) {
    node = t.numericLiteral(value);
  } else if (typeof value === "string") {
    node = t.stringLiteral(value);
  } else if (typeof value === "boolean") {
    node = t.booleanLiteral(value);
  } else if (value === null) {
    node = t.nullLiteral();
  } else if (value === undefined) {
    node = t.identifier("undefined");
  }

  return node;
}

export function nodeToValue(node) {
  let value = undefined;

  if (t.isArrayExpression(node)) {
    value = node.elements.map((elem) => nodeToValue(elem));
  } else if (t.isObjectExpression(node)) {
    value = {};
    node.properties.map((prop) => (value[nodeToValue(prop.key)] = nodeToValue(prop.value)));
  } else if (t.isNumericLiteral(node)) {
    value = node.value;
  } else if (t.isStringLiteral(node)) {
    value = node.value;
  } else if (t.isNullLiteral(node)) {
    value = null;
  } else if (t.isIdentifier(node) && node.name === "undefined") {
    value = undefined;
  } else if (t.isBooleanLiteral(node)) {
    value = node.value;
  } else if (
    t.isUnaryExpression(node) &&
    node.operator === "void" &&
    t.isNumericLiteral(node.argument) &&
    node.argument.value === 0
  ) {
    value = undefined;
  }

  return value;
}
export function updateNode(node, newNode) {
  const keys = Object.keys(node);
  for (let i = 0; i < keys.length; i++) {
    delete node[keys[i]];
  }

  Object.assign(node, newNode);
}

export function traverseFast(node, enter) {
  if (!node) return;

  let keys = t.VISITOR_KEYS[node.type];
  if (!keys) return;

  let stop = enter(node, updateNode);

  if (stop) return;

  for (let key of keys) {
    let subNode = node[key];

    if (Array.isArray(subNode)) {
      for (let elementNode of subNode) {
        traverseFast(elementNode, enter);
      }
    } else {
      traverseFast(subNode, enter);
    }
  }
}
