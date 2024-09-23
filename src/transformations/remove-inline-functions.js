import { types as t, traverse } from "@babel/core";
import { traverseFast, cloneNode } from "../ast.js";
import generator from "@babel/generator";

const generate = generator.default;

export default function removeInlineFunctions(ast) {
  function replaceParams({ callExp, func }) {
    const argsByIndex = Object.create(null);

    func.params.forEach((param, i) => {
      if (callExp.arguments[i]) {
        argsByIndex[param.name] = cloneNode(callExp.arguments[i]);
      }
    });

    const newNode = cloneNode(func.body.body[0].argument);

    traverseFast(newNode, (_node, update) => {
      if (t.isIdentifier(_node) && _node.name in argsByIndex) {
        update(_node, cloneNode(argsByIndex[_node.name]));
      }
    });

    return newNode;
  }

  const deletePaths = [];
  traverse(ast, {
    BlockStatement: {
      exit(path) {
        const inlineFuncs = Object.create(null);
        const inlineAssignments = Object.create(null);

        for (let binding in path.scope.bindings) {
          const _binding = path.scope.bindings[binding];
          switch (true) {
            case _binding.kind === "hoisted" &&
              _binding.path.type === "FunctionDeclaration" &&
              _binding.path.node.body.body.length === 1 &&
              (
                (
                  _binding.path.node.body.body[0].type === "ExpressionStatement" &&
                  _binding.path.node.body.body[0].expression.type === "AssignmentExpression"
                ) ||
                _binding.path.node.body.body[0].type === "ReturnStatement"
              ):

              if(_binding.path.node.body.body[0].type === "ReturnStatement"){
                inlineFuncs[_binding.path.node.id.name] = cloneNode(_binding.path.node);
              }else{
                inlineAssignments[_binding.path.node.id.name] = cloneNode(_binding.path.node);
              }

              deletePaths.push(_binding.path);
              break;

            case _binding.kind === "hoisted" &&
              _binding.path.type === "FunctionDeclaration" &&
              _binding.path.node.body.body.length === 1 &&
              (
                (
                  _binding.path.node.body.body[0].type === "ExpressionStatement" &&
                  _binding.path.node.body.body[0].expression.type === "AssignmentExpression"
                ) ||
                _binding.path.node.body.body[0].type === "ReturnStatement"
              ):

              if(_binding.path.node.body.body[0].type === "ReturnStatement"){
                inlineFuncs[_binding.path.node.id.name] = cloneNode(_binding.path.node);
              }else{
                inlineAssignments[_binding.path.node.id.name] = cloneNode(_binding.path.node);
              }

              deletePaths.push(_binding.path);
              break;

            case _binding.kind === "var" &&
              _binding.path.type === "VariableDeclarator" &&
              _binding.path.node.init !== null &&
              ["FunctionDeclaration", "FunctionExpression"].includes(_binding.path.node.init.type) &&
              _binding.path.node.init.body.body.length === 1 &&
              (
                (
                  _binding.path.node.init.body.body[0].type === "ExpressionStatement" &&
                  _binding.path.node.init.body.body[0].expression.type === "AssignmentExpression"
                ) ||
                _binding.path.node.init.body.body[0].type === "ReturnStatement"
              ):

              if (_binding.path.node.init.body.body[0].type === "ReturnStatement"){
                inlineFuncs[_binding.path.node.id.name] = cloneNode(_binding.path.node.init);
              }else{
                inlineAssignments[_binding.path.node.id.name] = cloneNode(_binding.path.node.init);
              }

              deletePaths.push(_binding.path.parentPath);
          }
        }

        path.traverse({
          CallExpression: {
            exit(callPath) {
              const { callee } = callPath.node;

              if (t.isIdentifier(callee) && ((callee.name in inlineFuncs) || (callee.name in inlineAssignments))) {
                let func;

                const callExp = cloneNode(callPath.node);

                if (callee.name in inlineFuncs){
                  func = cloneNode(inlineFuncs[callee.name]);
                  callPath.replaceWith(replaceParams({ callExp, func }));
                }else{
                  func = cloneNode(inlineAssignments[callee.name]);
                  callPath.getStatementParent().replaceWith(cloneNode(func.body.body[0]));
                }
              }
            },
          },
        });
      },
    },
  });

  deletePaths.forEach((p) => {
    try {
      p.remove();
    } catch (e) {}
  });
}
