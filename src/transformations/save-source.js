import { types as t, traverse } from "@babel/core";
import generator from "@babel/generator";

const generate = generator.default;

export default function saveSource(ast) {
  //ast.savedSource = generate(ast, { compact: true });
}
