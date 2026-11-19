import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam, BetaToolResultBlockParam, BetaToolUseBlock } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { nameMapper, objectSchema, type Provider, type RunOptions } from "./types";

// Haiku has no server-side refusal fallback; the others fall back by refusal category.
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

async function run(o: RunOptions) {
  // The key is the visitor's own, typed into this page and sent only to Anthropic.
  const client = new Anthropic({ apiKey: o.apiKey, dangerouslyAllowBrowser: true });
  const names = nameMapper(o.tools);
  const tools = o.tools.map((t) => ({
    name: names.api(t.name),
    description: t.description || t.name,
    input_schema: objectSchema(t.inputSchema) as Anthropic.Messages.Tool.InputSchema,
  }));
  const messages: BetaMessageParam[] = [{ role: "user", content: o.prompt }];
  const fallback = FALLBACK_MODELS.has(o.model);

  for (let turn = 0; turn < o.maxTurns; turn++) {
    const response = await client.beta.messages.create(
      {
        model: o.model,
        max_tokens: 16000,
        system: o.system,
        tools,
        messages,
        ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      },
      { signal: o.signal },
    );
    if (response.stop_reason === "refusal") {
      o.onStep({ kind: "error", text: `The model declined${response.stop_details?.category ? ` (${response.stop_details.category})` : ""}.` });
      return;
    }
    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) o.onStep({ kind: "text", text: block.text });
    }
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    const calls = response.content.filter((b): b is BetaToolUseBlock => b.type === "tool_use");
    if (!calls.length) {
      if (response.stop_reason === "max_tokens") o.onStep({ kind: "error", text: "The reply hit max_tokens." });
      return;
    }
    messages.push({ role: "assistant", content: response.content });
    const results: BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      const toolName = names.page(call.name);
      const args = (call.input ?? {}) as Record<string, unknown>;
      o.onStep({ kind: "tool_call", toolName, args });
      const outcome = await o.executeTool(toolName, args);
      if (!outcome) return;
      results.push({ type: "tool_result", tool_use_id: call.id, content: outcome.content, is_error: !outcome.ok });
    }
    messages.push({ role: "user", content: results });
  }
  o.onStep({ kind: "error", text: `Stopped after ${o.maxTurns} turns.` });
}

export const anthropicProvider: Provider = {
  id: "anthropic",
  label: "Claude (Anthropic API)",
  needsKey: true,
  keyHint: "sk-ant-…",
  models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
  freeModel: false,
  run,
};
