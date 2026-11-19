import type { JsonSchema } from "../../shared/types";
import { nameMapper, objectSchema, type Provider, type RunOptions } from "./types";

const KEEP = new Set(["type", "description", "properties", "required", "items", "enum", "minimum", "maximum", "minItems", "maxItems", "nullable"]);

/** Gemini accepts an OpenAPI subset of JSON Schema and rejects unknown keywords. */
function toGeminiSchema(schema: JsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (!KEEP.has(key)) continue;
    if (key === "type" && Array.isArray(value)) {
      const types = value.filter((t) => t !== "null");
      out.type = types[0] ?? "string";
      if (types.length !== value.length) out.nullable = true;
    } else if (key === "properties") {
      out.properties = Object.fromEntries(
        Object.entries(value as Record<string, JsonSchema>).map(([k, v]) => [k, toGeminiSchema(v)]),
      );
    } else if (key === "items") {
      out.items = toGeminiSchema(value as JsonSchema);
    } else if (key === "enum") {
      out.enum = (value as unknown[]).map(String);
    } else {
      out[key] = value;
    }
  }
  if (schema.format === "date-time" || schema.format === "enum") out.format = schema.format;
  return out;
}

interface Part {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

async function run(o: RunOptions) {
  const names = nameMapper(o.tools);
  const declarations = o.tools.map((t) => ({
    name: names.api(t.name),
    description: t.description || t.name,
    parameters: toGeminiSchema(objectSchema(t.inputSchema)),
  }));
  const contents: { role: "user" | "model"; parts: Part[] }[] = [{ role: "user", parts: [{ text: o.prompt }] }];
  for (let turn = 0; turn < o.maxTurns; turn++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(o.model)}:generateContent`,
      {
        method: "POST",
        signal: o.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": o.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: o.system }] },
          contents,
          tools: declarations.length ? [{ functionDeclarations: declarations }] : undefined,
        }),
      },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? `Gemini returned ${res.status}`);
    const parts: Part[] = data.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) if (part.text?.trim()) o.onStep({ kind: "text", text: part.text });
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) return;
    contents.push({ role: "model", parts });
    const responses: Part[] = [];
    for (const part of calls) {
      const toolName = names.page(part.functionCall!.name);
      const args = part.functionCall!.args ?? {};
      o.onStep({ kind: "tool_call", toolName, args });
      const outcome = await o.executeTool(toolName, args);
      if (!outcome) return;
      responses.push({
        functionResponse: { name: part.functionCall!.name, response: outcome.ok ? { result: outcome.content } : { error: outcome.content } },
      });
    }
    contents.push({ role: "user", parts: responses });
  }
  o.onStep({ kind: "error", text: `Stopped after ${o.maxTurns} turns.` });
}

export const geminiProvider: Provider = {
  id: "gemini",
  label: "Gemini API",
  needsKey: true,
  keyHint: "AIza…",
  models: ["gemini-3.6-flash"],
  freeModel: true,
  run,
};
