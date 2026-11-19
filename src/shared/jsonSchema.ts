import type { JsonSchema } from "./types";

export interface SchemaError {
  path: string;
  message: string;
}

const FORMATS: Record<string, RegExp> = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  uri: /^[a-zA-Z][a-zA-Z0-9+.-]*:\S+$/,
  url: /^[a-zA-Z][a-zA-Z0-9+.-]*:\S+$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  time: /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/,
  "date-time": /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/,
};

export function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function matchesType(value: unknown, type: string): boolean {
  const actual = typeOf(value);
  if (type === "number") return actual === "number" || actual === "integer";
  return actual === type;
}

/**
 * A small validator for the parts of JSON Schema tool authors use. It never evaluates code,
 * so it runs under strict CSPs, and it reports every problem rather than the first.
 */
export function validate(value: unknown, schema: JsonSchema | undefined, path = "$"): SchemaError[] {
  if (!schema || typeof schema !== "object") return [];
  const errors: SchemaError[] = [];
  const push = (message: string, at = path) => errors.push({ path: at, message });

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) {
      push(`expected ${types.join(" or ")}, got ${typeOf(value)}`);
      return errors;
    }
  }
  if (schema.const !== undefined && JSON.stringify(schema.const) !== JSON.stringify(value)) {
    push(`must equal ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
    push(`must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(", ")}`);
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) push(`shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) push(`longer than ${schema.maxLength}`);
    if (schema.pattern) {
      try {
        if (!new RegExp(schema.pattern, "u").test(value)) push(`does not match /${schema.pattern}/`);
      } catch {
        push(`has an invalid pattern /${schema.pattern}/`);
      }
    }
    if (schema.format && FORMATS[schema.format] && !FORMATS[schema.format].test(value)) {
      push(`is not a valid ${schema.format}`);
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) push(`less than ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) push(`greater than ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
      push(`must be greater than ${schema.exclusiveMinimum}`);
    }
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
      push(`must be less than ${schema.exclusiveMaximum}`);
    }
    if (schema.multipleOf && Math.abs(value / schema.multipleOf - Math.round(value / schema.multipleOf)) > 1e-9) {
      push(`not a multiple of ${schema.multipleOf}`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) push(`fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) push(`more than ${schema.maxItems} items`);
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) {
      push("items must be unique");
    }
    if (schema.items) {
      value.forEach((item, i) => errors.push(...validate(item, schema.items, `${path}[${i}]`)));
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (obj[key] === undefined) push(`missing required property "${key}"`);
    }
    const props = schema.properties ?? {};
    for (const [key, child] of Object.entries(obj)) {
      if (props[key]) {
        errors.push(...validate(child, props[key], `${path}.${key}`));
      } else if (schema.additionalProperties === false) {
        push(`unexpected property "${key}"`);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        errors.push(...validate(child, schema.additionalProperties, `${path}.${key}`));
      }
    }
  }

  if (schema.allOf) schema.allOf.forEach((s) => errors.push(...validate(value, s, path)));
  if (schema.anyOf && !schema.anyOf.some((s) => validate(value, s, path).length === 0)) {
    push("does not match any allowed shape");
  }
  if (schema.oneOf && schema.oneOf.filter((s) => validate(value, s, path).length === 0).length !== 1) {
    push("must match exactly one allowed shape");
  }
  return errors;
}

/** Checks that a schema is something a WebMCP consumer can use, not that a value fits it. */
export function schemaProblems(schema: unknown, path = "$"): string[] {
  if (schema === undefined) return [];
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return [`${path} is not an object`];
  const s = schema as JsonSchema;
  const problems: string[] = [];
  const known = ["string", "number", "integer", "boolean", "object", "array", "null"];
  const types = s.type === undefined ? [] : Array.isArray(s.type) ? s.type : [s.type];
  for (const t of types) {
    if (!known.includes(t)) problems.push(`${path} has unknown type "${t}"`);
  }
  if (s.enum !== undefined && (!Array.isArray(s.enum) || s.enum.length === 0)) {
    problems.push(`${path}.enum is empty`);
  }
  if (s.required !== undefined) {
    if (!Array.isArray(s.required)) {
      problems.push(`${path}.required is not an array`);
    } else {
      for (const key of s.required) {
        if (!s.properties || !(key in s.properties)) problems.push(`${path}.required lists "${key}", which is not a property`);
      }
    }
  }
  if (s.pattern) {
    try {
      new RegExp(s.pattern, "u");
    } catch {
      problems.push(`${path}.pattern is not a valid regular expression`);
    }
  }
  for (const [key, child] of Object.entries(s.properties ?? {})) {
    problems.push(...schemaProblems(child, `${path}.properties.${key}`));
  }
  if (s.items) problems.push(...schemaProblems(s.items, `${path}.items`));
  return problems;
}

export function primaryType(schema: JsonSchema | undefined): string {
  if (!schema) return "string";
  if (Array.isArray(schema.type)) return schema.type.find((t) => t !== "null") ?? "string";
  if (schema.type) return schema.type;
  if (schema.properties) return "object";
  if (schema.items) return "array";
  if (Array.isArray(schema.enum) && schema.enum.length) return typeOf(schema.enum[0]);
  return "string";
}

/** Builds a plausible value for a schema, so the argument editor never starts from a blank page. */
export function exampleFor(schema: JsonSchema | undefined, depth = 0): unknown {
  if (!schema || depth > 6) return null;
  if (schema.default !== undefined) return schema.default;
  if (schema.const !== undefined) return schema.const;
  if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0];
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  const branch = schema.anyOf?.[0] ?? schema.oneOf?.[0];
  if (branch) return exampleFor(branch, depth + 1);
  switch (primaryType(schema)) {
    case "object": {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(schema.properties ?? {})) out[key] = exampleFor(child, depth + 1);
      return out;
    }
    case "array":
      return schema.items ? [exampleFor(schema.items, depth + 1)] : [];
    case "integer":
      return schema.minimum ?? 1;
    case "number":
      return schema.minimum ?? 1;
    case "boolean":
      return false;
    case "null":
      return null;
    default:
      if (schema.format === "date") return new Date().toISOString().slice(0, 10);
      if (schema.format === "date-time") return new Date().toISOString();
      if (schema.format === "time") return "12:00";
      if (schema.format === "email") return "user@example.com";
      if (schema.format === "uri" || schema.format === "url") return "https://example.com";
      return "";
  }
}

export function parseSchema(raw: unknown): JsonSchema | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as JsonSchema) : undefined;
    } catch {
      return undefined;
    }
  }
  return typeof raw === "object" ? (raw as JsonSchema) : undefined;
}
