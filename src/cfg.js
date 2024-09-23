import { types as t, traverse } from "@babel/core";
import generator from "@babel/generator";
import { traverseFast, valueToNode, cloneNode } from "./ast.js";
import { evaluateNode, isApply, isCall, isIIFE } from "./utils.js";

const generate = generator.default;

export class MultiCaseFunction {
  constructor({states, endingState, stateHolder, funcName, argsName}){
    this.states = states;
    this.endingState = endingState;
    this.stateHolder = stateHolder;
    this.funcName = funcName;
    this.argsName = argsName;
  }

  createFunc(initialState){
    const nodes = [];

    let currentState = this.states[initialState];

    while(currentState.stateName !== this.endingState){
      if(currentState["isEnding"] && currentState.stateName !== this.endingState){
        nodes.push(...currentState.nodes)
        break;
      }

      nodes.push(...currentState.nodes);
      currentState = this.states[currentState.transition];
    }

    return t.functionDeclaration(
      t.identifier(`${this.funcName}_bottingrocks_${initialState}`),
      [t.identifier(this.argsName)],
      t.blockStatement(nodes)
    );
  }

  static is(node){
    if (!(
        node &&
        t.isVariableDeclarator(node) &&
        node.init !== null &&
        ["FunctionExpression", "FunctionDeclaration"].includes(node.init.type) &&
       node.init.body.body.length)){
      return false;
    }

    const lastNode = node.init.body.body.slice(-1)[0];

    const isControlFlowWhileNode = ((node) =>
      ["DoWhileStatement", "WhileStatement"].includes(node.type) &&
      t.isBinaryExpression(node.test) &&
      ["!=", "!=="].includes(node.test.operator) &&
      t.isBlockStatement(node.body) &&
      node.body.body.length &&
      t.isSwitchStatement(node.body.body.slice(-1)[0])
    )

    const isControlFlowForNode = ((node) =>
      ["ForStatement"].includes(node.type) &&
      node.init === null &&
      t.isIdentifier(node.update) &&
      t.isBinaryExpression(node.test) &&
      ["!=", "!=="].includes(node.test.operator) &&
      t.isBlockStatement(node.body) &&
      node.body.body.length &&
      t.isSwitchStatement(node.body.body.slice(-1)[0]) &&
      node.body.body.slice(-1)[0].discriminant.name === node.update.name
    )

    switch(lastNode.type){
      case "WhileStatement":
      case "DoWhileStatement":
      case "ForStatement":
        if (!(isControlFlowWhileNode(lastNode) || isControlFlowForNode(lastNode))){
          return false
        }

        return true;
    }

    return false;

  }

  static fromNode(node){

    if(!MultiCaseFunction.is(node)){
      return null;
    }

    const lastNode = node.init.body.body.slice(-1)[0];

    switch(lastNode.type){
      case "WhileStatement":
      case "DoWhileStatement":
      case "ForStatement":
        {

          const funcName = node.id.name;
          const argsName = node.init.params[1].name;

          //Sometimes you get these dynamic test cases: MlH + SlH != 649
          const switchStatement = lastNode.body.body.slice(-1)[0];

          const stateHolder = t.isBinaryExpression(lastNode.test.left)
            ? lastNode.test.left.right.name
            : lastNode.test.left.name

          const endingState = lastNode.test.right.value;

          const states = Object.create(null);

          for(let i = 0; i < switchStatement.cases.length; i++){
            const switchCase = switchStatement.cases[i];
            const stateName = switchCase.test !== null ? switchCase.test.value : "default";
            const state = MultiCaseFunction.createState({
              node: switchCase.consequent[0],
              stateName,
              endingState,
              stateHolder
            });

            states[stateName] = state;
          }

          return new MultiCaseFunction({ states, endingState, stateHolder, funcName, argsName });
        }
    }
  }

  static createState({node, stateName, endingState, stateHolder}){
    const state = {
      stateName: stateName !== null ? stateName : "default",
      isEnding: false,
      transition: null,
      nodes: []
    };

    for(let i = 0; i < node.body.length; i++){
      const n = node.body[i];

      switch(true){
        case (
          t.isExpressionStatement(n) &&
          t.isAssignmentExpression(n.expression) &&
          t.isIdentifier(n.expression.left) &&
          n.expression.left.name === stateHolder
        ):
          let transition = null;
          if (n.expression.operator === "-="){
            transition = stateName - n.expression.right.value;

          }else if(n.expression.operator === "+="){
            transition = stateName + n.expression.right.value;

          }else if(n.expression.operator === "/="){
            transition = stateName / n.expression.right.value;

          }else if(n.expression.operator === "%="){
            transition = stateName % n.expression.right.value;

          }else if(n.expression.operator === "="){
            transition = n.expression.right.value;

          }

          if (transition === endingState){
            state["isEnding"] = true
          }

          state["transition"] = transition;
          break;
        case (
          ["ThrowStatement", "ReturnStatement"].includes(n.type)
        ):
          state["nodes"].push(n);
          state["isEnding"] = true;
          break;
        default:
          state["nodes"].push(n)

      }
    }

    return state;
  }

}

