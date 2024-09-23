import vm from "vm";
import { types as t, traverse } from "@babel/core";
import generator from "@babel/generator";
import { traverseFast, valueToNode, cloneNode } from "./ast.js";

const generate = generator.default;

export function isReturnCallStatement(node) {
  return (
    t.isReturnStatement(node) &&
    t.isCallExpression(node.argument) &&
    t.isMemberExpression(node.argument.callee) &&
    t.isIdentifier(node.argument.callee.object) &&
    t.isIdentifier(node.argument.callee.property) &&
    node.argument.callee.property.name === "call"
  );
}

export function isApply(node){
  return (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.object) &&
    t.isIdentifier(node.callee.property) &&
    node.callee.property.name === "apply"
  )
}

export function isCall(node){
  return (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.object) &&
    t.isIdentifier(node.callee.property) &&
    node.callee.property.name === "call"
  )
}

export function isIIFE(node){
  return (
    t.isExpressionStatement(node) &&
    t.isCallExpression(node.expression) &&
    (
      t.isFunctionDeclaration(node.expression.callee) ||
      t.isFunctionExpression(node.expression.callee)
    )
  )
}

export function evaluate(node) {
  let result = null;
  try{
    const evaluated = vm.runInNewContext(generate(node).code)

    if (!["number", "boolean","string"].includes(typeof evaluated)){
      return result;
    }

    result = evaluated;
  }catch(e){
    return result;
  }

  return result;
}

export function evaluateNode(node, vars){
  const clonedNode = cloneNode(node);

  traverseFast(clonedNode, (_node, update) => {
    if (t.isIdentifier(_node) && _node.name in vars){
      update(_node, valueToNode(vars[_node.name]))
    }
  });

  return evaluate(clonedNode)

}

export function isCorrectAssignment(node, vars){

  return (
    t.isExpressionStatement(node) &&
    t.isAssignmentExpression(node.expression) &&
    t.isIdentifier(node.expression.left) &&
    node.expression.left.name in vars
  );

}

export function replaceBxindings(path, vars){

  for (let binding in bindings) {
    const _binding = bindings[binding];

    if (!(binding in vars && vars[binding] !== null)){
      continue
    }

    _binding.referencePaths.forEach((p) => {

      try{
        p.replaceWith(valueToNode(vars[binding]))
      }catch(e){

      }
    });

  }
}

export function replaceBindings(bindings, vars){
  for (let binding in bindings) {
    const _binding = bindings[binding];

    if (!(binding in vars && vars[binding] !== null)){
      continue
    }

    _binding.referencePaths.forEach((p) => {

      try{
        p.replaceWith(valueToNode(vars[binding]))
      }catch(e){

      }
    });

  }
}
