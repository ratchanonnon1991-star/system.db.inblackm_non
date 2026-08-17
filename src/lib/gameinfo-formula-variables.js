import { evaluateFormula, extractFormulaRefs, parseFormula } from "@/lib/gamedb-formula";

const MAX_VARIABLES = 100;

function text(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

export function sanitizeGameinfoFormulaVariables(raw) {
  if (!Array.isArray(raw)) return [];
  const seenIds = new Set();
  const variables = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const id = text(item.id, 64);
    const name = text(item.name, 120);
    if (!id || !name || seenIds.has(id)) continue;
    seenIds.add(id);
    variables.push({
      id,
      name,
      category: text(item.category, 120),
      value: text(item.value, 120),
      formula: text(item.formula, 500),
      updatedAt: text(item.updatedAt, 40),
      updatedBy: text(item.updatedBy, 120),
    });
    if (variables.length >= MAX_VARIABLES) break;
  }
  return variables;
}

export function variableDefinition(variable) {
  return {
    id: variable.id,
    name: variable.name,
    category: variable.category,
    value: variable.value,
    formula: variable.formula,
  };
}

export function validateGameinfoFormulaVariables(variables, allowedExternalNames = []) {
  const errors = [];
  const byName = new Map();
  for (const variable of variables || []) {
    if (byName.has(variable.name)) errors.push(`ชื่อตัวแปรซ้ำ: ${variable.name}`);
    if (allowedExternalNames.includes(variable.name)) errors.push(`ชื่อตัวแปรสงวนไว้แล้ว: ${variable.name}`);
    byName.set(variable.name, variable);
    if (!variable.formula && variable.value === "") errors.push(`${variable.name}: ต้องมีค่าหรือสูตร`);
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(variable, path) {
    if (visiting.has(variable.id)) {
      errors.push(`สูตรตัวแปรอ้างอิงวนซ้ำ: ${[...path, variable.name].join(" → ")}`);
      return;
    }
    if (visited.has(variable.id) || !variable.formula) return;
    visiting.add(variable.id);
    try {
      const refs = extractFormulaRefs(parseFormula(variable.formula));
      for (const ref of refs) {
        const dependency = byName.get(ref);
        if (dependency) visit(dependency, [...path, variable.name]);
        else if (!allowedExternalNames.includes(ref)) {
          errors.push(`${variable.name}: ไม่รู้จักค่า ${ref}`);
        }
      }
    } catch (error) {
      errors.push(`${variable.name}: ${error instanceof Error ? error.message : "สูตรไม่ถูกต้อง"}`);
    }
    visiting.delete(variable.id);
    visited.add(variable.id);
  }
  for (const variable of variables || []) visit(variable, []);
  return [...new Set(errors)];
}

export function evaluateGameinfoFormulaVariable(variables, name, resolveExternal = () => undefined) {
  const byName = new Map((variables || []).map((variable) => [variable.name, variable]));
  const memo = new Map();
  function resolve(variableName, stack = []) {
    if (memo.has(variableName)) return memo.get(variableName);
    if (stack.includes(variableName)) throw new Error(`สูตรตัวแปรอ้างอิงวนซ้ำ: ${[...stack, variableName].join(" → ")}`);
    const variable = byName.get(variableName);
    if (!variable) return resolveExternal(variableName);
    let result;
    if (variable.formula) {
      result = evaluateFormula(parseFormula(variable.formula), (ref) => resolve(ref, [...stack, variableName]));
    } else {
      const numeric = Number(variable.value);
      result = variable.value !== "" && Number.isFinite(numeric) ? numeric : variable.value;
    }
    memo.set(variableName, result);
    return result;
  }
  return resolve(name);
}
