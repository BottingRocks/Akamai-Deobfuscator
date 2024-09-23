import { types as t, traverse } from "@babel/core";
import { traverseFast } from "../ast.js";
import generator from "@babel/generator";

const generate = generator.default;

export default function moveFunctionsUpwards(ast) {
  traverseFast(ast, (_node, update) => {
    if (_node.type === "BlockStatement") {
      const funcs = [];
      const funcsInVars = [];
      const declarations = [];
      const otherNodes = [];

      _node.body.forEach((n) => {
        switch (true) {
          case n.type === "FunctionDeclaration":
            funcs.push(n);
            break;
          case n.type === "VariableDeclaration" &&
            n.declarations.length === 1 &&
            n.declarations[0].init !== null &&
            ["FunctionExpression", "FunctionDeclaration"].includes(n.declarations[0].init.type):
            funcsInVars.push(n);
            break;
          case n.type === "VariableDeclaration" && n.declarations.length === 1 && n.declarations[0].init === null:
            declarations.push(n);
            break;
          default:
            otherNodes.push(n);
        }
        const bodyNodes = [];

        declarations.length &&
          bodyNodes.push(
            t.variableDeclaration(
              "var",
              declarations.map((v) => v.declarations[0])
            )
          );

        bodyNodes.push(...funcs);
        bodyNodes.push(...funcsInVars);
        bodyNodes.push(...otherNodes);

        update(_node, t.blockStatement(bodyNodes));
      });
    }
  });

  /*
  const funcs = [];
  const declarations = [];
  const otherNodes = [];

  ast.program.body[0].expression.callee.body.body.forEach((n) => {
    switch(true){
      case n.type === "FunctionDeclaration":
      case n.type === "VariableDeclaration" && n.declarations.length === 1 && n.declarations[0].init !== null &&  ["FunctionExpression", "FunctionDeclaration"].includes(n.declarations[0].init.type):
        funcs.push(n);
        break;
      case n.type === "VariableDeclaration" && n.declarations.length === 1 && n.declarations[0].init === null:
        declarations.push(n);
        break;
      default:
        otherNodes.push(n);
    }
  });

  ast.program.body[0].expression.callee.body.body = [...funcs, ...declarations, ...otherNodes];
  */
}
