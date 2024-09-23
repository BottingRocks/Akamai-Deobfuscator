import { types as t, traverse } from "@babel/core";
import generator from "@babel/generator"
import jsFuckery from "../jsfuckery.js";


export default function evaluateJSFuckery(ast) {

  traverse(ast, {
    "FunctionExpression|FunctionDeclaration": {
      exit(path) {
        jsFuckery(path);
      }
    }
  });
}
