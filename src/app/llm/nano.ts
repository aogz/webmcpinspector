import { nameMapper, type Provider, type RunOptions, type ToolSpec } from "./types";

// Chrome's built-in Prompt API (Gemini Nano). Stable since Chrome 148 on desktop; tool use is still
// behind chrome://flags/#prompt-api-tool-use, so the XML protocol below is the default.

interface NanoTool {
  name: string;
  description: string;
  inputSchema: object;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

interface NanoSession {
  prompt(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy(): void;
}

interface NanoApi {
  availability(options?: object): Promise<"available" | "downloadable" | "downloading" | "unavailable">;
  create(options?: {
    initialPrompts?: { role: "system" | "user" | "assistant"; content: string }[];
    tools?: NanoTool[];
    signal?: AbortSignal;
    monitor?: (m: EventTarget) => void;
  }): Promise<NanoSession>;
}

export function nanoApi(): NanoApi | null {
  return (globalThis as unknown as { LanguageModel?: NanoApi }).LanguageModel ?? null;
}

class StopRun extends Error {}

function xmlSystemPrompt(system: string, tools: ToolSpec[], api: (n: string) => string) {
  const list = tools.length
    ? tools.map((t) => `- ${api(t.name)}: ${t.description || "No description"}\n  Input schema: ${JSON.stringify(t.inputSchema)}`).join("\n\n")
    : "(No tools are available.)";
  return `${system}

Available tools:
${list}

To call a tool, reply with exactly:
<tool_call>{"name": "tool_name", "args": {"param": "value"}}</tool_call>

Match each parameter's type: numbers and booleans without quotes, enum values exactly as listed, dates in the format the schema asks for. After a tool runs you get its result; call another tool or answer briefly.`;
}

function parseToolCall(text: string): { name: string; args: Record<string, unknown> } | null {
  const match = text.match(/<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    return typeof parsed.name === "string" ? { name: parsed.name, args: parsed.args ?? {} } : null;
  } catch {
    return null;
  }
}

async function runXml(o: RunOptions, api: NanoApi) {
  const names = nameMapper(o.tools);
  const session = await api.create({
    initialPrompts: [{ role: "system", content: xmlSystemPrompt(o.system, o.tools, names.api) }],
    signal: o.signal,
  });
  try {
    let input = o.prompt;
    for (let turn = 0; turn < o.maxTurns; turn++) {
      const reply = await session.prompt(input, { signal: o.signal });
      const call = parseToolCall(reply);
      const text = reply.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trim();
      if (text) o.onStep({ kind: "text", text });
      if (!call) return;
      const toolName = names.page(call.name);
      o.onStep({ kind: "tool_call", toolName, args: call.args });
      const outcome = await o.executeTool(toolName, call.args);
      if (!outcome) return;
      input = outcome.ok
        ? `Tool "${call.name}" returned:\n${outcome.content}\n\nContinue.`
        : `Tool "${call.name}" failed: ${outcome.content}\n\nTell the user and suggest what to do.`;
    }
    o.onStep({ kind: "error", text: `Stopped after ${o.maxTurns} turns.` });
  } finally {
    session.destroy();
  }
}

/** Native tool use: the model calls execute() itself, so the loop lives inside one prompt() call. */
async function runNative(o: RunOptions, api: NanoApi) {
  const names = nameMapper(o.tools);
  const tools: NanoTool[] = o.tools.map((t) => ({
    name: names.api(t.name),
    description: t.description || t.name,
    inputSchema: t.inputSchema,
    execute: async (args) => {
      const toolName = names.page(t.name);
      o.onStep({ kind: "tool_call", toolName, args: args ?? {} });
      const outcome = await o.executeTool(toolName, args ?? {});
      if (!outcome) throw new StopRun();
      return outcome.ok ? outcome.content : `Error: ${outcome.content}`;
    },
  }));
  const session = await api.create({ initialPrompts: [{ role: "system", content: o.system }], tools, signal: o.signal });
  try {
    const reply = await session.prompt(o.prompt, { signal: o.signal });
    if (reply.trim()) o.onStep({ kind: "text", text: reply });
  } catch (err) {
    if (!(err instanceof StopRun)) throw err;
  } finally {
    session.destroy();
  }
}

export function makeNanoProvider(native: boolean): Provider {
  return {
    id: "nano",
    label: "Gemini Nano (on-device)",
    needsKey: false,
    keyHint: "",
    models: ["gemini-nano"],
    freeModel: false,
    run: async (o) => {
      const api = nanoApi();
      if (!api) throw new Error("This browser has no Prompt API. Use Chrome 148 or later on desktop.");
      if (native) {
        try {
          await runNative(o, api);
          return;
        } catch (err) {
          if (!(err instanceof TypeError)) throw err;
          o.onStep({ kind: "error", text: "Native tool use is not enabled (chrome://flags/#prompt-api-tool-use); using the text protocol." });
        }
      }
      await runXml(o, api);
    },
  };
}
