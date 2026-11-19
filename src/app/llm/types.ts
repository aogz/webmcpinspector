import type { JsonSchema } from "../../shared/types";

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

export type Step =
  | { kind: "text"; text: string }
  | { kind: "tool_call"; toolName: string; args: Record<string, unknown> }
  | { kind: "tool_result"; toolName: string; ok: boolean; content: string; injected?: boolean }
  | { kind: "error"; text: string };

export interface ToolExecution {
  ok: boolean;
  content: string;
}

export interface RunOptions {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  tools: ToolSpec[];
  maxTurns: number;
  signal: AbortSignal;
  onStep: (step: Step) => void;
  /** Returning null stops the run before the tool runs, which evals use to grade the choice alone. */
  executeTool: (name: string, args: Record<string, unknown>) => Promise<ToolExecution | null>;
}

export interface Provider {
  id: "nano" | "anthropic" | "openai" | "gemini";
  label: string;
  needsKey: boolean;
  keyHint: string;
  models: string[];
  freeModel: boolean;
  run(options: RunOptions): Promise<void>;
}

/** Tool names in model APIs are stricter than WebMCP's; map both ways so calls reach the right tool. */
export function nameMapper(tools: ToolSpec[]) {
  const toApi = new Map<string, string>();
  const fromApi = new Map<string, string>();
  for (const tool of tools) {
    let safe = tool.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "tool";
    while (fromApi.has(safe)) safe = `${safe.slice(0, 60)}_${fromApi.size}`;
    toApi.set(tool.name, safe);
    fromApi.set(safe, tool.name);
  }
  return {
    api: (name: string) => toApi.get(name) ?? name,
    page: (name: string) => fromApi.get(name) ?? name,
  };
}

export function objectSchema(schema: JsonSchema | undefined): JsonSchema {
  if (schema && (schema.type === "object" || schema.properties)) return { ...schema, type: "object" };
  return { type: "object", properties: {} };
}