export class SingleCaseFunction {

  constructor(states){

  }

  createFunc(initialState){

  }

  static is(node){
    if (!(
      node &&
      t.isVariableDeclarator(node) &&
      node.init !== null &&
      ["FunctionExpression", "FunctionDeclaration"].includes(node.init.type) &&
     node.init.body.body.length)){

      return false;
    }

    const lastNode = node.init.body.body.slice(-1)[0];

    return (
      ["SwitchStatement"].includes(lastNode.type) &&
      t.isIdentifier(lastNode.discriminant) &&
      !lastNode.cases.filter((c) => !(c === null || t.isNumericLiteral(c))).length
    )

  }

  static fromNode(node){
    if(!SingleCaseFunction.is(node)){
      return null;
    }

    const lastNode = node.init.body.body.slice(-1)[0];


    const funcName = node.id.name;
    const argsName = node.init.params[1].name;

    const switchStatement = lastNode.body.body.slice(-1)[0];

    const states = Object.create(null);

    for(let i = 0; i < switchStatement.cases.length; i++){
      const switchCase = switchStatement.cases[i];
      const stateName = switchCase.test !== null ? switchCase.test.value : "default";
      const state = SingleCaseFunction.createState({
        node: switchCase.consequent[0],
        stateName,
      });

      states[stateName] = state;
    }

    return new SingleCaseFunction({states, funcName, argsName});
  }

  static createState({node, stateName}){
    const state = {
      stateName: stateName !== null ? stateName : "default",
      nodes: []
    };

    for(let i = 0; i < node.body.length; i++){
      const n = node.body[i];
      state["nodes"].push(n);
    }

    return state;
  }

}

export class MainFunction {
  constructor({initialCFG, initialState, multiFuncs, singleFuncs}){
    this.initialCFG = initialCFG;
    this.initialState = initialState;
    this.multiFuncs = multiFuncs;
    this.singleFuncs = singleFuncs;
  }

  createFunc(){

    cons

  }
}
export function createMainFunction({initialCFG, initialState, multiFuncs, singleFuncs}){


  let foundVars = false;
  let stopChecking = false;
  const vars = Object.create(null);

  const funcNode = multiFuncs[initialCFG].createFunc(initialState);

  const newBody = [];
  const newFuncs = [];

  funcNode.body.body.forEach((node, index) => {

    if (stopChecking){
      newBody.push(node);
      return;
    }
    switch(true){
      case (
        !foundVars &&
        t.isExpressionStatement(node) &&
        t.isCallExpression(node.expression) &&
        t.isIdentifier(node.expression.callee) &&
        node.expression.callee.name in multiFuncs
      ):

        const varsInitialFunc = multiFuncs[node.expression.callee.name].createFunc(node.expression.arguments[0].value)
        const bodyNodes = varsInitialFunc.body.body;

        varsInitialFunc.id = t.identifier(`SETUP`);

        bodyNodes.map((n) => vars[n.expression.left.name] = null);

        for(let i = 0; i < bodyNodes.length; i++){
          const varName = bodyNodes[i].expression.left.name;
          const newValue = evaluateNode(bodyNodes[i].expression.right, vars);

          if (newValue !== null){
            vars[varName] = newValue;
            bodyNodes[i].expression.right = valueToNode(newValue);
          }
        }

        newFuncs.push(varsInitialFunc);
        newBody.push(
          t.expressionStatement(
            t.callExpression(
              varsInitialFunc.id,
              []
            )
          )
        );
        foundVars = true;
        break;
      case (
        foundVars &&
        isIIFE(node)
      ):
        newBody.push(node);
        stopChecking = true;
        break;
      case (
        foundVars
      ):

        const clonedNode = cloneNode(node);

        traverseFast(clonedNode, (_node, update) => {

          if (!t.isCallExpression(_node)){
            return
          }

          if (isApply(_node) && (_node.callee.object.name in multiFuncs /*|| _node.callee.property.name in singleFuncs*/)){
          } else if (isCall(_node) && (_node.callee.object.name in multiFuncs /*|| _node.callee.property.name in singleFuncs*/)){

            const callFunc = multiFuncs[_node.callee.object.name].createFunc(_node.arguments[1].value)

            newFuncs.push(callFunc);

            update(_node, t.callExpression(
              callFunc.id,
              _node.arguments[2].elements
            ));
          } else if(t.isIdentifier(_node.callee) && _node.callee.name in multiFuncs){
            const identifierFunc = multiFuncs[_node.callee.name].createFunc(_node.arguments[0].value)

            newFuncs.push(identifierFunc);

            update(_node, t.callExpression(
              identifierFunc.id,
              _node.arguments[1].elements
            ));
          }
        });

        newBody.push(clonedNode);

        break;
      default:
        newBody.push(node);

    }
  });

  return t.functionDeclaration(
    funcNode.id,
    [],
    t.blockStatement([...newFuncs, ...newBody])
  )
}
