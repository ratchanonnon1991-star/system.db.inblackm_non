// Formula engine for GameDB computed columns.
//
// Numbers, text in "double quotes", column refs in brackets: [ชื่อคอลัมน์].
// Arithmetic + - * / ( ), text join with &, comparison = <> < <= > >=, and the
// functions listed in FUNCTIONS below.
//
//   ([ราคาขาย] - [ต้นทุน]) / [ต้นทุน] * 100
//   IF(DAYSUNTIL([วันหมดอายุ]) < 3, "ใกล้หมดอายุ", "ปกติ")
//   CONCAT([PASS], " · ", LEFT([Mail], 12))
//
// Every value is a number, a text, a true/false, a date or null. A null anywhere
// makes the result null, so missing data shows as blank instead of NaN — that is
// what keeps #N/A and #VALUE! out of the tables this replaces.
import { addDays, dayDiff, daysUntil, toDate, toNumber } from "@/lib/gamedb-values";

// name: [minimum arguments, maximum arguments, result type]. Arity is checked
// while parsing so the editor can say what is wrong before anything runs.
export const FUNCTIONS = {
  IF: [3, 3, "branch"],
  AND: [1, 20, "boolean"],
  OR: [1, 20, "boolean"],
  NOT: [1, 1, "boolean"],
  ISBLANK: [1, 1, "boolean"],
  COALESCE: [2, 20, "branch"],
  IFERROR: [2, 2, "branch"],

  TODAY: [0, 0, "date"],
  DAYS: [2, 2, "number"],
  DAYSUNTIL: [1, 1, "number"],
  ADDDAYS: [2, 2, "date"],
  YEAR: [1, 1, "number"],
  MONTH: [1, 1, "number"],
  DAY: [1, 1, "number"],

  CONCAT: [1, 20, "text"],
  LEFT: [2, 2, "text"],
  RIGHT: [2, 2, "text"],
  MID: [3, 3, "text"],
  LEN: [1, 1, "number"],
  UPPER: [1, 1, "text"],
  LOWER: [1, 1, "text"],
  TRIM: [1, 1, "text"],
  TEXT: [1, 1, "text"],
  CONTAINS: [2, 2, "boolean"],

  ROUND: [1, 2, "number"],
  ABS: [1, 1, "number"],
  MIN: [1, 20, "number"],
  MAX: [1, 20, "number"],
  SUM: [1, 20, "number"],
};

export const FUNCTION_NAMES = Object.keys(FUNCTIONS);

