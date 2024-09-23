import generator from "@babel/generator";
import { fromFile } from "./src/ast.js"

import ensureBlockStatements from "./src/transformations/ensure-block-statements.js";
import evaluateJSFuckery from "./src/transformations/evaluate-js-fuckery.js";
import expandHorizontalStatementsVertically from "./src/transformations/expand-horizontal-statements-vertically.js";
import moveFunctionsUpwards from "./src/transformations/move-functions-upwards.js";
import reduceControlFlowCases from "./src/transformations/reduce-control-flow-cases.js";
import removeInlineFunctions from "./src/transformations/remove-inline-functions.js";
import removeUnused from "./src/transformations/remove-unused.js";


const generate = generator.default;

const filePath = process.argv.slice(-1)[0];

const { ast, source } = fromFile(filePath)

ast.source = source;
ensureBlockStatements(ast);
expandHorizontalStatementsVertically(ast);
moveFunctionsUpwards(ast);
removeUnused(ast);
evaluateJSFuckery(ast);
removeInlineFunctions(ast);
reduceControlFlowCases(ast);

console.log(generate(ast).code);

