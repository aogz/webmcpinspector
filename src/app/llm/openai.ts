import { nameMapper, objectSchema, type Provider, type RunOptions } from "./types";

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

async function run(o: RunOptions) {
  const names = nameMapper(o.tools);
  const tools = o.tools.map((t) => ({
    type: "function",
    function: { name: names.api(t.name), description: t.description || t.name, parameters: objectSchema(t.inputSchema) },
  }));
  const messages: ChatMessage[] = [
    { role: "system", content: o.system },
    { role: "user", content: o.prompt },
  ];
  for (let turn = 0; turn < o.maxTurns; turn++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: o.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${o.apiKey}` },
      body: JSON.stringify({ model: o.model, messages, tools: tools.length ? tools : undefined }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? `OpenAI returned ${res.status}`);
    const message = data.choices?.[0]?.message as ChatMessage | undefined;
    if (!message) throw new Error("OpenAI returned no message.");
    if (message.content?.trim()) o.onStep({ kind: "text", text: message.content });
    const calls = message.tool_calls ?? [];
    if (!calls.length) return;
    messages.push(message);
    for (const call of calls) {
      const toolName = names.page(call.function.name);
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }
      o.onStep({ kind: "tool_call", toolName, args });
      const outcome = await o.executeTool(toolName, args);
      if (!outcome) return;
      messages.push({ role: "tool", tool_call_id: call.id, content: outcome.ok ? outcome.content : `Error: ${outcome.content}` });
    }
  }
  o.onStep({ kind: "error", text: `Stopped after ${o.maxTurns} turns.` });
}

export const openaiProvider: Provider = {
  id: "openai",
  label: "OpenAI API",
  needsKey: true,
  keyHint: "sk-…",
  models: ["gpt-5"],
  freeModel: true,
  run,
};