const COMPARE_OPS = ["<=", ">=", "<>", "!=", "=", "<", ">"];

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
    const left = parseConcat();
    skipSpaces();
    const op = COMPARE_OPS.find((candidate) => src.startsWith(candidate, pos));
    if (!op) return left;
    pos += op.length;
    const right = parseConcat();
    skipSpaces();
    return { type: "compare", op: op === "!=" ? "<>" : op, left, right };
  }

  function parseConcat() {
    let left = parseAdditive();
    skipSpaces();
    while (src[pos] === "&") {
      pos += 1;
      const right = parseAdditive();
      left = { type: "concat", left, right };
      skipSpaces();
    }
    return left;
  }

  function parseAdditive() {
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

  function parseString() {
    const quote = src[pos];
    pos += 1;
    let text = "";
    for (;;) {
      if (pos >= src.length) throw error("ข้อความไม่ครบ ขาดเครื่องหมายคำพูดปิด");
      if (src[pos] === quote) {
        // "" inside a string is one literal quote, the same as a spreadsheet.
        if (src[pos + 1] === quote) {
          text += quote;
          pos += 2;
          continue;
        }
        pos += 1;
        return { type: "string", value: text };
      }
      text += src[pos];
      pos += 1;
    }
  }

  function parseCall(name) {
    const spec = FUNCTIONS[name];
    if (!spec) throw error(`ไม่รู้จักฟังก์ชัน ${name}`);
    pos += 1; // the "("
    const args = [];
    skipSpaces();
    if (src[pos] === ")") {
      pos += 1;
    } else {
      for (;;) {
        args.push(parseExpression());
        skipSpaces();
        if (src[pos] === ",") {
          pos += 1;
          continue;
        }
        if (src[pos] === ")") {
          pos += 1;
          break;
        }
        throw error(`${name}: ขาด , หรือ ) ที่ตำแหน่ง ${pos + 1}`);
      }
    }
    const [min, max] = spec;
    if (args.length < min || args.length > max) {
      throw error(
        min === max
          ? `${name} ต้องมี ${min} ค่าในวงเล็บ (ใส่มา ${args.length})`
          : `${name} ต้องมี ${min}-${max} ค่าในวงเล็บ (ใส่มา ${args.length})`
      );
    }
    return { type: "call", name, args };
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
    if (src[pos] === '"' || src[pos] === "'") return parseString();

    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(pos));
    if (word) {
      const name = word[0].toUpperCase();
      pos += word[0].length;
      skipSpaces();
      if (src[pos] !== "(") throw error(`${word[0]}: ฟังก์ชันต้องตามด้วย (`);
      return parseCall(name);
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
  switch (ast.type) {
    case "ref":
      refs.add(ast.name);
      break;
    case "negate":
      extractFormulaRefs(ast.operand, refs);
      break;
    case "binary":
    case "compare":
    case "concat":
      extractFormulaRefs(ast.left, refs);
      extractFormulaRefs(ast.right, refs);
      break;
    case "call":
      for (const arg of ast.args) extractFormulaRefs(arg, refs);
      break;
    default:
      break;
  }
  return refs;
}

/** The column type a formula's result should be displayed and exported as. */
export function inferFormulaType(ast) {
  if (!ast) return "number";
  switch (ast.type) {
    case "number":
      return "number";
    case "string":
      return "text";
    case "ref":
      return "text";
    case "negate":
    case "binary":
      return "number";
    case "compare":
      return "boolean";
    case "concat":
      return "text";
    case "call": {
      const kind = FUNCTIONS[ast.name]?.[2];
      if (kind !== "branch") return kind || "number";
      // IF / COALESCE / IFERROR are whatever their branches are; if the
      // branches disagree there is nothing better to say than text.
      const branches = ast.name === "IF" ? ast.args.slice(1) : ast.args;
      const types = branches.map(inferFormulaType);
      return types.every((type) => type === types[0]) ? types[0] : "text";
    }
    default:
      return "number";
  }
}

// --- evaluation ----------------------------------------------------------

const isBlank = (value) =>
  value === null || value === undefined || (typeof value === "string" && value.trim() === "");

function asText(value) {
  if (isBlank(value)) return "";
  if (value instanceof Date) return value.toLocaleDateString("th-TH");
  if (typeof value === "boolean") return value ? "จริง" : "เท็จ";
  return String(value);
}

function truthy(value) {
  if (typeof value === "boolean") return value;
  if (isBlank(value)) return false;
  const num = toNumber(value);
  if (num !== null) return num !== 0;
  return true;
}

/** Numbers by value, dates by day, everything else as trimmed text. */
function compareValues(left, right) {
  const leftNum = toNumber(left);
  const rightNum = toNumber(right);
  if (leftNum !== null && rightNum !== null) return Math.sign(leftNum - rightNum);
  const leftDate = toDate(left);
  const rightDate = toDate(right);
  if (leftDate && rightDate) return Math.sign(dayDiff(leftDate, rightDate));
  const a = asText(left).trim();
  const b = asText(right).trim();
  return a === b ? 0 : a < b ? -1 : 1;
}

function numericArgs(values) {
  const numbers = values.map(toNumber);
  return numbers.some((num) => num === null) ? null : numbers;
}

function callFunction(name, args, evalArg) {
  // These decide for themselves which arguments to evaluate.
  if (name === "IF") return truthy(evalArg(0)) ? evalArg(1) : evalArg(2);
  if (name === "AND") {
    for (let i = 0; i < args.length; i += 1) if (!truthy(evalArg(i))) return false;
    return true;
  }
  if (name === "OR") {
    for (let i = 0; i < args.length; i += 1) if (truthy(evalArg(i))) return true;
    return false;
  }
  if (name === "COALESCE" || name === "IFERROR") {
    for (let i = 0; i < args.length; i += 1) {
      const value = evalArg(i);
      if (!isBlank(value)) return value;
    }
    return null;
  }

  const values = args.map((_, index) => evalArg(index));
  const [first] = values;

  switch (name) {
    case "NOT":
      return !truthy(first);
    case "ISBLANK":
      return isBlank(first);

    case "TODAY": {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    case "DAYS":
      return dayDiff(first, values[1]);
    case "DAYSUNTIL":
      return daysUntil(first);
    case "ADDDAYS":
      return addDays(first, values[1]);
    case "YEAR":
      return toDate(first)?.getFullYear() ?? null;
    case "MONTH":
      return toDate(first) ? toDate(first).getMonth() + 1 : null;
    case "DAY":
      return toDate(first)?.getDate() ?? null;

    case "CONCAT":
      return values.map(asText).join("");
    case "LEFT": {
      const count = toNumber(values[1]);
      return count === null ? null : asText(first).slice(0, Math.max(0, Math.trunc(count)));
    }
    case "RIGHT": {
      const count = toNumber(values[1]);
      if (count === null) return null;
      const size = Math.max(0, Math.trunc(count));
      return size === 0 ? "" : asText(first).slice(-size);
    }
    case "MID": {
      const start = toNumber(values[1]);
      const length = toNumber(values[2]);
      if (start === null || length === null) return null;
      // 1-based, like every spreadsheet.
      const from = Math.max(0, Math.trunc(start) - 1);
      return asText(first).slice(from, from + Math.max(0, Math.trunc(length)));
    }
    case "LEN":
      return asText(first).length;
    case "UPPER":
      return asText(first).toUpperCase();
    case "LOWER":
      return asText(first).toLowerCase();
    case "TRIM":
      return asText(first).trim();
    case "TEXT":
      return asText(first);
    case "CONTAINS":
      return asText(first).toLowerCase().includes(asText(values[1]).toLowerCase());

    case "ROUND": {
      const num = toNumber(first);
      if (num === null) return null;
      const digits = values.length > 1 ? toNumber(values[1]) : 0;
      if (digits === null) return null;
      const factor = 10 ** Math.trunc(digits);
      return Math.round(num * factor) / factor;
    }
    case "ABS": {
      const num = toNumber(first);
      return num === null ? null : Math.abs(num);
    }
    case "MIN": {
      const numbers = numericArgs(values);
      return numbers === null ? null : numbers.reduce((low, num) => (num < low ? num : low));
    }
    case "MAX": {
      const numbers = numericArgs(values);
      return numbers === null ? null : numbers.reduce((high, num) => (num > high ? num : high));
    }
    case "SUM": {
      const numbers = numericArgs(values);
      return numbers === null ? null : numbers.reduce((total, num) => total + num, 0);
    }
    default:
      return null;
  }
}

/**
 * resolveRef(name) returns the raw cell value of another column — a number, a
 * string, null, whatever the database handed back. The engine coerces from
 * there, so the caller does not have to guess what the formula wanted.
 */
export function evaluateFormula(ast, resolveRef) {
  if (!ast) return null;
  switch (ast.type) {
    case "number":
      return ast.value;
    case "string":
      return ast.value;
    case "ref": {
      const value = resolveRef(ast.name);
      return value === undefined ? null : value;
    }
    case "negate": {
      const value = toNumber(evaluateFormula(ast.operand, resolveRef));
      return value === null ? null : -value;
    }
    case "concat": {
      const left = evaluateFormula(ast.left, resolveRef);
      const right = evaluateFormula(ast.right, resolveRef);
      return `${asText(left)}${asText(right)}`;
    }
    case "compare": {
      const left = evaluateFormula(ast.left, resolveRef);
      const right = evaluateFormula(ast.right, resolveRef);
      // Blank compares equal only to blank; otherwise there is no answer.
      if (isBlank(left) || isBlank(right)) {
        if (ast.op === "=") return isBlank(left) && isBlank(right);
        if (ast.op === "<>") return !(isBlank(left) && isBlank(right));
        return null;
      }
      const order = compareValues(left, right);
      switch (ast.op) {
        case "=":
          return order === 0;
        case "<>":
          return order !== 0;
        case "<":
          return order < 0;
        case "<=":
          return order <= 0;
        case ">":
          return order > 0;
        case ">=":
          return order >= 0;
        default:
          return null;
      }
    }
    case "binary": {
      const left = toNumber(evaluateFormula(ast.left, resolveRef));
      const right = toNumber(evaluateFormula(ast.right, resolveRef));
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
    case "call":
      return callFunction(ast.name, ast.args, (index) =>
        evaluateFormula(ast.args[index], resolveRef)
      );
    default:
      return null;
  }
}
