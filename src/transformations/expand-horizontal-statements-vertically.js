import { types as t, traverse } from "@babel/core";
import generator from "@babel/generator";

const generate = generator.default;

const FUNC_NODE_TYPES = ["FunctionDeclaration", "FunctionExpression"];

const NESTED_CHILDREN_TYPES = "AssignmentExpression|SequenceExpression|ConditionalExpression";
const VISITORS = {
  ExpressionStatement(path) {
    const expression = path.get("expression");

    if (hasNestedChild(expression)) {
      const statements = breakStatementIntoMultiple(expression);
      if (statements.length === 1) {
        path.replaceWith(statements[0]);
      } else {
        path.replaceWithMultiple(statements);
      }
    }
  },

  VariableDeclaration(path) {
    const pushUpStatements = [];

    const declarations = path.get("declarations");
    declarations.forEach((declaration) => {
      if (hasNestedChild(declaration)) {
        const statements = breakStatementIntoMultiple(declaration.get("init"));

        if (statements.length) {
          statements.pop();
          pushUpStatements.push(...statements);
        }
      }
    });

    pushUpStatements.forEach((statement) => path.insertBefore(statement));
  },

  IfStatement(path) {
    const test = path.get("test");

    switch (test.type) {
      case "AssignmentExpression":
        path.insertBefore(t.expressionStatement(test.node));
        test.replaceWith(test.node.left);
        break;

      case "LogicalExpression":
        const left = test.get("left");
        const right = test.get("right");
        const operator = test.get("operator").node;

        if (operator === "&&" && right.type === "AssignmentExpression") {
          path.get("consequent").unshiftContainer("body", t.expressionStatement(right.node));
          test.replaceWith(left.node);
        }

        break;
    }

    if (hasNestedChild(test)) {
      const statements = breakStatementIntoMultiple(test);
      const lastStatement = statements.pop();

      if (lastStatement.type === "ExpressionStatement") {
        const newIf = t.ifStatement(lastStatement.expression, path.get("consequent").node, path.get("alternate").node);
        path.replaceWithMultiple([...statements, newIf]);
      } else if (lastStatement.type === "IfStatement") {
        const firstNodeInLast = lastStatement.consequent.body[0];

        if (
          firstNodeInLast.type === "IfStatement" &&
          firstNodeInLast.consequent.type === "BlockStatement" &&
          firstNodeInLast.consequent.body.length === 0
        ) {
          firstNodeInLast.consequent = path.get("consequent").node;
          firstNodeInLast.alternate = path.get("alternate").node;

          path.replaceWith(lastStatement);
        } else {
          throw Error("NEED TO FIX IFSTATEMENT");
        }
      }
    }
  },

  ForStatement(path) {
    const init = path.get("init");

    if (hasNestedChild(init)) {
      const statements = breakStatementIntoMultiple(init);
      const lastStatement = statements.pop();

      if (lastStatement.type === "ExpressionStatement") {
        const newFor = t.forStatement(lastStatement.expression, path.node.test, path.node.update, path.node.body);
        path.replaceWithMultiple([...statements, newFor]);
      } else if (lastStatement.type === "IfStatement") {
        throw Error("NEED TO FOR STATEMENT");
      }
    }
  },
  ReturnStatement(path) {
    const argument = path.get("argument");
    if (hasNestedChild(argument)) {
      const statements = breakStatementIntoMultiple(argument);
      const lastStatement = statements.pop();

      if (lastStatement !== undefined) {
        const newReturn = t.returnStatement(lastStatement.expression);
        path.replaceWithMultiple([...statements, newReturn]);
      }
    }
  },
};

