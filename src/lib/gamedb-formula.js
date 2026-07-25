// Tiny arithmetic formula engine for GameDB computed columns.
// Syntax: numbers, + - * / ( ), and column refs in brackets: [ชื่อคอลัมน์]
// Example: ([ราคาขาย] - [ต้นทุน]) / [ต้นทุน] * 100

export function parseFormula(source) {
  const src = String(source || "");
  let pos = 0;

  function error(message) {
    const err = new Error(message);
    err.pos = pos;
    return err;
  }

  function skipSpaces() {
    while (pos < src.length && /\s/.test(src[pos])) pos += 1;
  }

  function parseExpression() {
    let left = parseTerm();
    skipSpaces();
    while (src[pos] === "+" || src[pos] === "-") {
      const op = src[pos];
      pos += 1;
      const right = parseTerm();
      left = { type: "binary", op, left, right };
      skipSpaces();
    }
    return left;
  }

  function parseTerm() {
    let left = parseFactor();
    skipSpaces();
    while (src[pos] === "*" || src[pos] === "/") {
      const op = src[pos];
      pos += 1;
      const right = parseFactor();
      left = { type: "binary", op, left, right };
      skipSpaces();
    }
    return left;
  }

  function parseFactor() {
    skipSpaces();
    if (src[pos] === "-") {
      pos += 1;
      return { type: "negate", operand: parseFactor() };
    }
    if (src[pos] === "(") {
      pos += 1;
      const inner = parseExpression();
      skipSpaces();
      if (src[pos] !== ")") throw error("วงเล็บไม่ครบ ขาด )");
      pos += 1;
      return inner;
    }
    if (src[pos] === "[") {
      const end = src.indexOf("]", pos + 1);
      if (end === -1) throw error("อ้างอิงคอลัมน์ไม่ครบ ขาด ]");
      const name = src.slice(pos + 1, end).trim();
      if (!name) throw error("ชื่อคอลัมน์ใน [ ] ว่างเปล่า");
      pos = end + 1;
      return { type: "ref", name };
    }
    const numberMatch = /^\d+(\.\d+)?/.exec(src.slice(pos));
    if (numberMatch) {
      pos += numberMatch[0].length;
      return { type: "number", value: Number(numberMatch[0]) };
    }
    throw error(`อ่านสูตรไม่ได้ที่ตำแหน่ง ${pos + 1}`);
  }

  const ast = parseExpression();
  skipSpaces();
  if (pos < src.length) throw error(`มีอักขระเกินที่ตำแหน่ง ${pos + 1}`);
  return ast;
}

export function extractFormulaRefs(ast, refs = new Set()) {
  if (!ast) return refs;
  if (ast.type === "ref") refs.add(ast.name);
  if (ast.type === "negate") extractFormulaRefs(ast.operand, refs);
  if (ast.type === "binary") {
    extractFormulaRefs(ast.left, refs);
    extractFormulaRefs(ast.right, refs);
  }
  return refs;
}

// resolveRef(name) must return a number or null. A null anywhere makes the
// whole result null so missing data shows as blank instead of NaN.
export function evaluateFormula(ast, resolveRef) {
  switch (ast.type) {
    case "number":
      return ast.value;
    case "ref": {
      const value = resolveRef(ast.name);
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    }
    case "negate": {
      const value = evaluateFormula(ast.operand, resolveRef);
      return value === null ? null : -value;
    }
    case "binary": {
      const left = evaluateFormula(ast.left, resolveRef);
      const right = evaluateFormula(ast.right, resolveRef);
      if (left === null || right === null) return null;
      switch (ast.op) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return right === 0 ? null : left / right;
        default:
          return null;
      }
    }
    default:
      return null;
  }
}
