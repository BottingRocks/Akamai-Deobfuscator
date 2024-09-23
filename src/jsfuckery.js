import { types as t, traverse } from "@babel/core";
import generator from "@babel/generator";
import { valueToNode, cloneNode } from "./ast.js";
import { isReturnCallStatement, evaluateNode, isCorrectAssignment, replaceBindings } from "./utils.js";

const generate = generator.default;

export default function jsFuckery(path) {

  if (!["FunctionDeclaration", "FunctionExpression"].includes(path.type)){
    return;
  }

  const hasEmptyVars = (node) => t.isVariableDeclaration(node) && !node.declarations.filter((n) => n.init !== null).length;

  const vars = Object.create(null);
  const funcPaths = Object.create(null);
  const deleteFuncPaths = [];
  const bodyPath = path.get("body.body");

  if (!(
    bodyPath.length &&
    hasEmptyVars(bodyPath[0].node)
  )) {
    return;
  }

  const lastNode = bodyPath.slice(-1)[0].node;

  if (!
    isReturnCallStatement(lastNode)
  ){
    return;
  }

  bodyPath[0].node.declarations.map((n) => vars[n.id.name] = null);

  bodyPath.forEach((_path) => {

    switch(true){
      case t.isFunctionDeclaration(_path.node):
        funcPaths[_path.node.id.name] = _path;
        break;
      case (
        t.isExpressionStatement(_path.node) && t.isCallExpression(_path.node.expression) &&
        t.isIdentifier(_path.node.expression.callee) && _path.node.expression.arguments.length === 0 &&
        _path.node.expression.callee.name in funcPaths
      ):
        const funcName = _path.node.expression.callee.name;
        const funcPath = funcPaths[funcName];

        const shouldModify = !funcPath.get('body.body').filter((p) => !isCorrectAssignment(p.node, vars)).length

        if (shouldModify){
          for(let i = 0, _paths = funcPath.get('body.body'); i < _paths.length; i++){
            const varName = _paths[i].node.expression.left.name;
            const newValue = evaluateNode(_paths[i].node.expression.right, vars);

            if (newValue !== null){
              vars[varName] = newValue;
              _paths[i].get('expression.right').replaceWith(valueToNode(newValue));
            }
          }

          deleteFuncPaths.push(funcName);
        }
    }

  });
  replaceBindings(path.scope.bindings, vars);
  Object.keys(path.scope.bindings).filter((binding) => deleteFuncPaths.includes(binding)).forEach((binding) => {
    try{
      path.scope.bindings[binding].referencePaths.forEach((referencePath) => referencePath.getStatementParent().remove())
      path.scope.bindings[binding].path.remove();
    }catch(e){
    }
  });

}
