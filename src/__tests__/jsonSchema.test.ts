import { describe, expect, it } from "vitest";
import { exampleFor, schemaProblems, validate } from "../shared/jsonSchema";

const schema = {
  type: "object",
  properties: {
    guests: { type: "integer", minimum: 1, maximum: 8 },
    date: { type: "string", format: "date" },
    seating: { type: "string", enum: ["inside", "terrace"] },
    tags: { type: "array", items: { type: "string" }, uniqueItems: true },
  },
  required: ["guests", "date"],
};

describe("validate", () => {
  it("accepts a valid value", () => {
    expect(validate({ guests: 2, date: "2026-11-20", seating: "terrace" }, schema)).toEqual([]);
  });

  it("reports every problem with its path", () => {
    const errors = validate({ guests: 0, seating: "roof", tags: ["a", "a"] }, schema);
    expect(errors.map((e) => e.path)).toEqual(expect.arrayContaining(["$", "$.guests", "$.seating", "$.tags"]));
    expect(errors.find((e) => e.message.includes('"date"'))).toBeTruthy();
  });

  it("treats integers as numbers but not the reverse", () => {
    expect(validate(2, { type: "number" })).toEqual([]);
    expect(validate(2.5, { type: "integer" })).toHaveLength(1);
  });

  it("checks formats and patterns", () => {
    expect(validate("tomorrow", { type: "string", format: "date" })).toHaveLength(1);
    expect(validate("abc", { type: "string", pattern: "^[0-9]+$" })).toHaveLength(1);
  });
});

describe("schemaProblems", () => {
  it("flags required properties that do not exist", () => {
    expect(schemaProblems({ type: "object", properties: {}, required: ["x"] })).toHaveLength(1);
  });

  it("flags unknown types and empty enums", () => {
    expect(schemaProblems({ type: "object", properties: { a: { type: "str" }, b: { enum: [] } } })).toHaveLength(2);
  });
});

describe("exampleFor", () => {
  it("builds a value that satisfies the schema", () => {
    const example = exampleFor(schema) as Record<string, unknown>;
    expect(example.seating).toBe("inside");
    expect(validate(example, schema)).toEqual([]);
  });
});