function hasNestedChild(path) {
  const functionPaths = [];

  let hasAssignmentExpressions = false;
  let hasSequenceExpressions = false;
  let hasConditionalExpressions = false;

  path.traverse({
    enter(childPath) {
      if (FUNC_NODE_TYPES.includes(childPath.type)) {
        !childPath.getData("skip", false) && functionPaths.push(childPath);
        childPath.skip();
        return;
      }

      switch (childPath.type) {
        case "AssignmentExpression":
          switch (true) {
            case childPath.parentPath.type === "AssignmentExpression" &&
              childPath.parentPath.parentPath.type === "ExpressionStatement":
              hasAssignmentExpressions = false;
              break;
            case childPath.parentPath.type === "SequenceExpression":
              hasAssignmentExpressions = true;
              break;
          }
          break;

        case "SequenceExpression":
          //Special case where the SequenceExpression matters. See:https://stackoverflow.com/questions/9107240/1-evalthis-vs-evalthis-in-javascript
          if (
            !(
              childPath.get("expressions").length === 2 &&
              childPath.get("expressions.0").type === "NumericLiteral" &&
              [0, 1].includes(childPath.get("expressions.0.value").node)
            )
          ) {
            hasSequenceExpressions = true;
          }
          break;

        case "ConditionalExpression":
          switch (true) {
            case !(
              childPath.parentPath.type === "AssignmentExpression" &&
              childPath.parentPath.parentPath.type === "ExpressionStatement"
            ):
              if (hasNestedChild(childPath)) {
                hasConditionalExpressions = true;
              }
              break;
          }
          break;
        default:
      }
    },
  });

  if (path.type === "SequenceExpression") {
    hasSequenceExpressions = true;
  }

  if (
    path.type === "LogicalExpression" &&
    (path.node.left.type === "SequenceExpression" ||
      path.node.right.type === "SequenceExpression" ||
      path.node.right.type === "AssignmentExpression")
  ) {
    hasAssignmentExpressions = true;
  }

  return hasAssignmentExpressions || hasSequenceExpressions || hasConditionalExpressions;
}

function adjustIfNestedChildren(path, statements) {
  if (FUNC_NODE_TYPES.includes(path.type)) {
    path.get("body").traverse(VISITORS);
    path.setData("skip", true);
  } else {
    const hasNestedChildren = hasNestedChild(path);

    if (hasNestedChildren) {
      const nestedChildren = breakStatementIntoMultiple(path);

      if (nestedChildren.length) {
        const lastChild = nestedChildren.pop();

        if (lastChild !== undefined && lastChild.type === "ExpressionStatement") {
          path.replaceWith(lastChild.expression);
        } else {
          path.remove();
        }
        statements.push(...nestedChildren);
      }
    }
    path.stop();
  }
}

