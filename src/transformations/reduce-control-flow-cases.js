import { types as t, traverse } from "@babel/core";
import generator from "@babel/generator";
import { createMainFunction, MultiCaseFunction, SingleCaseFunction } from "../cfg.js";
import { fromString } from "../ast.js";
import { isCall, replaceBindings } from "../utils.js";
import removeInlineFunctions from "./remove-inline-functions.js";

const generate = generator.default;


export default function reduceControlFlowCases(ast) {

  traverse(ast, {
    "FunctionDeclaration|FunctionExpression": {
      exit(path){

        const bodyPaths = path.get("body.body");

        if (!bodyPaths.length){
          return;
        }

        const lastNode = bodyPaths.slice(-1)[0].node;

        //We are looking for this pattern return Ml.call(this, 29);
        if (!(
          t.isReturnStatement(lastNode) &&
          isCall(lastNode.argument)
        )){
          return;
        }

        const initialCFG = lastNode.argument.callee.object.name;
        const initialState = lastNode.argument.arguments[1].value;

        const multiFuncs = Object.create(null);
        const singleFuncs = Object.create(null);

        path.traverse({
          VariableDeclarator(varPath){
            const maybeMultiFunc = MultiCaseFunction.fromNode(varPath.node);
            const maybeSingleFunc = SingleCaseFunction.fromNode(varPath.node);

            if (maybeMultiFunc !== null){
              multiFuncs[varPath.node.id.name] = maybeMultiFunc;
              multiFuncs[varPath.node.init.id.name] = maybeMultiFunc;

            }else if(maybeSingleFunc !== null){
              singleFuncs[varPath.node.id.name] = maybeSingleFunc
              singleFuncs[varPath.node.init.id.name] = maybeSingleFunc;

            }

          }
        });

        if (!(initialCFG in multiFuncs)){
          return;
        }


        const mainFunction = createMainFunction({initialCFG, initialState, multiFuncs, singleFuncs });

        const vars = Object.create(null);

        for(let i = 0; i < mainFunction.body.body.length; i++){
          const n = mainFunction.body.body[i];

          if (t.isFunctionDeclaration(n) && n.id.name === "SETUP"){
            n.body.body.forEach((_n) => vars[_n.expression.left.name] = _n.expression.right.value)
            break;
          }
        }

        bodyPaths[0].insertAfter(mainFunction);
        bodyPaths.slice(-1)[0].get('argument').replaceWith(
          t.callExpression(
            mainFunction.id,
            []
          )
        );
        return;
        const newAst = fromString(generate(path.node).code)
        traverse(newAst, {
          Program(programPath){
            const bindings = programPath.get('body.0').scope.bindings;

            replaceBindings(bindings, vars);
            programPath.stop();
          }
        });
        removeInlineFunctions(newAst);

        traverse(newAst, {
          Program(programPath){

            path.get('body').replaceWith(programPath.get('body.0.body').node)
            programPath.stop();
          }
        });

        traverse(newAst, {
          VariableDeclarator(varPath){
            const maybeMultiFunc = MultiCaseFunction.fromNode(varPath.node);
            const maybeSingleFunc = SingleCaseFunction.fromNode(varPath.node);

            if (maybeMultiFunc !== null){
              multiFuncs[varPath.node.id.name] = maybeMultiFunc;

            }else if(maybeSingleFunc !== null){
              singleFuncs[varPath.node.id.name] = maybeSingleFunc

            }

          }
        });

        //var nn = multiFuncs['S6'].createFunc(34)
        //console.log(generate(nn).code)
      }
    }
  })


}
