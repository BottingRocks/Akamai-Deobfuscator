import { types as t, traverse } from "@babel/core";
import generator from "@babel/generator";

const generate = generator.default;

export default function removeUnused(ast) {
  traverse(ast, {
    BlockStatement: {
      exit(path) {
        for (let binding in path.scope.bindings) {
          const _binding = path.scope.bindings[binding];
          switch (true) {
            case _binding.kind === "hoisted" && _binding.path.type === "FunctionDeclaration" && _binding.references === 0:
            case _binding.kind === "var" &&
              _binding.path.type === "VariableDeclarator" &&
              _binding.path.node.init !== null &&
              ["FunctionDeclaration", "FunctionExpression"].includes(_binding.path.node.init.type) &&
              _binding.references === 0:
            case _binding.kind === "var" &&
              _binding.path.type === "VariableDeclarator" &&
              _binding.path.node.init !== null &&
              !["CallExpression", "NewExpression", "ConditionalExpression"].includes(_binding.path.node.init.type) &&
              _binding.references === 0:
              try {
                _binding.path.skip();
                _binding.path.remove();
              } catch (e) {}
              break;
          }
        }
      },
    },
  });
  traverse(ast, {
    ExpressionStatement(path) {
      const { expression } = path.node;

      if (t.isLiteral(expression) || t.isIdentifier(expression)) {
        path.remove();
      }
    },
  });
}