function breakStatementIntoMultiple(path) {
  const statements = [];

  switch (path.type) {
    case "ArrayExpression":
      {
        const elements = path.get("elements");
        elements.forEach((element) => adjustIfNestedChildren(element, statements));
        statements.push(t.expressionStatement(path.node));
      }

      break;
    case "ObjectExpression":
      {
        const properties = path.get("properties");
        properties.forEach((propertie) => adjustIfNestedChildren(propertie.get("value"), statements));
        statements.push(t.expressionStatement(path.node));
      }

      break;
    case "LogicalExpression":
      {
        const left = path.get("left");
        const right = path.get("right");
        const operator = path.get("operator").node;
        const flip = operator === "||";
        const varName = path.scope.generateUidIdentifier("_$LOGEXP");
        const testNode = flip ? t.unaryExpression("!", varName) : varName;

        const varNameDec = t.variableDeclaration("var", [t.variableDeclarator(varName, left.node)]);
        const rightAssignment = t.expressionStatement(t.assignmentExpression("=", varName, right.node));

        const testLeftSideIf = t.ifStatement(testNode, t.blockStatement([rightAssignment]));

        statements.push(varNameDec, testLeftSideIf, t.expressionStatement(varName));

        path.replaceWith(varName);
      }

      break;
    case "SequenceExpression":
      {
        path.get("expressions").forEach((_p) => {
          if (hasNestedChild(_p)) {
            const newStatements = breakStatementIntoMultiple(_p);
            statements.push(...newStatements);
          } else {
            statements.push(t.expressionStatement(_p.node));
          }
        });

        const lastStatement = statements.slice(-1)[0];

        if (lastStatement.type === "ExpressionStatement") {
          path.replaceWith(statements.slice(-1)[0].expression);
        }
      }

      break;
    case "AssignmentExpression":
      {
        const left = path.get("left");
        const right = path.get("right");
        const sides = [left, right];
        sides.forEach((side) => adjustIfNestedChildren(side, statements));

        statements.push(t.expressionStatement(path.node));
      }
      break;
    case "UnaryExpression":
      {
        const argument = path.get("argument");

        const hasNestedChildren = hasNestedChild(argument);

        if (hasNestedChildren) {
          adjustIfNestedChildren(argument, statements);

          statements.push(t.expressionStatement(path.node));
        } else if (NESTED_CHILDREN_TYPES.includes(argument.type)) {
          switch (argument.type) {
            case "AssignmentExpression":
              statements.push(t.expressionStatement(argument.node));
              argument.replaceWith(argument.node.left);

              statements.push(t.expressionStatement(argument.node));

              break;
            case "SequenceExpression":
              const sequenceStatements = breakStatementIntoMultiple(argument);

              if (sequenceStatements.length) {
                const lastStatement = sequenceStatements.pop();

                argument.replaceWith(lastStatement.expression);
                statements.push(...sequenceStatements);
              }

              statements.push(t.expressionStatement(argument.node));

              break;
            case "ConditionalExpression":
              throw Error("You need to fix this");
          }
        }
      }

      break;
    case "MemberExpression":
      {
        const property = path.get("property");
        const object = path.get("object");

        const hasPropertyNestedChildren = hasNestedChild(property);
        const hasObjectNestedChildren = hasNestedChild(object);

        if (hasPropertyNestedChildren) {
          adjustIfNestedChildren(property, statements);
        }

        if (hasObjectNestedChildren) {
          adjustIfNestedChildren(object, statements);
        }

        statements.push(t.expressionStatement(path.node));
      }
      break;
    case "BinaryExpression":
      {
        const left = path.get("left");
        const right = path.get("right");

        const sides = [left, right];

        sides.forEach((side) => adjustIfNestedChildren(side, statements));

        statements.push(t.expressionStatement(path.node));
      }

      break;
    case "ConditionalExpression":
      {
        const consequent = path.get("consequent");
        const alternate = path.get("alternate");
        const test = path.get("test");

        const tempId = path.scope.generateUidIdentifier(`_$CONEXP`);
        const consequentBlock = t.blockStatement([
          t.variableDeclaration("var", [t.variableDeclarator(tempId, consequent.node)]),
        ]);

        const alternateBlock = t.blockStatement([
          t.variableDeclaration("var", [t.variableDeclarator(tempId, alternate.node)]),
        ]);

        const newIf = t.ifStatement(test.node, consequentBlock, alternateBlock);

        statements.push(newIf);

        statements.push(t.expressionStatement(tempId));

        path.replaceWith(tempId);
      }
      break;
    case "CallExpression":
    case "NewExpression":
      {
        const callee = path.get("callee");
        const args = path.get("arguments");

        args.forEach((arg) => {
          const hasNestedChildren = hasNestedChild(arg);

          if (FUNC_NODE_TYPES.includes(arg.type)) {
            arg.get("body").traverse(VISITORS);
          } else if (hasNestedChildren) {
            adjustIfNestedChildren(arg, statements);
          }
        });

        adjustIfNestedChildren(callee, statements);

        statements.push(t.expressionStatement(path.node));
      }
      break;
    case "VariableDeclaration":
      {
        const declarations = path.get("declarations");

        declarations.forEach((declaration) => {
          adjustIfNestedChildren(declaration.get("init"), statements);
        });

        statements.push(path.node);
      }
      break;
    case "FunctionDeclaration":
    case "FunctionExpression":
      {
        path.get("body").traverse(VISITORS);
        if (path.type === "FunctionExpression") {
          statements.push(t.expressionStatement(path.node));
        } else {
          statements.push(path.node);
        }
      }

      break;
    case "Identifier":
    case "NumericLiteral":
    case "StringLiteral":
      {
        statements.push(t.expressionStatement(path.node));
      }
      break;
    default:
      throw Error(`unknown test type:${path.type}`);
  }

  return statements;
}
export default function expandHorizontalStatementsVertically(ast) {
  traverse(ast, {
    "ForInStatement|ForStatement"(path) {
      const body = path.get("body");

      if (body.type !== "BlockStatement") {
        body.replaceWith(t.blockStatement([body.node]));
      }

      if (path.type === "ForStatement") {
        const init = path.get("init");

        if (init.node !== null) {
          if (init.node.type === "VariableDeclaration") {
            path.insertBefore(init.node);
          } else if (!t.isIdentifier(init.node)) {
            path.insertBefore(t.expressionStatement(init.node));
          }
        }
        init.remove();
      }
    },
  });
  traverse(ast, {
    VariableDeclaration(path) {
      const declarations = path.get("declarations");

      if (!(declarations.length > 1)) {
        return;
      }

      path.replaceWithMultiple(
        declarations.map((p) => t.variableDeclaration("var", [t.variableDeclarator(p.node.id, p.node.init)]))
      );
    },
  });

  traverse(ast, VISITORS);

  traverse(ast, {
    VariableDeclaration(path) {
      const declarations = path.get("declarations");
      if (declarations.length !== 1) {
        return;
      }

      const firstVar = declarations[0];
      const nextPath = path.getSibling(path.key + 1);
      const nextNextPath = path.getSibling(path.key + 2);

      if (
        !(
          t.isExpressionStatement(nextNextPath.node) &&
          t.isIdentifier(nextNextPath.node.expression) &&
          t.isIfStatement(nextPath.node) &&
          t.isExpressionStatement(nextPath.node.consequent.body.slice(-1)[0]) &&
          t.isAssignmentExpression(nextPath.node.consequent.body.slice(-1)[0].expression) &&
          t.isIdentifier(nextPath.node.consequent.body.slice(-1)[0].expression.left) &&
          nextPath.node.consequent.body.slice(-1)[0].expression.left.name === nextNextPath.node.expression.name
        )
      ) {
        return;
      }

      const nextPathTest = nextPath.get("test").node;
      nextPathTest.type === "UnaryExpression" && nextPathTest.operator === "!"
        ? nextPath.get("test").replaceWith(t.unaryExpression("!", firstVar.node.init))
        : nextPath.get("test").replaceWith(firstVar.node.init);

      nextPath
        .get("consequent.body")
        .slice(-1)[0]
        .replaceWith(t.expressionStatement(nextPath.get("consequent.body").slice(-1)[0].node.expression.right));

      nextNextPath.remove();
      path.remove();
    },

    IfStatement(path) {
      const { consequent, alternate } = path.node;

      if (alternate === null) {
        return;
      }

      const lastConsequent = consequent.body.slice(-1)[0];
      const lastAlternate = alternate.body.slice(-1)[0];
      const nextPath = path.getSibling(path.key + 1);

      if (
        !(
          t.isVariableDeclaration(lastConsequent) &&
          lastConsequent.declarations.length === 1 &&
          t.isVariableDeclaration(lastAlternate) &&
          lastAlternate.declarations.length === 1 &&
          lastConsequent.declarations[0].id.name === lastAlternate.declarations[0].id.name &&
          (t.isExpressionStatement(nextPath.node) || t.isReturnStatement(nextPath.node) || t.isThrowStatement(nextPath.node))
        )
      ) {
        return;
      }
      switch (nextPath.type) {
        case "ExpressionStatement":
          path
            .get("consequent.body")
            .slice(-1)[0]
            .replaceWith(t.expressionStatement(path.get("consequent.body").slice(-1)[0].node.declarations[0].init));

          path
            .get("alternate.body")
            .slice(-1)[0]
            .replaceWith(t.expressionStatement(path.get("alternate.body").slice(-1)[0].node.declarations[0].init));
          break;
        case "ReturnStatement":
          path
            .get("consequent.body")
            .slice(-1)[0]
            .replaceWith(t.returnStatement(path.get("consequent.body").slice(-1)[0].node.declarations[0].init));

          path
            .get("alternate.body")
            .slice(-1)[0]
            .replaceWith(t.returnStatement(path.get("alternate.body").slice(-1)[0].node.declarations[0].init));
          break;
        case "ThrowStatement":
          path
            .get("consequent.body")
            .slice(-1)[0]
            .replaceWith(t.throwStatement(path.get("consequent.body").slice(-1)[0].node.declarations[0].init));

          path
            .get("alternate.body")
            .slice(-1)[0]
            .replaceWith(t.throwStatement(path.get("alternate.body").slice(-1)[0].node.declarations[0].init));
      }

      nextPath.remove();
    },
  });
}
